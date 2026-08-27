import { describe, expect, it } from 'vitest';

import { executeAssetJob } from '@main/workers/process/handlers/assetJobHandler';

describe('assetJobHandler (Gate C4-A Lifecycle)', () => {
  it('should execute asset job and return typed success with outputFilePath and metadata', async () => {
    const result = await executeAssetJob({
      taskId: 'test_task_1',
      jobType: 'artwork',
      input: {
        sourceFilePath: 'C:/Music/test.mp3',
        destinationPath: 'C:/Cache/artworks/test.webp',
        metadata: { format: 'webp', quality: 50 }
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outputFilePath).toBe('C:/Cache/artworks/test.webp');
      expect(result.metadata.jobType).toBe('artwork');
      expect(result.metadata.processedBy).toBe('assetJobHandler');
      expect(result.metadata.quality).toBe(50);
      expect(result.cancelled).toBeUndefined();
    }
  });

  it('should return error when simulated failure trigger is provided', async () => {
    const result = await executeAssetJob({
      taskId: 'test_task_fail',
      jobType: 'waveform',
      input: {
        sourceFilePath: 'C:/Music/__FAIL__test.mp3',
        destinationPath: 'C:/Cache/waveforms/test.bin'
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Simulated asset generation failure');
      expect(result.cancelled).toBeUndefined();
    }
  });

  it('should abort cleanly if abortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await executeAssetJob({
      taskId: 'test_task_aborted_early',
      jobType: 'artwork',
      input: {
        sourceFilePath: 'C:/Music/test.mp3',
        destinationPath: 'C:/Cache/artworks/test.webp'
      },
      abortSignal: controller.signal
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.cancelled).toBe(true);
      expect(result.error).toContain('cancelled before execution');
    }
  });

  it('should abort cleanly if abortSignal fires during execution', async () => {
    const controller = new AbortController();

    const jobPromise = executeAssetJob({
      taskId: 'test_task_aborted_mid',
      jobType: 'waveform',
      input: {
        sourceFilePath: 'C:/Music/test.mp3',
        destinationPath: 'C:/Cache/waveforms/test.bin'
      },
      abortSignal: controller.signal
    });

    // Abort while job is executing
    setTimeout(() => {
      controller.abort();
    }, 2);

    const result = await jobPromise;
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.cancelled).toBe(true);
      expect(result.error).toContain('cancelled during execution');
    }
  });
});
