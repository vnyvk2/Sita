import crypto from 'crypto';

import type { PkceCredentials, SpotifyAuthTokens } from './types';

export const SPOTIFY_ACCOUNTS_BASE_URL = 'https://accounts.spotify.com';
export const DEFAULT_SPOTIFY_READ_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private'
];

export class SpotifyPkceService {
  /** Generates cryptographically secure PKCE credentials (verifier, S256 challenge, and CSRF state). */
  public static generatePkceCredentials(): PkceCredentials {
    const codeVerifier = this.base64UrlEncode(crypto.randomBytes(64));
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.base64UrlEncode(hash);
    const state = this.base64UrlEncode(crypto.randomBytes(32));

    return {
      codeVerifier,
      codeChallenge,
      state
    };
  }

  /** Builds the Spotify OAuth 2.0 authorization URL. */
  public static buildAuthorizeUrl(options: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    scopes?: string[];
  }): string {
    const scopes = options.scopes ?? DEFAULT_SPOTIFY_READ_SCOPES;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: options.clientId,
      scope: scopes.join(' '),
      redirect_uri: options.redirectUri,
      state: options.state,
      code_challenge_method: 'S256',
      code_challenge: options.codeChallenge
    });

    return `${SPOTIFY_ACCOUNTS_BASE_URL}/authorize?${params.toString()}`;
  }

  /** Exchanges an authorization code and PKCE code_verifier for access and refresh tokens. */
  public static async exchangeCodeForTokens(options: {
    clientId: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<SpotifyAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      code_verifier: options.codeVerifier
    });

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Spotify token exchange failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
      receivedAt: Date.now()
    };
  }

  /** Refreshes an expired access token using the stored refresh token. */
  public static async refreshAccessToken(options: {
    clientId: string;
    refreshToken: string;
  }): Promise<Omit<SpotifyAuthTokens, 'refreshToken'> & { refreshToken?: string }> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      client_id: options.clientId
    });

    const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Spotify token refresh failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
      receivedAt: Date.now()
    };
  }

  private static base64UrlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
