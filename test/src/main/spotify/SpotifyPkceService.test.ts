import { describe, expect, it } from 'vitest';
import { SpotifyPkceService } from '@main/spotify/auth/SpotifyPkceService';

describe('SpotifyPkceService', () => {
  it('should generate valid PKCE credentials', () => {
    const creds = SpotifyPkceService.generatePkceCredentials();

    expect(creds.codeVerifier).toBeDefined();
    expect(creds.codeVerifier.length).toBeGreaterThan(40);
    expect(creds.codeChallenge).toBeDefined();
    expect(creds.codeChallenge.length).toBeGreaterThan(20);
    expect(creds.state).toBeDefined();
    expect(creds.state.length).toBeGreaterThan(20);
  });

  it('should build authorize URL with all necessary params', () => {
    const url = SpotifyPkceService.buildAuthorizeUrl({
      clientId: 'test-client-id-123',
      redirectUri: 'http://127.0.0.1:43821/callback',
      codeChallenge: 'challenge-abc',
      state: 'state-xyz',
      scopes: ['playlist-read-private', 'user-read-private']
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://accounts.spotify.com');
    expect(parsed.pathname).toBe('/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:43821/callback');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge-abc');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe('state-xyz');
    expect(parsed.searchParams.get('scope')).toBe('playlist-read-private user-read-private');
  });
});
