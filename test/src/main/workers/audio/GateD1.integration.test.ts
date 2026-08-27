import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { executeAssetJob } from '../../../../../src/main/workers/process/handlers/assetJobHandler';
import { createWavBuffer } from './wavHelper';

describe('Gate D1 Hardening: End-to-End Streaming Waveform Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-d1-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('decodes real WAV audio and writes 200 Float32 bins with verified decoded metadata', async () => {
    const audioPath = path.join(tempDir, 'real_track.wav');
    const destPath = path.join(tempDir, 'cache', 'real_track_v1.bin');

    const wavBuf = createWavBuffer({
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16,
      durationSeconds: 2,
      amplitude: 0.75,
      waveformPattern: 'step_quarters'
    });
    await fs.writeFile(audioPath, wavBuf);

    const result = await executeAssetJob({
      taskId: 'd1-real-task',
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
    expect(result.metadata.method).toBe('decoded');
    expect(result.metadata.codec).toContain('WAV (PCM 16-bit)');

    // Verify .bin file contents on disk
    const binBuffer = await fs.readFile(destPath);
    expect(binBuffer.byteLength).toBe(200 * 4); // 200 float32s = 800 bytes

    const floatArray = new Float32Array(
      binBuffer.buffer,
      binBuffer.byteOffset,
      binBuffer.byteLength / 4
    );
    expect(floatArray.length).toBe(200);

    // Verify mathematical accuracy of quarters: 0.25, 0.50, 0.75, 1.00
    expect(floatArray[25]).toBeCloseTo(0.25, 2);
    expect(floatArray[75]).toBeCloseTo(0.50, 2);
    expect(floatArray[125]).toBeCloseTo(0.75, 2);
    expect(floatArray[175]).toBeCloseTo(1.00, 2);
  });

  it('re-surfaces error when supported audio file is corrupt without generating fake synthetic waveform', async () => {
    const corruptAudioPath = path.join(tempDir, 'corrupt_track.wav');
    const destPath = path.join(tempDir, 'cache', 'corrupt_track_v1.bin');

    // Corrupt WAV header
    await fs.writeFile(corruptAudioPath, Buffer.from('RIFF\x20\x00\x00\x00WAVEcorrupt'));

    const result = await executeAssetJob({
      taskId: 'd1-corrupt-task',
      jobType: 'waveform',
      input: {
        sourceFilePath: corruptAudioPath,
        destinationPath: destPath
      }
    });

    // Invariant: MUST fail and surface error, not silently generate fake synthetic output
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Audio decode failed|Invalid WAV file|data chunk not found/i);
    }

    // Ensure no destination cache file was published
    const fileExists = await fs.access(destPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(false);
  });

  it('explicitly marks fallback metadata as synthetic when format is unsupported', async () => {
    const unsupportedPath = path.join(tempDir, 'sample.unsupported_audio');
    const destPath = path.join(tempDir, 'cache', 'sample_unsupported_v1.bin');

    await fs.writeFile(unsupportedPath, Buffer.alloc(1000));

    const result = await executeAssetJob({
      taskId: 'd1-unsupported-task',
      jobType: 'waveform',
      input: {
        sourceFilePath: unsupportedPath,
        destinationPath: destPath
      }
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.metadata.method).toBe('synthetic_unsupported_codec');
  });

  it('aborts cleanly and unlinks temp files when cancelled during execution', async () => {
    const audioPath = path.join(tempDir, 'cancel_track.wav');
    const destPath = path.join(tempDir, 'cache', 'cancel_track_v1.bin');

    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, durationSeconds: 5 });
    await fs.writeFile(audioPath, wavBuf);

    const abortController = new AbortController();
    abortController.abort(); // Pre-abort

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

    const exists = await fs.access(destPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
