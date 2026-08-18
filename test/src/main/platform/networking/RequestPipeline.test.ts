import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '@main/platform/networking/FetchHttpClient';
import { RateLimiter } from '@main/platform/networking/RateLimiter';
import { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import type { IHttpClient, HttpRequestOptions, HttpResponse } from '@main/platform/networking/IHttpClient';

describe('RequestPipeline (Phase 2 Concurrency & Cancellation)', () => {
  it('enforces bounded concurrency such that active HTTP attempts never exceed maxConcurrentRequests', async () => {
    let activeAttempts = 0;
    let maxObservedConcurrency = 0;

    const mockClient: IHttpClient = {
      request: vi.fn().mockImplementation(async () => {
        activeAttempts++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeAttempts);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeAttempts--;
        return { status: 200, data: 'ok', headers: {} } as HttpResponse<unknown>;
      })
    };

    const pipeline = new RequestPipeline({
      client: mockClient,
      maxConcurrentRequests: 3
    });

    // Launch 10 concurrent requests
    const tasks = Array.from({ length: 10 }, (_, i) =>
      pipeline.execute(`https://api.test.com/item/${i}`)
    );

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(10);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(3);
    expect(pipeline.getActiveAttempts()).toBe(0);
    expect(pipeline.getQueueLength()).toBe(0);
  });

  it('validates that maxConcurrentRequests is a positive integer', () => {
    expect(() => new RequestPipeline({ maxConcurrentRequests: 0 })).toThrow('positive integer');
    expect(() => new RequestPipeline({ maxConcurrentRequests: -1 })).toThrow('positive integer');
    expect(() => new RequestPipeline({ maxConcurrentRequests: 1.5 })).toThrow('positive integer');
  });

  it('does not acquire concurrency slot while waiting for rate limiter token', async () => {
    const rateLimiter = new RateLimiter({ maxRequests: 1, perIntervalMs: 150 });
    // Consume the single initial token so the next acquire must wait for refill
    await rateLimiter.acquire();

    const mockClient: IHttpClient = {
      request: vi.fn().mockImplementation(async () => {
        return { status: 200, data: 'ok', headers: {} } as HttpResponse<unknown>;
      })
    };

    const pipeline = new RequestPipeline({
      client: mockClient,
      maxConcurrentRequests: 1,
      rateLimiter
    });

    const task = pipeline.execute('https://api.test.com/rate-limit-test');

    // While rateLimiter has 0 tokens and is waiting for refill:
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rateLimiter.getQueueLength()).toBe(1); // Request is waiting in rate limiter queue
    expect(pipeline.getActiveAttempts()).toBe(0); // Concurrency slot has NOT been acquired!

    await task;
    expect(pipeline.getActiveAttempts()).toBe(0);
    expect(rateLimiter.getQueueLength()).toBe(0);
  });

  it('aborts queued request before it reaches IHttpClient if cancelled while waiting for a slot', async () => {
    const executedUrls: string[] = [];

    const mockClient: IHttpClient = {
      request: vi.fn().mockImplementation(async (options: HttpRequestOptions) => {
        executedUrls.push(options.url);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { status: 200, data: 'ok', headers: {} } as HttpResponse<unknown>;
      })
    };

    const pipeline = new RequestPipeline({
      client: mockClient,
      maxConcurrentRequests: 1
    });

    const controllerB = new AbortController();

    // Request A acquires the 1 slot and takes 50ms
    const reqA = pipeline.execute('https://api.test.com/a');

    // Request B gets queued waiting for the slot
    const reqB = pipeline.execute({
      url: 'https://api.test.com/b',
      signal: controllerB.signal
    });

    // Attach rejection handler to prevent unhandled rejection warning
    const reqBPromise = reqB.catch((err) => err);

    // Cancel Request B while it is still queued
    controllerB.abort();

    await reqA;
    const errorB = await reqBPromise;
    expect(errorB).toBeInstanceOf(Error);
    expect((errorB as Error).name).toBe('AbortError');

    // Verify Request B NEVER reached mockClient.request
    expect(executedUrls).toEqual(['https://api.test.com/a']);
    expect(pipeline.getQueueLength()).toBe(0);
  });

  it('releases concurrency slot during retry backoff so slots are not wasted while sleeping', async () => {
    let attemptCount = 0;
    let inFlight = 0;
    let maxInFlight = 0;

    const mockClient: IHttpClient = {
      request: vi.fn().mockImplementation(async () => {
        attemptCount++;
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight--;

        if (attemptCount === 1) {
          throw new HttpError(429, 'Too Many Requests', 'https://api.test.com/retry-test');
        }
        return { status: 200, data: 'recovered', headers: {} } as HttpResponse<unknown>;
      })
    };

    const pipeline = new RequestPipeline({
      client: mockClient,
      maxConcurrentRequests: 1,
      retryPolicy: {
        maxRetries: 2,
        initialDelayMs: 30,
        backoffFactor: 1,
        useJitter: false
      }
    });

    const res = await pipeline.execute('https://api.test.com/retry-test');
    expect(res.data).toBe('recovered');
    expect(attemptCount).toBe(2);
    expect(maxInFlight).toBe(1);
    expect(pipeline.getActiveAttempts()).toBe(0);
  });
});
