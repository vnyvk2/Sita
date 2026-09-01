import { ProviderRetryPolicy } from '@main/metadata/providers/retry/ProviderRetryPolicy';
import { describe, expect, it } from 'vitest';

describe('ProviderRetryPolicy', () => {
  it('should retry failed calls up to maxAttempts', async () => {
    const policy = new ProviderRetryPolicy();
    let attempts = 0;

    const failingFn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Temporary failure');
      }
      return 'success';
    };

    const result = await policy.execute(failingFn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });
});
