import { describe, expect, it } from 'vitest';

import { HttpError } from '../FetchHttpClient';
import type { HttpRequestOptions, HttpResponse, IHttpClient } from '../IHttpClient';
import { RateLimiter } from '../RateLimiter';
import { RequestPipeline } from '../RequestPipeline';
import { RetryPolicy } from '../RetryPolicy';

class MockHttpClient implements IHttpClient {
  public calls: HttpRequestOptions[] = [];
  public mockResponse: HttpResponse<unknown> = {
    data: { success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    url: 'https://api.example.com/test'
  };
  public shouldFailCount = 0;
  public failStatus = 503;

  public async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    this.calls.push(options);

    if (this.shouldFailCount > 0) {
      this.shouldFailCount -= 1;
      throw new HttpError(this.failStatus, 'Service Unavailable', options.url);
    }

    return this.mockResponse as HttpResponse<T>;
  }

  public async get<T = unknown>(
    url: string,
    options?: Omit<HttpRequestOptions, 'url' | 'method'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'GET' });
  }

  public async post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'POST', body });
  }
}

describe('Platform Networking — RequestPipeline & Utilities', () => {
  it('authenticates requests using Bearer token', async () => {
    const mockClient = new MockHttpClient();
    const pipeline = new RequestPipeline({
      client: mockClient,
      authCredentials: { type: 'bearer', token: 'secret-token-123' }
    });

    const res = await pipeline.execute({ url: 'https://api.example.com/data' });
    expect(res.status).toBe(200);
    expect(mockClient.calls[0].headers?.['Authorization']).toBe('Bearer secret-token-123');
  });

  it('authenticates requests using API Key in query params', async () => {
    const mockClient = new MockHttpClient();
    const pipeline = new RequestPipeline({
      client: mockClient,
      authCredentials: { type: 'api-key-query', apiKey: 'key-999', apiKeyQueryParamName: 'apikey' }
    });

    await pipeline.execute({ url: 'https://api.example.com/data' });
    expect(mockClient.calls[0].params?.['apikey']).toBe('key-999');
  });

  it('retries failing requests up to configured maxRetries', async () => {
    const mockClient = new MockHttpClient();
    mockClient.shouldFailCount = 2; // fail twice, succeed 3rd attempt

    const retryPolicy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10, useJitter: false });
    const pipeline = new RequestPipeline({ client: mockClient, retryPolicy });

    const res = await pipeline.execute({ url: 'https://api.example.com/flaky' });
    expect(res.status).toBe(200);
    expect(mockClient.calls.length).toBe(3);
  });

  it('enforces rate-limiting token bucket', async () => {
    const mockClient = new MockHttpClient();
    const rateLimiter = new RateLimiter({ maxRequests: 2, perIntervalMs: 1000 });
    const pipeline = new RequestPipeline({ client: mockClient, rateLimiter });

    await pipeline.execute({ url: 'https://api.example.com/1' });
    await pipeline.execute({ url: 'https://api.example.com/2' });
    expect(mockClient.calls.length).toBe(2);
    expect(rateLimiter.getAvailableTokens()).toBe(0);
  });

  it('does NOT retry non-idempotent POST mutations on network socket errors', async () => {
    const mockClient = new MockHttpClient();
    // Simulate socket hangup
    mockClient.request = async (options: HttpRequestOptions) => {
      mockClient.calls.push(options);
      throw new Error('socket hang up (ECONNRESET)');
    };

    const retryPolicy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10, useJitter: false });
    const pipeline = new RequestPipeline({ client: mockClient, retryPolicy });

    await expect(
      pipeline.execute({
        url: 'https://api.spotify.com/v1/playlists/123/items',
        method: 'POST',
        body: { uris: ['spotify:track:1'] }
      })
    ).rejects.toThrow('socket hang up');

    // Invariant: Non-idempotent POST mutation must NOT be auto-retried (attempt count === 1)
    expect(mockClient.calls.length).toBe(1);
  });

  it('retries idempotent GET requests on network socket errors', async () => {
    let attempts = 0;
    const mockClient = new MockHttpClient();
    mockClient.request = async <T = unknown>(
      options: HttpRequestOptions
    ): Promise<HttpResponse<T>> => {
      mockClient.calls.push(options);
      attempts += 1;
      if (attempts < 3) {
        throw new Error('fetch failed (ETIMEDOUT)');
      }
      return mockClient.mockResponse as HttpResponse<T>;
    };

    const retryPolicy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10, useJitter: false });
    const pipeline = new RequestPipeline({ client: mockClient, retryPolicy });

    const res = await pipeline.execute({ url: 'https://api.spotify.com/v1/me', method: 'GET' });
    expect(res.status).toBe(200);
    expect(mockClient.calls.length).toBe(3);
  });

  it('allows retrying POST mutation if allowNonIdempotentRetry is explicitly true', async () => {
    let attempts = 0;
    const mockClient = new MockHttpClient();
    mockClient.request = async <T = unknown>(
      options: HttpRequestOptions
    ): Promise<HttpResponse<T>> => {
      mockClient.calls.push(options);
      attempts += 1;
      if (attempts < 2) {
        throw new Error('socket hang up');
      }
      return mockClient.mockResponse as HttpResponse<T>;
    };

    const retryPolicy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10, useJitter: false });
    const pipeline = new RequestPipeline({ client: mockClient, retryPolicy });

    const res = await pipeline.execute({
      url: 'https://api.spotify.com/v1/playlists/123/items',
      method: 'POST',
      allowNonIdempotentRetry: true
    });
    expect(res.status).toBe(200);
    expect(mockClient.calls.length).toBe(2);
  });
});
