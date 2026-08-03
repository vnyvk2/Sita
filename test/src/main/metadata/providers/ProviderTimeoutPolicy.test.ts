import { describe, expect, it } from 'vitest';

import { ProviderTimeoutPolicy } from '@main/metadata/providers/timeout/ProviderTimeoutPolicy';

describe('ProviderTimeoutPolicy', () => {
  it('should resolve fast functions and reject timed out functions', async () => {
    const policy = new ProviderTimeoutPolicy();

    const fastResult = await policy.run(async () => 'fast', 1000);
    expect(fastResult).toBe('fast');

    const slowFn = () => new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 500));
    await expect(policy.run(slowFn, 50)).rejects.toThrow('Operation timed out after 50ms');
  });
});
