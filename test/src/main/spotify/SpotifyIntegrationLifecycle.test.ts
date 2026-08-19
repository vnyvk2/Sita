import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IHttpClient } from '@main/platform/networking/IHttpClient';
import { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import { SpotifyApiClient } from '@main/spotify/api/SpotifyApiClient';
import { SpotifyPkceService } from '@main/spotify/auth/SpotifyPkceService';
import { SpotifyTokenStore } from '@main/spotify/auth/SpotifyTokenStore';

describe('Spotify Integration End-to-End Lifecycle', () => {
  beforeEach(async () => {
    await SpotifyTokenStore.clearIntegration();
    vi.restoreAllMocks();
  });

  it('should complete the entire connect -> persist -> api call -> disconnect lifecycle', async () => {
    // 1. Generate PKCE
    const pkce = SpotifyPkceService.generatePkceCredentials();
    expect(pkce.codeVerifier).toBeDefined();

    // 2. Mock token exchange
    vi.spyOn(SpotifyPkceService, 'exchangeCodeForTokens').mockResolvedValue({
      accessToken: 'test-lifecycle-access-token',
      refreshToken: 'test-lifecycle-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'playlist-read-private playlist-read-collaborative user-read-private',
      receivedAt: Date.now()
    });

    const tokens = await SpotifyPkceService.exchangeCodeForTokens({
      clientId: 'test-client',
      code: 'auth-code-123',
      redirectUri: 'http://127.0.0.1:43821/callback',
      codeVerifier: pkce.codeVerifier
    });

    // 3. Mock /me API call
    const mockHttpClient: IHttpClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          id: 'spotify_user_999',
          display_name: 'Vinay',
          email: 'vinay@example.com',
          product: 'premium'
        },
        url: 'https://api.spotify.com/v1/me'
      })
    };

    const pipeline = new RequestPipeline({ client: mockHttpClient });
    const apiClient = new SpotifyApiClient(pipeline);
    const userProfile = await apiClient.getCurrentUser(tokens.accessToken);

    // 4. Save to Token Store
    const record = await SpotifyTokenStore.saveTokens({
      user: {
        spotifyUserId: userProfile.id,
        displayName: userProfile.displayName,
        email: userProfile.email,
        product: userProfile.product
      },
      tokens
    });

    expect(record.spotifyUserId).toBe('spotify_user_999');

    // 5. Query active integration & token validity
    const active = await SpotifyTokenStore.getActiveIntegration();
    expect(active?.spotifyUserId).toBe('spotify_user_999');
    expect(active?.accessToken).toBe('test-lifecycle-access-token');

    const validToken = await SpotifyTokenStore.getValidAccessToken('test-client');
    expect(validToken).toBe('test-lifecycle-access-token');

    // 6. Clear integration (Disconnect)
    await SpotifyTokenStore.clearIntegration();
    const disconnected = await SpotifyTokenStore.getActiveIntegration();
    expect(disconnected).toBeNull();
  });
});
