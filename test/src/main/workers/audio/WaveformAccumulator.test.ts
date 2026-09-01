import { describe, expect, it } from 'vitest';

import {
  WaveformAccumulator,
  WAVEFORM_NUM_BINS
} from '../../../../../src/main/workers/process/audio/WaveformAccumulator';

describe('Gate D1 Hardening: WaveformAccumulator (Mathematical Accuracy & Determinism)', () => {
  it('extracts known step quarter waveform envelope with mathematical accuracy across 200 bins', () => {
    const totalSamples = 20000;
    const accumulator = new WaveformAccumulator(totalSamples);

    // Create 4 quarters: [0..4999] = 0.25, [5000..9999] = 0.50, [10000..14999] = 0.75, [15000..19999] = 1.00
    const q1 = new Float32Array(5000).fill(0.25);
    const q2 = new Float32Array(5000).fill(0.5);
    const q3 = new Float32Array(5000).fill(0.75);
    const q4 = new Float32Array(5000).fill(1.0);

    accumulator.processChunk({
      channelData: [q1],
      sampleOffset: 0,
      frameCount: 5000,
      totalSamples
    });
    accumulator.processChunk({
      channelData: [q2],
      sampleOffset: 5000,
      frameCount: 5000,
      totalSamples
    });
    accumulator.processChunk({
      channelData: [q3],
      sampleOffset: 10000,
      frameCount: 5000,
      totalSamples
    });
    accumulator.processChunk({
      channelData: [q4],
      sampleOffset: 15000,
      frameCount: 5000,
      totalSamples
    });

    const peaks = accumulator.finish();
    expect(peaks.length).toBe(200);

    // Bins 0..49 should be 0.25
    for (let b = 0; b < 50; b++) {
      expect(peaks[b]).toBeCloseTo(0.25, 2);
    }
    // Bins 50..99 should be 0.50
    for (let b = 50; b < 100; b++) {
      expect(peaks[b]).toBeCloseTo(0.5, 2);
    }
    // Bins 100..149 should be 0.75
    for (let b = 100; b < 150; b++) {
      expect(peaks[b]).toBeCloseTo(0.75, 2);
    }
    // Bins 150..199 should be 1.00
    for (let b = 150; b < 200; b++) {
      expect(peaks[b]).toBeCloseTo(1.0, 2);
    }
  });

  it('performs accurate max-pooling across multiple audio channels', () => {
    const totalSamples = 1000;
    const accumulator = new WaveformAccumulator(totalSamples);

    // Left channel has 0.3, Right channel has 0.8
    const left = new Float32Array(1000).fill(0.3);
    const right = new Float32Array(1000).fill(0.8);

    accumulator.processChunk({
      channelData: [left, right],
      sampleOffset: 0,
      frameCount: 1000,
      totalSamples
    });

    const peaks = accumulator.finish();
    expect(peaks.length).toBe(200);
    for (let b = 0; b < 200; b++) {
      expect(peaks[b]).toBeCloseTo(0.8, 2);
    }
  });

  it('produces all 0.0s for pure silence', () => {
    const totalSamples = 4000;
    const accumulator = new WaveformAccumulator(totalSamples);

    const silence = new Float32Array(4000).fill(0.0);
    accumulator.processChunk({
      channelData: [silence],
      sampleOffset: 0,
      frameCount: 4000,
      totalSamples
    });

    const peaks = accumulator.finish();
    expect(peaks.length).toBe(200);
    for (let i = 0; i < peaks.length; i++) {
      expect(peaks[i]).toBe(0.0);
    }
  });

  it('clamps overshooting / clipping signals strictly to 1.0', () => {
    const totalSamples = 1000;
    const accumulator = new WaveformAccumulator(totalSamples);

    const clipped = new Float32Array(1000).fill(2.5);
    accumulator.processChunk({
      channelData: [clipped],
      sampleOffset: 0,
      frameCount: 1000,
      totalSamples
    });

    const peaks = accumulator.finish();
    expect(peaks.length).toBe(200);
    for (let i = 0; i < peaks.length; i++) {
      expect(peaks[i]).toBe(1.0);
    }
  });

  it('handles very short audio tracks (<200 samples)', () => {
    const totalSamples = 50;
    const accumulator = new WaveformAccumulator(totalSamples);

    const shortSamples = new Float32Array(50).map((_, i) => (i % 2 === 0 ? 0.8 : -0.4));
    accumulator.processChunk({
      channelData: [shortSamples],
      sampleOffset: 0,
      frameCount: 50,
      totalSamples
    });

    const peaks = accumulator.finish();
    expect(peaks.length).toBe(200);
    expect(peaks.some((p) => p > 0)).toBe(true);
  });

  it('is strictly deterministic: identical inputs yield identical 200 bins', () => {
    const totalSamples = 8000;
    const inputLeft = new Float32Array(8000).map((_, i) => Math.sin(i * 0.05) * 0.85);

    const acc1 = new WaveformAccumulator(totalSamples);
    acc1.processChunk({
      channelData: [inputLeft],
      sampleOffset: 0,
      frameCount: 8000,
      totalSamples
    });
    const peaks1 = acc1.finish();

    const acc2 = new WaveformAccumulator(totalSamples);
    acc2.processChunk({
      channelData: [inputLeft],
      sampleOffset: 0,
      frameCount: 8000,
      totalSamples
    });
    const peaks2 = acc2.finish();

    expect(peaks1).toEqual(peaks2);
  });
});
