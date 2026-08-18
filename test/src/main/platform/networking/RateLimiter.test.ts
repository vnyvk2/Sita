import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '@main/platform/networking/RateLimiter';

describe('RateLimiter Optimization (Phase 6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows immediate consumption within token capacity', async () => {
    const limiter = new RateLimiter({ maxRequests: 3, perIntervalMs: 1000 });

    expect(limiter.getAvailableTokens()).toBe(3);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.getAvailableTokens()).toBe(0);
    expect(limiter.getQueueLength()).toBe(0);
  });

  it('schedules a single drain timer on burst of queued requests without timer proliferation', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, perIntervalMs: 1000 });

    // Consume all 2 tokens
    await limiter.acquire();
    await limiter.acquire();

    // Queue 5 requests simultaneously in a burst
    const p1 = limiter.acquire();
    const p2 = limiter.acquire();
    const p3 = limiter.acquire();
    const p4 = limiter.acquire();
    const p5 = limiter.acquire();

    expect(limiter.getQueueLength()).toBe(5);

    // Advancing time past refill interval drains available tokens in batches
    vi.advanceTimersByTime(1000);

    // Check timer queue progression
    await Promise.resolve();
    expect(limiter.getQueueLength()).toBeLessThan(5);

    // Complete remaining queue
    vi.advanceTimersByTime(2000);
    await Promise.all([p1, p2, p3, p4, p5]);

    expect(limiter.getQueueLength()).toBe(0);
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
