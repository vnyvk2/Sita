import { HttpError } from './FetchHttpClient';

export interface RetryPolicyOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  useJitter?: boolean;
  retryableStatusCodes?: number[];
}

export interface ExecuteOptions {
  method?: string;
  allowNonIdempotentRetry?: boolean;
  /** Aborts the wait immediately instead of sleeping out the full backoff. */
  signal?: AbortSignal;
}

export const isIdempotentMethod = (method?: string): boolean => {
  if (!method) return true;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
};

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

  public async execute<T>(
    fn: (attempt: number) => Promise<T>,
    options?: ExecuteOptions
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        return await fn(attempt);
      } catch (err: unknown) {
        if (
          attempt > this.maxRetries ||
          !this.isRetryableError(err, options?.method, options?.allowNonIdempotentRetry)
        ) {
          throw err;
        }

        const delay = this.calculateDelay(attempt, err);
        await this.delay(delay, options?.signal);
      }
    }
  }

  public isRetryableError(
    err: unknown,
    method?: string,
    allowNonIdempotentRetry?: boolean
  ): boolean {
    const isIdempotent = isIdempotentMethod(method);
    if (!isIdempotent && !allowNonIdempotentRetry) {
      return false;
    }

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
      const serverDelay = this.parseRetryAfterMs(err);
      if (serverDelay !== undefined) {
        // Server explicitly told us how long to wait; honor it exactly
        // (capped by maxDelayMs) without adding jitter.
        return Math.min(this.maxDelayMs, serverDelay);
      }
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

  /**
   * Parses a numeric-seconds `Retry-After` header into milliseconds. HTTP-date form is
   * intentionally not supported (rare for rate limiting).
   */
  private parseRetryAfterMs(err: HttpError): number | undefined {
    const raw = err.responseHeaders?.['retry-after'];
    if (!raw) return undefined;
    const seconds = Number(raw.trim());
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return seconds * 1000;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    return new Promise<void>((resolve, reject) => {
      // A large Retry-After must not keep a cancelled operation pinned for the
      // full duration; race the timer against the caller's signal.
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        cleanup();
        reject(createAbortError());
      };

      function cleanup() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

function createAbortError(): Error {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  return abortError;
}
