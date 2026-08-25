import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FetchHttpClient, HttpError } from '../FetchHttpClient';

type FetchMock = (url: string | URL, init?: RequestInit) => Promise<Response>;

const makeAbortRejectingFetch = (): FetchMock => {
  return (_url: string | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const abortErr = new Error('This operation was aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
      });
    }) as unknown as Promise<Response>;
  };
};

describe('Platform Networking — FetchHttpClient cancellation identity', () => {
  let client: FetchHttpClient;

  beforeEach(() => {
    client = new FetchHttpClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves AbortError when the caller signal is already aborted', async () => {
    vi.stubGlobal('fetch', vi.fn<ReturnType<FetchMock>>());
    const controller = new AbortController();
    controller.abort();

    await expect(client.request({ url: 'https://api.example.com/x', signal: controller.signal })).rejects.toMatchObject(
      {
        name: 'AbortError'
      }
    );
  });

  it('preserves AbortError when the caller aborts mid-flight (never reports a timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn(makeAbortRejectingFetch()) as unknown as typeof fetch);
    const controller = new AbortController();

    const pending = client.request({ url: 'https://api.example.com/x', signal: controller.signal });
    setTimeout(() => controller.abort(), 10);

    const err = (await pending.catch((e: Error) => e)) as Error;
    expect(err.name).toBe('AbortError');
    expect(err.message).toMatch(/Operation aborted/);
  });

  it('reports a timeout error only when the internal timer fires', async () => {
    vi.stubGlobal('fetch', vi.fn(makeAbortRejectingFetch()) as unknown as typeof fetch);

    await expect(client.request({ url: 'https://api.example.com/slow', timeoutMs: 25 })).rejects.toThrow(
      /Request timed out after 25ms/
    );
  });

  it('returns successful responses untouched', async () => {
    const fakeResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true }),
      text: async () => ''
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const res = await client.request<{ ok: boolean }>({ url: 'https://api.example.com/ok' });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
  });

  it('attaches lowercase response headers to thrown HttpErrors (Retry-After visibility)', async () => {
    const fakeResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map([
        ['content-type', 'application/json'],
        ['retry-after', '5']
      ]),
      json: async () => ({ message: 'rate limited' }),
      text: async () => ''
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse) as unknown as typeof fetch);

    const err = await client.request({ url: 'https://api.example.com/limited' }).catch((e: Error) => e);

    expect(err).toBeInstanceOf(HttpError);
    const httpError = err as HttpError;
    expect(httpError.status).toBe(429);
    expect(httpError.responseHeaders?.['retry-after']).toBe('5');
  });
});
