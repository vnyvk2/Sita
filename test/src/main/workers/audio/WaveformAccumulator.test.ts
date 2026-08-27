import { describe, expect, it } from 'vitest';
import { WaveformAccumulator, WAVEFORM_NUM_BINS } from '../../../../../src/main/workers/process/audio/WaveformAccumulator';

describe('Gate D1: WaveformAccumulator (Streaming O(1) Memory)', () => {
  it('produces exactly 200 normalized bins in range [0.0, 1.0]', () => {
    const totalSamples = 10000;
    const accumulator = new WaveformAccumulator(totalSamples);

    // Feed a chunk of 5,000 samples
    const channelLeft = new Float32Array(5000).map((_, i) => Math.sin(i * 0.1) * 0.7);
    const channelRight = new Float32Array(5000).map((_, i) => Math.cos(i * 0.1) * 0.5);

    accumulator.processChunk({
      channelData: [channelLeft, channelRight],
      sampleOffset: 0,
      frameCount: 5000,
      totalSamples
    });

    // Feed second chunk of 5,000 samples
    const channelLeft2 = new Float32Array(5000).fill(0.9);
    const channelRight2 = new Float32Array(5000).fill(0.4);

    accumulator.processChunk({
      channelData: [channelLeft2, channelRight2],
      sampleOffset: 5000,
      frameCount: 5000,
      totalSamples
    });

    const peaks = accumulator.finish();
    expect(peaks).toBeInstanceOf(Float32Array);
    expect(peaks.length).toBe(WAVEFORM_NUM_BINS);

    // Verify first half has peak ~0.7, second half has peak 0.9
    expect(peaks[50]).toBeCloseTo(0.7, 1);
    expect(peaks[150]).toBeCloseTo(0.9, 1);

    // Verify all bins are within [0.0, 1.0]
    for (let i = 0; i < peaks.length; i++) {
      expect(peaks[i]).toBeGreaterThanOrEqual(0.0);
      expect(peaks[i]).toBeLessThanOrEqual(1.0);
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

  it('handles full-scale clipping signal safely (clamps to 1.0)', () => {
    const totalSamples = 1000;
    const accumulator = new WaveformAccumulator(totalSamples);

    const clipped = new Float32Array(1000).fill(1.5); // Overshoot
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
    const totalSamples = 50; // Shorter than 200 bins
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
