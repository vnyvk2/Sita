import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { executeAssetJob } from '../../../../../src/main/workers/process/handlers/assetJobHandler';
import { createWavBuffer } from './wavHelper';

describe('Gate D2-R1: End-to-End ReplayGain BS.1770 Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-d2-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('computes real ITU-R BS.1770 loudness and ReplayGain metrics from WAV file', async () => {
    const audioPath = path.join(tempDir, 'test_song.wav');

    // 1 kHz stereo sine wave at -20 dBFS (amplitude 0.1) -> Integrated loudness approx -20.07 LUFS
    // Nora target is -18.0 LUFS -> trackGain should be approx +2.07 dB
    const wavBuf = createWavBuffer({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      durationSeconds: 3,
      amplitude: 0.1,
      frequency: 1000
    });
    await fs.writeFile(audioPath, wavBuf);

    const result = await executeAssetJob({
      taskId: 'd2-task-1',
      jobType: 'replaygain',
      input: {
        sourceFilePath: audioPath,
        destinationPath: ''
      }
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.metadata.method).toBe('bs1770_decoded');
    expect(result.metadata.codec).toContain('WAV (PCM 16-bit)');
    expect(result.metadata.integratedLoudness).toBeCloseTo(-20.07, 1);
    expect(result.metadata.trackGain).toBeCloseTo(2.07, 1); // -18 - (-20.07) = +2.07 dB
    expect(result.metadata.samplePeak).toBeCloseTo(0.1, 2);
  });

  it('re-surfaces error when supported audio file is corrupt during ReplayGain analysis', async () => {
    const corruptAudioPath = path.join(tempDir, 'corrupt_song.wav');
    await fs.writeFile(corruptAudioPath, Buffer.from('RIFF\x20\x00\x00\x00WAVEcorrupt'));

    const result = await executeAssetJob({
      taskId: 'd2-corrupt-task',
      jobType: 'replaygain',
      input: {
        sourceFilePath: corruptAudioPath,
        destinationPath: ''
      }
    });

    // Invariant: MUST fail and surface error, not silently generate fake synthetic output
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Audio decode failed|Invalid WAV file|data chunk not found/i);
    }
  });

  it('explicitly marks fallback metadata as synthetic when format is unsupported', async () => {
    const unsupportedPath = path.join(tempDir, 'sample.unsupported_codec');
    await fs.writeFile(unsupportedPath, Buffer.alloc(1000));

    const result = await executeAssetJob({
      taskId: 'd2-unsupported-task',
      jobType: 'replaygain',
      input: {
        sourceFilePath: unsupportedPath,
        destinationPath: ''
      }
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.metadata.method).toBe('synthetic_unsupported_codec');
  });

  it('aborts cleanly when cancelled before or during ReplayGain analysis', async () => {
    const audioPath = path.join(tempDir, 'cancel_track.wav');
    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, durationSeconds: 5 });
    await fs.writeFile(audioPath, wavBuf);

    const abortController = new AbortController();
    abortController.abort(); // Pre-abort

    const result = await executeAssetJob({
      taskId: 'd2-cancel-task',
      jobType: 'replaygain',
      input: {
        sourceFilePath: audioPath,
        destinationPath: ''
      },
      abortSignal: abortController.signal
    });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });
});
