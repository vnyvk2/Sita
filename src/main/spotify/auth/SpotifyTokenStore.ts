import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { safeStorage } from 'electron';

import { db } from '../../db/db';
import { spotifyIntegrations } from '../../db/schema';
import logger from '../../logger';
import { decrypt as fallbackDecrypt } from '../../utils/safeStorage';
import { SpotifyPkceService } from './SpotifyPkceService';
import type { SpotifyAuthTokens, SpotifyTokenRecord } from './types';

export class SpotifyTokenStore {
  // Concurrency guard keyed by user ID to prevent parallel token refresh requests from racing
  private static refreshPromises = new Map<string, Promise<string | null>>();

  /**
   * Derives a 32-byte encryption key from the environment secret without hardcoded production keys.
   */
  private static getDerivedKey(): Buffer {
    const secret =
      (typeof import.meta !== 'undefined' && import.meta.env?.MAIN_VITE_ENCRYPTION_SECRET) ||
      process.env.MAIN_VITE_ENCRYPTION_SECRET;

    if (!secret) {
      throw new Error('No encryption secret configured. Please set MAIN_VITE_ENCRYPTION_SECRET.');
    }
    return crypto.scryptSync(secret, 'nora_spotify_salt_gcm', 32);
  }

  /**
   * Encrypts sensitive token text using OS-level safeStorage if available,
   * falling back to authenticated AES-256-GCM with tamper verification.
   */
  public static encryptToken(token: string): string {
    try {
      if (typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token);
        return `os:${encrypted.toString('hex')}`;
      }
    } catch (err) {
      logger.debug('OS safeStorage unavailable for encryption, using authenticated AES-GCM', { err });
    }

    // Authenticated AES-256-GCM Fallback
    const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
    const key = this.getDerivedKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(token, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `aes-gcm:${iv.toString('hex')}:${authTag}:${ciphertext}`;
  }

  /**
   * Decrypts token text with authenticated integrity verification and legacy AES-CBC migration support.
   */
  public static decryptToken(encryptedString: string): string {
    if (encryptedString.startsWith('os:')) {
      const hex = encryptedString.slice(3);
      const buffer = Buffer.from(hex, 'hex');
      return safeStorage.decryptString(buffer);
    }

    if (encryptedString.startsWith('aes-gcm:')) {
      const parts = encryptedString.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid authenticated AES-GCM ciphertext payload');
      }
      const [, ivHex, tagHex, ciphertextHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const key = this.getDerivedKey();

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    if (encryptedString.startsWith('aes:')) {
      // Transparent backward compatibility with legacy AES-256-CBC payloads
      const data = encryptedString.slice(4);
      return fallbackDecrypt(data);
    }

    // Direct fallback for legacy un-prefixed records
    return fallbackDecrypt(encryptedString);
  }

  /**
   * Persists or updates the single active Spotify integration record inside an atomic database transaction.
   */
  public static async saveTokens(options: {
    user: {
      spotifyUserId: string;
      displayName?: string | null;
      email?: string | null;
      product?: string | null;
    };
    tokens: SpotifyAuthTokens;
  }): Promise<SpotifyTokenRecord> {
    const encryptedAccess = this.encryptToken(options.tokens.accessToken);
    const encryptedRefresh = this.encryptToken(options.tokens.refreshToken);
    const tokenExpiresAt = new Date(Date.now() + options.tokens.expiresIn * 1000);
    const scopes = options.tokens.scope ? options.tokens.scope.split(' ') : [];

    return await db.transaction(async (tx) => {
      // Enforce single active account invariant: wipe existing rows
      await tx.delete(spotifyIntegrations);

      const inserted = await tx
        .insert(spotifyIntegrations)
        .values({
          spotifyUserId: options.user.spotifyUserId,
          displayName: options.user.displayName,
          email: options.user.email,
          product: options.user.product,
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedRefresh,
          tokenExpiresAt,
          scopes
        })
        .returning({ id: spotifyIntegrations.id });

      return {
        id: inserted[0].id,
        spotifyUserId: options.user.spotifyUserId,
        displayName: options.user.displayName ?? null,
        email: options.user.email ?? null,
        product: options.user.product ?? null,
        accessToken: options.tokens.accessToken,
        refreshToken: options.tokens.refreshToken,
        tokenExpiresAt,
        scopes
      };
    });
  }

  /**
   * Retrieves the currently active Spotify integration record.
   */
  public static async getActiveIntegration(): Promise<SpotifyTokenRecord | null> {
    const rows = await db.select().from(spotifyIntegrations).limit(1);
    if (rows.length === 0) return null;

    const row = rows[0];
    try {
      const accessToken = this.decryptToken(row.encryptedAccessToken);
      const refreshToken = this.decryptToken(row.encryptedRefreshToken);

      // Transparent ciphertext migration: if stored using legacy aes: or unprefixed, upgrade in-place
      const isLegacyAccess =
        !row.encryptedAccessToken.startsWith('os:') &&
        !row.encryptedAccessToken.startsWith('aes-gcm:');
      const isLegacyRefresh =
        !row.encryptedRefreshToken.startsWith('os:') &&
        !row.encryptedRefreshToken.startsWith('aes-gcm:');

      if (isLegacyAccess || isLegacyRefresh) {
        const modernEncryptedAccess = isLegacyAccess
          ? this.encryptToken(accessToken)
          : row.encryptedAccessToken;
        const modernEncryptedRefresh = isLegacyRefresh
          ? this.encryptToken(refreshToken)
          : row.encryptedRefreshToken;

        void db
          .update(spotifyIntegrations)
          .set({
            encryptedAccessToken: modernEncryptedAccess,
            encryptedRefreshToken: modernEncryptedRefresh,
            updatedAt: new Date()
          })
          .where(eq(spotifyIntegrations.id, row.id))
          .then(() => {
            logger.info('Migrated legacy Spotify tokens to modern authenticated ciphertext', {
              userId: row.spotifyUserId
            });
          })
          .catch((err) => {
            logger.warn(
              'Failed to asynchronously upgrade legacy Spotify token ciphertext in DB',
              { err }
            );
          });
      }

      return {
        id: row.id,
        spotifyUserId: row.spotifyUserId,
        displayName: row.displayName,
        email: row.email,
        product: row.product,
        accessToken,
        refreshToken,
        tokenExpiresAt: new Date(row.tokenExpiresAt),
        scopes: (row.scopes as string[]) ?? []
      };
    } catch (error) {
      logger.error('Failed to decrypt Spotify tokens from database', { error });
      return null;
    }
  }

  /**
   * Gets a valid, non-expired access token, transparently refreshing if needed.
   * Concurrency-safe: multiple parallel callers for the same account share the in-flight refresh promise.
   */
  public static async getValidAccessToken(clientId: string): Promise<string | null> {
    const integration = await this.getActiveIntegration();
    if (!integration) return null;

    // If token has at least 60 seconds of validity remaining, return immediately
    const now = Date.now();
    const expiry = integration.tokenExpiresAt.getTime();
    if (expiry - now > 60000) {
      return integration.accessToken;
    }

    const userId = integration.spotifyUserId;
    const inFlight = this.refreshPromises.get(userId);
    if (inFlight) {
      return await inFlight;
    }

    const refreshPromise = (async () => {
      try {
        logger.info('Spotify access token expired or expiring soon, refreshing...', { userId });
        const refreshed = await SpotifyPkceService.refreshAccessToken({
          clientId,
          refreshToken: integration.refreshToken
        });

        const newRefreshToken = refreshed.refreshToken ?? integration.refreshToken;
        const encryptedAccess = this.encryptToken(refreshed.accessToken);
        const encryptedRefresh = this.encryptToken(newRefreshToken);
        const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

        await db
          .update(spotifyIntegrations)
          .set({
            encryptedAccessToken: encryptedAccess,
            encryptedRefreshToken: encryptedRefresh,
            tokenExpiresAt,
            updatedAt: new Date()
          })
          .where(eq(spotifyIntegrations.id, integration.id));

        return refreshed.accessToken;
      } catch (error) {
        logger.error('Failed to refresh Spotify access token', { error, userId });
        return null;
      } finally {
        this.refreshPromises.delete(userId);
      }
    })();

    this.refreshPromises.set(userId, refreshPromise);
    return await refreshPromise;
  }

  /**
   * Clears the stored Spotify integration upon user disconnect.
   */
  public static async clearIntegration(): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(spotifyIntegrations);
    });
    this.refreshPromises.clear();
    logger.info('Spotify integration disconnected and tokens deleted.');
  }
}
