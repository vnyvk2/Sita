import type { CancellationToken } from '../../models/ProviderExecutionContext';

export class ProviderTimeoutPolicy {
  public async run<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    cancellationToken?: CancellationToken
  ): Promise<T> {
    if (cancellationToken?.isCancelled || cancellationToken?.isCancellationRequested?.()) {
      throw new Error('Operation cancelled prior to execution');
    }

    let timerHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerHandle = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timerHandle!);
      return result;
    } catch (err) {
      clearTimeout(timerHandle!);
      throw err;
    }
  }
}
