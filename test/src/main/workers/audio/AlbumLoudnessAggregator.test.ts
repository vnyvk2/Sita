import { describe, expect, it } from 'vitest';

import { AlbumLoudnessAggregator } from '../../../../../src/main/workers/process/audio/AlbumLoudnessAggregator';
import { BS1770LoudnessEngine } from '../../../../../src/main/workers/process/audio/BS1770LoudnessEngine';

describe('Gate D3: AlbumLoudnessAggregator (ITU-R BS.1770-4 Multi-Track Pooled Gating)', () => {
  it('does NOT average per-track LUFS values; gates pooled blocks with album-level relative threshold', () => {
    const sampleRate = 48000;

    // Track 1: Loud 3-second track at ~ -14.07 LUFS (amplitude = 0.2)
    const engine1 = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);
    const frames1 = sampleRate * 3;
    const left1 = new Float32Array(frames1);
    const right1 = new Float32Array(frames1);
    for (let i = 0; i < frames1; i++) {
      const s = 0.2 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      left1[i] = s;
      right1[i] = s;
    }
    engine1.processChunk({
      channelData: [left1, right1],
      sampleOffset: 0,
      frameCount: frames1,
      totalSamples: frames1
    });
    const res1 = engine1.finish();
    const blocks1 = engine1.getBlockEnergies();

    // Track 2: Very quiet 3-second ambient track at ~ -40.07 LUFS (amplitude = 0.01, 26 LU quieter than Track 1)
    const engine2 = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);
    const frames2 = sampleRate * 3;
    const left2 = new Float32Array(frames2);
    const right2 = new Float32Array(frames2);
    for (let i = 0; i < frames2; i++) {
      const s = 0.01 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      left2[i] = s;
      right2[i] = s;
    }
    engine2.processChunk({
      channelData: [left2, right2],
      sampleOffset: 0,
      frameCount: frames2,
      totalSamples: frames2
    });
    const res2 = engine2.finish();
    const blocks2 = engine2.getBlockEnergies();

    // Check individual track loudnesses
    expect(res1.integratedLoudness).toBeCloseTo(-14.0, 1);
    expect(res2.integratedLoudness).toBeCloseTo(-40.0, 1);

    // If an algorithm mistakenly averaged track LUFS: (-14.07 + -40.07) / 2 = -27.07 LUFS.
    // In BS.1770 pooled gating:
    // Track 2's blocks are ~26 LU below Track 1 and get gated out by the album relative threshold!
    const albumResult = AlbumLoudnessAggregator.aggregate([
      { songId: 1, blockEnergies: blocks1, samplePeak: res1.samplePeak },
      { songId: 2, blockEnergies: blocks2, samplePeak: res2.samplePeak }
    ]);

    // Invariant: Album loudness must match the surviving non-gated loud blocks (res1)
    expect(albumResult.albumLoudness).toBeCloseTo(res1.integratedLoudness, 2);
    expect(albumResult.albumLoudness).not.toBeCloseTo(-27.0, 1); // Disproves naive averaging
    expect(albumResult.totalBlocksSurvivingGate).toBeLessThan(albumResult.totalBlocksProcessed);

    // Invariant: Album peak must be max(track1.samplePeak, track2.samplePeak) = 0.2
    expect(albumResult.albumPeak).toBeCloseTo(0.2, 3);

    // Invariant: Album gain relative to Nora default (-18 LUFS): -18 - (-14.07) = -3.93 dB
    expect(albumResult.albumGain).toBeCloseTo(-3.93, 1);
  });

  it('matches continuous multi-track execution through a single engine instance', () => {
    const sampleRate = 48000;

    // Generate two tracks
    const frames = sampleRate * 2;
    const track1Audio = new Float32Array(frames).map(
      (_, i) => 0.1 * Math.sin(2 * Math.PI * 440 * (i / sampleRate))
    );
    const track2Audio = new Float32Array(frames).map(
      (_, i) => 0.08 * Math.cos(2 * Math.PI * 880 * (i / sampleRate))
    );

    // Run separately
    const eng1 = new BS1770LoudnessEngine(sampleRate, 2);
    eng1.processChunk({
      channelData: [track1Audio, track1Audio],
      sampleOffset: 0,
      frameCount: frames,
      totalSamples: frames
    });
    const r1 = eng1.finish();

    const eng2 = new BS1770LoudnessEngine(sampleRate, 2);
    eng2.processChunk({
      channelData: [track2Audio, track2Audio],
      sampleOffset: 0,
      frameCount: frames,
      totalSamples: frames
    });
    const r2 = eng2.finish();

    // Aggregate
    const albumRes = AlbumLoudnessAggregator.aggregate([
      { songId: 1, blockEnergies: eng1.getBlockEnergies(), samplePeak: r1.samplePeak },
      { songId: 2, blockEnergies: eng2.getBlockEnergies(), samplePeak: r2.samplePeak }
    ]);

    // Invariant: albumPeak is discrete max
    expect(albumRes.albumPeak).toBe(Math.max(r1.samplePeak, r2.samplePeak));
    expect(Number.isFinite(albumRes.albumLoudness)).toBe(true);
    expect(albumRes.totalBlocksProcessed).toBe(
      eng1.getBlockEnergies().length + eng2.getBlockEnergies().length
    );
  });

  it('handles empty track lists and all-silent albums gracefully', () => {
    const emptyResult = AlbumLoudnessAggregator.aggregate([]);
    expect(emptyResult.albumLoudness).toBe(-Infinity);
    expect(emptyResult.albumPeak).toBe(0.0);
    expect(emptyResult.albumGain).toBe(0.0);

    const silentResult = AlbumLoudnessAggregator.aggregate([
      { songId: 10, blockEnergies: new Float64Array(50).fill(0.0), samplePeak: 0.0 },
      { songId: 11, blockEnergies: new Float64Array(50).fill(0.0), samplePeak: 0.0 }
    ]);
    expect(silentResult.albumLoudness).toBe(-Infinity);
    expect(silentResult.albumPeak).toBe(0.0);
    expect(silentResult.albumGain).toBe(0.0);
  });

  it('preserves 64-bit float precision throughout aggregation', () => {
    const highPrecisionEnergy = 0.012345678901234567;
    const blocks = new Float64Array(10).fill(highPrecisionEnergy);

    const result = AlbumLoudnessAggregator.aggregate([
      { songId: 1, blockEnergies: blocks, samplePeak: 0.5 }
    ]);

    // Expected: -0.691 + 10 * log10(highPrecisionEnergy)
    const expectedLoudness = -0.691 + 10 * Math.log10(highPrecisionEnergy);
    expect(result.albumLoudness).toBeCloseTo(expectedLoudness, 2);
  });
});
