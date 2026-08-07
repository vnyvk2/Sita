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
}

export class RequestPipeline {
  private readonly client: IHttpClient;
  private readonly rateLimiter?: RateLimiter;
  private readonly retryPolicy: RetryPolicy;
  private readonly authenticator: Authenticator;

  constructor(options?: RequestPipelineOptions) {
    this.client = options?.client ?? new FetchHttpClient();

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
      typeof urlOrOptions === 'string'
        ? { url: urlOrOptions, ...options }
        : urlOrOptions;

    const authenticatedOptions = this.authenticator.applyAuthentication(opts);

    return this.retryPolicy.execute(async () => {
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }
      return this.client.request<T>(authenticatedOptions);
    });
  }

  public getRateLimiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }
}
