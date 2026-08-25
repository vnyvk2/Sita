import { describe, expect, it } from 'vitest';

import {
  MetadataApplyBusyError,
  isMetadataApplyLocked,
  runExclusiveMetadataApply
} from '../metadataApplyMutex';

describe('metadataApplyMutex — single-flight apply invariant', () => {
  it('runs a lone operation normally and frees the lock afterwards', async () => {
    expect(isMetadataApplyLocked()).toBe(false);

    const result = await runExclusiveMetadataApply(async () => 'done');

    expect(result).toBe('done');
    expect(isMetadataApplyLocked()).toBe(false);
  });

  it('REJECTS a concurrent second operation instead of queueing it', async () => {
    let releaseFirst: (() => void) | undefined;
    const first = runExclusiveMetadataApply(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('first-done');
        })
    );

    await expect(runExclusiveMetadataApply(async () => 'second')).rejects.toBeInstanceOf(
      MetadataApplyBusyError
    );
    expect(isMetadataApplyLocked()).toBe(true);

    releaseFirst?.();
    await expect(first).resolves.toBe('first-done');
    expect(isMetadataApplyLocked()).toBe(false);
  });

  it('frees the lock when the operation fails, so later applies are not locked out', async () => {
    await expect(
      runExclusiveMetadataApply(async () => {
        throw new Error('apply exploded');
      })
    ).rejects.toThrow('apply exploded');

    expect(isMetadataApplyLocked()).toBe(false);
    await expect(runExclusiveMetadataApply(async () => 'recovered')).resolves.toBe('recovered');
  });

  it('reports the busy error with a stable name for UI surfacing', async () => {
    let releaseFirst: (() => void) | undefined;
    const first = runExclusiveMetadataApply(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('first-done');
        })
    );

    const second = await runExclusiveMetadataApply(async () => 'x').catch((e: Error) => e);
    expect(second).toBeInstanceOf(MetadataApplyBusyError);
    expect((second as Error).name).toBe('MetadataApplyBusyError');

    releaseFirst?.();
    await expect(first).resolves.toBe('first-done');
  });
});
