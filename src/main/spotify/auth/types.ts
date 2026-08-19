export interface SpotifyAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
  receivedAt: number;
}

export interface SpotifyTokenRecord {
  id: number;
  spotifyUserId: string;
  displayName: string | null;
  email: string | null;
  product: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
}

export interface SpotifyAuthStatus {
  isConnected: boolean;
  user: {
    spotifyUserId: string;
    displayName: string | null;
    email: string | null;
    product: string | null;
  } | null;
}

export interface PkceCredentials {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}
