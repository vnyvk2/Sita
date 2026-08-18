export interface RateLimiterOptions {
  maxRequests: number;
  perIntervalMs: number;
  maxQueueSize?: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly perIntervalMs: number;
  private readonly maxQueueSize: number;

  private tokens: number;
  private lastRefillTimestamp: number;
  private readonly queue: Array<() => void> = [];
  private drainScheduled = false;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = Math.max(1, options.maxRequests);
    this.perIntervalMs = Math.max(100, options.perIntervalMs);
    this.maxQueueSize = options.maxQueueSize ?? 100;

    this.tokens = this.maxRequests;
    this.lastRefillTimestamp = Date.now();
  }

  public async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`RateLimiter queue overflow limit reached (${this.maxQueueSize})`);
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleNextDrain();
    });
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getAvailableTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTimestamp;

    if (elapsed >= this.perIntervalMs) {
      const addedTokens = Math.floor(elapsed / this.perIntervalMs) * this.maxRequests;
      this.tokens = Math.min(this.maxRequests, this.tokens + addedTokens);
      this.lastRefillTimestamp = now;
    }
  }

  private scheduleNextDrain(): void {
    if (this.drainScheduled || this.queue.length === 0) return;
    this.drainScheduled = true;

    const timeToWait = this.perIntervalMs / this.maxRequests;
    setTimeout(() => {
      this.drainScheduled = false;
      this.refillTokens();

      while (this.queue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        const next = this.queue.shift();
        if (next) {
          next();
        }
      }

      if (this.queue.length > 0) {
        this.scheduleNextDrain();
      }
    }, timeToWait);
  }
}
