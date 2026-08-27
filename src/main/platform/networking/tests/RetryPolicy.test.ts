import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../FetchHttpClient';
import { RetryPolicy } from '../RetryPolicy';

describe('Platform Networking — RetryPolicy Retry-After handling', () => {
  const make429 = (headers: Record<string, string>) =>
    new HttpError(429, 'Too Many Requests', 'https://api.example.com', undefined, headers);

  it('honors a numeric Retry-After header on 429 without jitter', () => {
    const policy = new RetryPolicy({ useJitter: true });
    const delay = policy.calculateDelay(1, make429({ 'retry-after': '7' }));

    expect(delay).toBe(7000);
  });

  it('caps the Retry-After delay at maxDelayMs', () => {
    const policy = new RetryPolicy({ useJitter: true, maxDelayMs: 5000 });
    const delay = policy.calculateDelay(1, make429({ 'retry-after': '120' }));

    expect(delay).toBe(5000);
  });

  it('falls back to exponential backoff when the header is missing or invalid', () => {
    const policy = new RetryPolicy({ initialDelayMs: 500, useJitter: false });

    expect(policy.calculateDelay(1, make429({}))).toBe(500);
    expect(policy.calculateDelay(2, make429({ 'retry-after': 'soon' }))).toBe(1000);
    expect(policy.calculateDelay(1, make429({ 'retry-after': '-3' }))).toBe(500);
  });

  it('ignores Retry-After for non-429 errors and uses exponential backoff', () => {
    const policy = new RetryPolicy({ initialDelayMs: 250, useJitter: false });
    const err = new HttpError(503, 'Service Unavailable', 'https://api.example.com', undefined, {
      'retry-after': '9'
    });

    expect(policy.calculateDelay(1, err)).toBe(250);
  });

  it('still retries a 429 as a retryable status through execute()', async () => {
    vi.useFakeTimers();
    try {
      const policy = new RetryPolicy({
        maxRetries: 1,
        initialDelayMs: 10,
        useJitter: false
      });
      let calls = 0;
      const fn = vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) throw make429({ 'retry-after': '1' });
        return 'ok';
      });

      const pending = policy.execute(fn);
      // Advance past the server-provided 1000ms delay
      await vi.advanceTimersByTimeAsync(1100);
      await expect(pending).resolves.toBe('ok');
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with AbortError when the signal aborts during a long Retry-After backoff', async () => {
    vi.useFakeTimers();
    try {
      const policy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10, useJitter: false });
      const controller = new AbortController();
      let calls = 0;
      const fn = vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) throw make429({ 'retry-after': '30' });
        return 'ok';
      });

      const pending = policy.execute(fn, { signal: controller.signal });
      // Let the first attempt fail and the 30s server-provided sleep begin.
      await vi.advanceTimersByTimeAsync(1);

      controller.abort();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      // The cancellation must not be retried and the abandoned timer must stay dead.
      await vi.advanceTimersByTimeAsync(31_000);
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects immediately when the signal is already aborted at backoff time', async () => {
    vi.useFakeTimers();
    try {
      const policy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10_000, useJitter: false });
      const controller = new AbortController();
      const fn = vi.fn().mockRejectedValueOnce(make429({ 'retry-after': '30' }));

      const pending = policy.execute(fn, { signal: controller.signal });
      controller.abort();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
