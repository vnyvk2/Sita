import { db } from '@main/db/db';
import { spotifyIntegrations } from '@main/db/schema';
import { SpotifyPkceService } from '@main/spotify/auth/SpotifyPkceService';
import { SpotifyTokenStore } from '@main/spotify/auth/SpotifyTokenStore';
import { encrypt as legacyEncrypt } from '@main/utils/safeStorage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SpotifyTokenStore (Security, Legacy Migration & Account Mutex)', () => {
  beforeEach(async () => {
    await SpotifyTokenStore.clearIntegration();
    vi.restoreAllMocks();
  });

  it('should encrypt and decrypt using authenticated AES-GCM and reject tampered ciphertext', () => {
    const rawToken = 'BQB_super_secret_spotify_refresh_token_12345';
    const encrypted = SpotifyTokenStore.encryptToken(rawToken);

    // Verify format: either OS-safeStorage or authenticated AES-GCM
    expect(encrypted).toMatch(/^(os:|aes-gcm:)/);

    // Decrypt should return original
    const decrypted = SpotifyTokenStore.decryptToken(encrypted);
    expect(decrypted).toBe(rawToken);

    // Adversarial tampering test: modifying ciphertext or auth tag must throw
    if (encrypted.startsWith('aes-gcm:')) {
      const parts = encrypted.split(':');
      // Tamper with ciphertext by flipping characters
      parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('0') ? '1' : '0');
      const tampered = parts.join(':');

      expect(() => SpotifyTokenStore.decryptToken(tampered)).toThrow();
    }
  });

  it('should transparently decrypt legacy aes: (AES-256-CBC) encrypted tokens for migration', () => {
    const rawLegacyToken = 'legacy_refresh_token_from_previous_nora_version_98765';
    const legacyEncryptedString = `aes:${legacyEncrypt(rawLegacyToken)}`;

    // Must successfully decrypt without throwing
    const decrypted = SpotifyTokenStore.decryptToken(legacyEncryptedString);
    expect(decrypted).toBe(rawLegacyToken);
  });

  it('should automatically upgrade legacy aes: database records to modern ciphertext on read', async () => {
    const rawLegacyAccess = 'legacy-access-token-111';
    const rawLegacyRefresh = 'legacy-refresh-token-222';
    const legacyEncAccess = `aes:${legacyEncrypt(rawLegacyAccess)}`;
    const legacyEncRefresh = `aes:${legacyEncrypt(rawLegacyRefresh)}`;

    // Insert legacy record directly into db
    await db.insert(spotifyIntegrations).values({
      spotifyUserId: 'user-legacy-upgrade',
      displayName: 'Legacy User',
      encryptedAccessToken: legacyEncAccess,
      encryptedRefreshToken: legacyEncRefresh,
      tokenExpiresAt: new Date(Date.now() + 3600000),
      scopes: ['playlist-read-private']
    });

    // Calling getActiveIntegration should decrypt and trigger background upgrade
    const active = await SpotifyTokenStore.getActiveIntegration();
    expect(active).not.toBeNull();
    expect(active?.accessToken).toBe(rawLegacyAccess);
    expect(active?.refreshToken).toBe(rawLegacyRefresh);

    // Allow async task to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify database row now has modern ciphertext prefix
    const rows = await db.select().from(spotifyIntegrations).limit(1);
    expect(rows[0].encryptedAccessToken).toMatch(/^(os:|aes-gcm:)/);
    expect(rows[0].encryptedRefreshToken).toMatch(/^(os:|aes-gcm:)/);
  });

  it('should transactionally save and retrieve single active Spotify integration', async () => {
    const tokens = {
      accessToken: 'access-token-abc',
      refreshToken: 'refresh-token-xyz',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'playlist-read-private user-read-private',
      receivedAt: Date.now()
    };

    const user = {
      spotifyUserId: 'user-vinay-123',
      displayName: 'Vinay',
      email: 'vinay@example.com',
      product: 'premium'
    };

    const saved = await SpotifyTokenStore.saveTokens({ user, tokens });
    expect(saved.spotifyUserId).toBe('user-vinay-123');
    expect(saved.displayName).toBe('Vinay');

    const active = await SpotifyTokenStore.getActiveIntegration();
    expect(active).not.toBeNull();
    expect(active?.spotifyUserId).toBe('user-vinay-123');
    expect(active?.accessToken).toBe('access-token-abc');
    expect(active?.refreshToken).toBe('refresh-token-xyz');
    expect(active?.scopes).toContain('playlist-read-private');
  });

  it('should deduplicate concurrent token refresh calls per account to prevent token rotation races', async () => {
    // Save an expired token
    const tokens = {
      accessToken: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      expiresIn: -100, // Expired in the past
      tokenType: 'Bearer',
      scope: 'playlist-read-private',
      receivedAt: Date.now() - 3600000
    };

    await SpotifyTokenStore.saveTokens({
      user: { spotifyUserId: 'user-refresh-test' },
      tokens
    });

    const refreshSpy = vi
      .spyOn(SpotifyPkceService, 'refreshAccessToken')
      .mockImplementation(async () => {
        // Add small async delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          accessToken: 'new-refreshed-token-999',
          refreshToken: 'new-refreshed-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
          scope: 'playlist-read-private',
          receivedAt: Date.now()
        };
      });

    // Fire 5 concurrent getValidAccessToken requests for the same account
    const results = await Promise.all([
      SpotifyTokenStore.getValidAccessToken('client-id'),
      SpotifyTokenStore.getValidAccessToken('client-id'),
      SpotifyTokenStore.getValidAccessToken('client-id'),
      SpotifyTokenStore.getValidAccessToken('client-id'),
      SpotifyTokenStore.getValidAccessToken('client-id')
    ]);

    // All 5 concurrent callers must receive the exact same refreshed token
    for (const token of results) {
      expect(token).toBe('new-refreshed-token-999');
    }

    // Crucial invariant: SpotifyPkceService.refreshAccessToken was called EXACTLY ONCE
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('should clear integration on disconnect', async () => {
    await SpotifyTokenStore.saveTokens({
      user: { spotifyUserId: 'user-to-disconnect' },
      tokens: {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: 'playlist-read-private',
        receivedAt: Date.now()
      }
    });

    // Verify integration exists
    let active = await SpotifyTokenStore.getActiveIntegration();
    expect(active).not.toBeNull();
    expect(active?.spotifyUserId).toBe('user-to-disconnect');

    // Perform disconnect
    await SpotifyTokenStore.clearIntegration();

    // Verify integration is completely purged
    active = await SpotifyTokenStore.getActiveIntegration();
    expect(active).toBeNull();
  });

  it('should safely handle clearIntegration during an active refresh operation without deadlock', async () => {
    await SpotifyTokenStore.saveTokens({
      user: { spotifyUserId: 'user-race-disconnect' },
      tokens: {
        accessToken: 'expired-access-token',
        refreshToken: 'refresh-token-active',
        expiresIn: -100,
        tokenType: 'Bearer',
        scope: 'playlist-read-private',
        receivedAt: Date.now() - 7200000
      }
    });

    vi.spyOn(SpotifyPkceService, 'refreshAccessToken').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        accessToken: 'fresh-token',
        refreshToken: 'fresh-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: 'playlist-read-private',
        receivedAt: Date.now()
      };
    });

    // Start refresh and disconnect concurrently
    const refreshPromise = SpotifyTokenStore.getValidAccessToken('client-id');
    const disconnectPromise = SpotifyTokenStore.clearIntegration();

    await Promise.all([refreshPromise, disconnectPromise]);

    const active = await SpotifyTokenStore.getActiveIntegration();
    expect(active).toBeNull();
  });
});
