export interface ProviderRetryPolicyOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoffMultiplier?: number;
  retryPredicate?: (error: unknown) => boolean;
  onRetry?: (attempt: number, maxAttempts: number, delayMs: number, error: unknown) => void;
}

export class ProviderRetryPolicy {
  public async execute<T>(
    fn: () => Promise<T>,
    options: ProviderRetryPolicyOptions = {}
  ): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 100;
    const backoffMultiplier = options.backoffMultiplier ?? 2;
    const retryPredicate = options.retryPredicate ?? (() => true);

    let lastError: unknown;
    let delay = baseDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt === maxAttempts || !retryPredicate(err)) {
          throw err;
        }

        if (options.onRetry) {
          options.onRetry(attempt, maxAttempts, delay, err);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }

    throw lastError;
  }
}
