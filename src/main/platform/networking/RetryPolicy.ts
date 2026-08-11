import { HttpError } from './FetchHttpClient';

export interface RetryPolicyOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  useJitter?: boolean;
  retryableStatusCodes?: number[];
}

export class RetryPolicy {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffFactor: number;
  private readonly useJitter: boolean;
  private readonly retryableStatusCodes: Set<number>;

  constructor(options?: RetryPolicyOptions) {
    this.maxRetries = options?.maxRetries ?? 3;
    this.initialDelayMs = options?.initialDelayMs ?? 1000;
    this.maxDelayMs = options?.maxDelayMs ?? 30000;
    this.backoffFactor = options?.backoffFactor ?? 2;
    this.useJitter = options?.useJitter ?? true;
    this.retryableStatusCodes = new Set(
      options?.retryableStatusCodes ?? [408, 429, 500, 502, 503, 504]
    );
  }

  public async execute<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        return await fn(attempt);
      } catch (err: unknown) {
        if (attempt > this.maxRetries || !this.isRetryableError(err)) {
          throw err;
        }

        const delay = this.calculateDelay(attempt, err);
        await this.delay(delay);
      }
    }
  }

  public isRetryableError(err: unknown): boolean {
    if (err instanceof HttpError) {
      return this.retryableStatusCodes.has(err.status);
    }
    if (err instanceof Error) {
      // Network disconnects, socket hangups, DNS lookup failures
      const msg = err.message.toLowerCase();
      return (
        msg.includes('fetch failed') ||
        msg.includes('network') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('socket hang up')
      );
    }
    return false;
  }

  public calculateDelay(attempt: number, err?: unknown): number {
    if (err instanceof HttpError && err.status === 429) {
      // Respect Retry-After header in pipeline if needed
    }

    const exponentialDelay = this.initialDelayMs * Math.pow(this.backoffFactor, attempt - 1);
    const clampedDelay = Math.min(this.maxDelayMs, exponentialDelay);

    if (this.useJitter) {
      const jitterFraction = 0.25;
      const jitter = (Math.random() * 2 - 1) * jitterFraction * clampedDelay;
      return Math.max(100, Math.floor(clampedDelay + jitter));
    }

    return clampedDelay;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
