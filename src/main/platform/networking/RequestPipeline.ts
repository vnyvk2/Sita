import { Authenticator, type AuthCredentials } from './Authenticator';
import { FetchHttpClient } from './FetchHttpClient';
import type { HttpRequestOptions, HttpResponse, IHttpClient } from './IHttpClient';
import { RateLimiter, type RateLimiterOptions } from './RateLimiter';
import { RetryPolicy, type RetryPolicyOptions } from './RetryPolicy';

export interface RequestPipelineOptions {
  client?: IHttpClient;
  rateLimiter?: RateLimiterOptions | RateLimiter;
  retryPolicy?: RetryPolicyOptions | RetryPolicy;
  authCredentials?: AuthCredentials;
  maxConcurrentRequests?: number;
}

interface ConcurrencyQueueItem {
  resolve: () => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class RequestPipeline {
  private readonly client: IHttpClient;
  private readonly rateLimiter?: RateLimiter;
  private readonly retryPolicy: RetryPolicy;
  private readonly authenticator: Authenticator;
  private readonly maxConcurrentRequests: number;
  private activeAttempts: number = 0;
  private readonly concurrencyQueue: ConcurrencyQueueItem[] = [];

  constructor(options?: RequestPipelineOptions) {
    this.client = options?.client ?? new FetchHttpClient();

    const maxConcurrentRequests = options?.maxConcurrentRequests ?? 6;
    if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 1) {
      throw new Error('maxConcurrentRequests must be a positive integer');
    }
    this.maxConcurrentRequests = maxConcurrentRequests;

    if (options?.rateLimiter) {
      this.rateLimiter =
        options.rateLimiter instanceof RateLimiter
          ? options.rateLimiter
          : new RateLimiter(options.rateLimiter);
    }

    if (options?.retryPolicy) {
      this.retryPolicy =
        options.retryPolicy instanceof RetryPolicy
          ? options.retryPolicy
          : new RetryPolicy(options.retryPolicy);
    } else {
      this.retryPolicy = new RetryPolicy();
    }

    this.authenticator = new Authenticator(options?.authCredentials);
  }

  public async execute<T = unknown>(
    urlOrOptions: string | HttpRequestOptions,
    options?: Omit<HttpRequestOptions, 'url'>
  ): Promise<HttpResponse<T>> {
    const opts: HttpRequestOptions =
      typeof urlOrOptions === 'string' ? { url: urlOrOptions, ...options } : urlOrOptions;

    return this.retryPolicy.execute(
      async () => {
        const authenticatedOptions = this.authenticator.applyAuthentication(opts);

        if (this.rateLimiter) {
          await this.rateLimiter.acquire();
        }
        await this.acquireSlot(authenticatedOptions.signal);
        try {
          return await this.client.request<T>(authenticatedOptions);
        } finally {
          this.releaseSlot();
        }
      },
      {
        method: opts.method,
        allowNonIdempotentRetry: opts.allowNonIdempotentRetry,
        signal: opts.signal
      }
    );
  }

  private async acquireSlot(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    if (this.activeAttempts < this.maxConcurrentRequests) {
      this.activeAttempts++;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const item: ConcurrencyQueueItem = {
        resolve: () => {
          if (item.onAbort && item.signal) {
            item.signal.removeEventListener('abort', item.onAbort);
          }
          this.activeAttempts++;
          resolve();
        },
        reject,
        signal
      };

      if (signal) {
        item.onAbort = () => {
          const index = this.concurrencyQueue.indexOf(item);
          if (index !== -1) {
            this.concurrencyQueue.splice(index, 1);
          }
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        };
        signal.addEventListener('abort', item.onAbort, { once: true });
      }

      this.concurrencyQueue.push(item);
    });
  }

  private releaseSlot(): void {
    this.activeAttempts = Math.max(0, this.activeAttempts - 1);
    while (this.concurrencyQueue.length > 0 && this.activeAttempts < this.maxConcurrentRequests) {
      const next = this.concurrencyQueue.shift();
      if (next) {
        next.resolve();
        break;
      }
    }
  }

  public getRateLimiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }

  public getActiveAttempts(): number {
    return this.activeAttempts;
  }

  public getMaxConcurrentRequests(): number {
    return this.maxConcurrentRequests;
  }

  public getQueueLength(): number {
    return this.concurrencyQueue.length;
  }
}
