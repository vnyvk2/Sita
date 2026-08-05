import type { HttpRequestOptions } from './IHttpClient';

export type AuthType = 'none' | 'api-key-header' | 'api-key-query' | 'bearer' | 'basic' | 'custom';

export interface AuthCredentials {
  type: AuthType;
  apiKey?: string;
  apiKeyHeaderName?: string;
  apiKeyQueryParamName?: string;
  token?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
}

export class Authenticator {
  private readonly credentials: AuthCredentials;

  constructor(credentials?: AuthCredentials) {
    this.credentials = credentials ?? { type: 'none' };
  }

  public applyAuthentication(options: HttpRequestOptions): HttpRequestOptions {
    if (this.credentials.type === 'none') {
      return options;
    }

    const headers: Record<string, string> = { ...options.headers };
    const params: Record<string, string | number | boolean | undefined> = { ...options.params };

    switch (this.credentials.type) {
      case 'api-key-header': {
        const headerName = this.credentials.apiKeyHeaderName ?? 'X-API-Key';
        if (this.credentials.apiKey) {
          headers[headerName] = this.credentials.apiKey;
        }
        break;
      }

      case 'api-key-query': {
        const paramName = this.credentials.apiKeyQueryParamName ?? 'api_key';
        if (this.credentials.apiKey) {
          params[paramName] = this.credentials.apiKey;
        }
        break;
      }

      case 'bearer': {
        if (this.credentials.token) {
          headers['Authorization'] = `Bearer ${this.credentials.token}`;
        }
        break;
      }

      case 'basic': {
        if (this.credentials.username || this.credentials.password) {
          const userPass = `${this.credentials.username ?? ''}:${this.credentials.password ?? ''}`;
          const encoded = Buffer.from(userPass).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
      }

      case 'custom': {
        if (this.credentials.customHeaders) {
          Object.assign(headers, this.credentials.customHeaders);
        }
        break;
      }
    }

    return {
      ...options,
      headers,
      params
    };
  }
}
