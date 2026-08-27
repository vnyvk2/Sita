import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { executeAssetJob } from '../../../../../src/main/workers/process/handlers/assetJobHandler';
import { createWavBuffer } from './wavHelper';

describe('Gate D1: End-to-End Streaming Waveform Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-d1-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('decodes WAV audio and writes 200 Float32 bins atomically to cache', async () => {
    const audioPath = path.join(tempDir, 'sample_track.wav');
    const destPath = path.join(tempDir, 'cache', 'sample_track_v1.bin');

    const wavBuf = createWavBuffer({
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16,
      durationSeconds: 2,
      amplitude: 0.75
    });
    await fs.writeFile(audioPath, wavBuf);

    const result = await executeAssetJob({
      taskId: 'd1-task-1',
      jobType: 'waveform',
      input: {
        sourceFilePath: audioPath,
        destinationPath: destPath
      }
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.outputFilePath).toBe(destPath);
    expect(result.metadata.resolution).toBe(200);

    // Verify .bin file contents on disk
    const binBuffer = await fs.readFile(destPath);
    expect(binBuffer.byteLength).toBe(200 * 4); // 200 float32s = 800 bytes

    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );
    expect(floatArray.length).toBe(200);
    // Verified peak close to 0.75
    expect(floatArray[50]).toBeCloseTo(0.75, 1);
  });

  it('aborts cleanly and unlinks temp files when cancelled before disk write', async () => {
    const audioPath = path.join(tempDir, 'cancel_track.wav');
    const destPath = path.join(tempDir, 'cache', 'cancel_track_v1.bin');

    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, durationSeconds: 5 });
    await fs.writeFile(audioPath, wavBuf);

    const abortController = new AbortController();
    abortController.abort(); // pre-aborted

    const result = await executeAssetJob({
      taskId: 'd1-cancel-task',
      jobType: 'waveform',
      input: {
        sourceFilePath: audioPath,
        destinationPath: destPath
      },
      abortSignal: abortController.signal
    });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);

    // Ensure destination was not created
    const exists = await fs.access(destPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
