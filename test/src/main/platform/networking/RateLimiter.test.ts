import { RateLimiter } from '@main/platform/networking/RateLimiter';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('RateLimiter Optimization & Invariant Rigor (Phase 6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows immediate consumption within token capacity and refrains from creating timers', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, perIntervalMs: 1000 });

    expect(limiter.getAvailableTokens()).toBe(3);
    expect(vi.getTimerCount()).toBe(0);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.getAvailableTokens()).toBe(0);
    expect(limiter.getQueueLength()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('strictly enforces at most ONE outstanding drain timer under a burst of 100 queued requests', async () => {
    const limiter = new RateLimiter({ maxRequests: 5, perIntervalMs: 1000, maxQueueSize: 200 });

    // Consume all 5 tokens
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    expect(limiter.getAvailableTokens()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    // Queue 100 requests in a concurrent burst
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(limiter.acquire());
    }

    expect(limiter.getQueueLength()).toBe(100);
    // Explicit Invariant Check: Exactly 1 timer scheduled despite 100 queued requests
    expect(vi.getTimerCount()).toBe(1);

    // Step through intervals, verifying at most 1 timer is ever active
    while (limiter.getQueueLength() > 0) {
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(200); // Step timer interval (1000ms / 5 maxRequests = 200ms per step)
      await Promise.resolve();
    }

    await Promise.all(promises);
    expect(limiter.getQueueLength()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves exact rate-limiting timing boundaries and avoids premature execution', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, perIntervalMs: 1000 });

    // Consume initial 2 tokens
    await limiter.acquire();
    await limiter.acquire();

    let resolved3 = false;
    let resolved4 = false;

    void limiter.acquire().then(() => {
      resolved3 = true;
    });
    void limiter.acquire().then(() => {
      resolved4 = true;
    });

    // Before refill interval elapsed (at 400ms), queued items must NOT resolve
    await vi.advanceTimersByTimeAsync(400);
    expect(resolved3).toBe(false);
    expect(resolved4).toBe(false);

    // At 1000ms (full interval elapsed), tokens refill and both queued requests resolve
    await vi.advanceTimersByTimeAsync(600);
    expect(resolved3).toBe(true);
    expect(resolved4).toBe(true);
  });

  it('caps token accumulation to maxRequests after long idle periods and allows clean burst up to capacity', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, perIntervalMs: 1000 });

    // Consume all tokens
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getAvailableTokens()).toBe(0);

    // Idle for 10 seconds (10x interval)
    vi.advanceTimersByTime(10000);

    // Available tokens MUST NOT exceed maxRequests (3)
    expect(limiter.getAvailableTokens()).toBe(3);

    // Burst up to capacity immediately resolves without queuing or timers
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getAvailableTokens()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('throws error when queue overflow limit is reached', async () => {
    const limiter = new RateLimiter({ maxRequests: 1, perIntervalMs: 1000, maxQueueSize: 2 });

    await limiter.acquire(); // Token 1 consumed

    // Queue up to limit (2)
    void limiter.acquire();
    void limiter.acquire();

    expect(limiter.getQueueLength()).toBe(2);

    // 3rd queued request should throw
    await expect(limiter.acquire()).rejects.toThrow('RateLimiter queue overflow limit reached (2)');
  });
});
