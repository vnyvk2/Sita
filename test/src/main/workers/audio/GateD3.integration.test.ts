import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeAssetJob } from '../../../../../src/main/workers/process/handlers/assetJobHandler';
import { AlbumLoudnessAggregator } from '../../../../../src/main/workers/process/audio/AlbumLoudnessAggregator';
import { computeEffectiveReplayGain } from '../../../../../src/renderer/src/other/replayGainCalculator';

function createWavBuffer(options: {
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 32;
  durationSeconds: number;
  amplitude: number;
  frequency: number;
}): Buffer {
  const { sampleRate, channels, bitDepth, durationSeconds, amplitude, frequency } = options;
  const numFrames = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const sample = amplitude * Math.sin(2 * Math.PI * frequency * t);

    for (let ch = 0; ch < channels; ch++) {
      if (bitDepth === 16) {
        const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        buffer.writeInt16LE(intSample, offset);
        offset += 2;
      } else {
        const intSample = Math.max(-2147483648, Math.min(2147483647, Math.floor(sample * 2147483647)));
        buffer.writeInt32LE(intSample, offset);
        offset += 4;
      }
    }
  }

  return buffer;
}

describe('Gate D3: End-to-End Album Loudness & ReplayGain Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-gate-d3-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('runs worker track analysis, persists Float64 block caches, and aggregates album loudness correctly', async () => {
    const track1Path = path.join(tempDir, 'track1.wav');
    const track2Path = path.join(tempDir, 'track2.wav');
    const cache1Path = path.join(tempDir, 'track1_blocks.bin');
    const cache2Path = path.join(tempDir, 'track2_blocks.bin');

    // Track 1: 1 kHz stereo sine wave at amplitude 0.2 (~ -14.0 LUFS)
    const wav1 = createWavBuffer({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      durationSeconds: 2,
      amplitude: 0.2,
      frequency: 1000
    });
    await fs.writeFile(track1Path, wav1);

    // Track 2: 1 kHz stereo sine wave at amplitude 0.05 (~ -26.0 LUFS)
    const wav2 = createWavBuffer({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      durationSeconds: 2,
      amplitude: 0.05,
      frequency: 1000
    });
    await fs.writeFile(track2Path, wav2);

    // 1. Worker analysis on Track 1 with destinationPath
    const res1 = await executeAssetJob({
      taskId: 'd3-task-1',
      jobType: 'replaygain',
      input: {
        sourceFilePath: track1Path,
        destinationPath: cache1Path
      }
    });

    expect(res1.success).toBe(true);
    if (!res1.success) return;

    expect(res1.outputFilePath).toBe(cache1Path);
    expect(res1.metadata.samplePeak).toBeCloseTo(0.2, 2);

    // 2. Worker analysis on Track 2 with destinationPath
    const res2 = await executeAssetJob({
      taskId: 'd3-task-2',
      jobType: 'replaygain',
      input: {
        sourceFilePath: track2Path,
        destinationPath: cache2Path
      }
    });

    expect(res2.success).toBe(true);
    if (!res2.success) return;

    expect(res2.outputFilePath).toBe(cache2Path);
    expect(res2.metadata.samplePeak).toBeCloseTo(0.05, 2);

    // 3. Verify Float64 block caches exist on disk and have exact 64-bit alignment (Constraint #1)
    const buf1 = await fs.readFile(cache1Path);
    const buf2 = await fs.readFile(cache2Path);
    expect(buf1.byteLength % 8).toBe(0);
    expect(buf2.byteLength % 8).toBe(0);

    const blocks1 = new Float64Array(buf1.buffer, buf1.byteOffset, buf1.byteLength / 8);
    const blocks2 = new Float64Array(buf2.buffer, buf2.byteOffset, buf2.byteLength / 8);
    expect(blocks1.length).toBeGreaterThan(0);
    expect(blocks2.length).toBeGreaterThan(0);

    // 4. Album Aggregation over pooled Float64 block caches
    const album = AlbumLoudnessAggregator.aggregate([
      { songId: 1, blockEnergies: blocks1, samplePeak: res1.metadata.samplePeak },
      { songId: 2, blockEnergies: blocks2, samplePeak: res2.metadata.samplePeak }
    ]);

    // Discrete sample peak: max(0.2, 0.05) = 0.2 (Constraint #5)
    expect(album.albumPeak).toBeCloseTo(0.2, 2);

    // Pooled gating verification: Track 1 has higher energy; album integrated loudness should reflect pooled blocks
    expect(album.albumLoudness).toBeGreaterThan(-26.0);
    expect(album.albumLoudness).toBeLessThan(-13.0);
    expect(album.totalBlocksProcessed).toBe(blocks1.length + blocks2.length);

    // 5. Renderer Web Audio ReplayGain application verification
    // Mode 'track' on Track 1: gain = -18 - (-14.0) = -4 dB (linear ~0.63)
    const track1Gain = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: res1.metadata.trackGain,
      trackPeak: res1.metadata.samplePeak,
      preventClipping: true
    });
    expect(track1Gain.appliedGainDb).toBeCloseTo(res1.metadata.trackGain, 1);
    expect(track1Gain.targetLinearGain).toBeLessThan(1.0);
    expect(track1Gain.isClipped).toBe(false);

    // Mode 'album' on Track 1: uses album.albumGain and album.albumPeak
    const albumPlayGain = computeEffectiveReplayGain({
      mode: 'album',
      albumGain: album.albumGain,
      albumPeak: album.albumPeak,
      preventClipping: true
    });
    expect(albumPlayGain.appliedGainDb).toBeCloseTo(album.albumGain, 1);
    expect(albumPlayGain.isClipped).toBe(false);
  });
});
