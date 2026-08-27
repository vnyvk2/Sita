import { describe, expect, it } from 'vitest';
import {
  BS1770LoudnessEngine,
  getChannelWeighting,
  getKWeightingCoefficients
} from '../../../../../src/main/workers/process/audio/BS1770LoudnessEngine';

describe('Gate D2: BS1770LoudnessEngine (ITU-R BS.1770-4 / EBU R128 Conformance)', () => {
  it('matches ITU-R BS.1770-4 Table 1 & Table 2 filter coefficients at 48 kHz', () => {
    const { stage1, stage2 } = getKWeightingCoefficients(48000);

    // Stage 1 (Pre-filter High Shelf)
    expect(stage1.b0).toBeCloseTo(1.53512485958697, 6);
    expect(stage1.b1).toBeCloseTo(-2.69169618940638, 6);
    expect(stage1.b2).toBeCloseTo(1.19839281085285, 6);
    expect(stage1.a1).toBeCloseTo(-1.69065929318241, 6);
    expect(stage1.a2).toBeCloseTo(0.73248077421585, 6);

    // Stage 2 (RLB High Pass)
    expect(stage2.b0).toBeCloseTo(1.0 / 1.0049944, 4);
    expect(stage2.b1).toBeCloseTo(-2.0 / 1.0049944, 4);
    expect(stage2.b2).toBeCloseTo(1.0 / 1.0049944, 4);
    expect(stage2.a1).toBeCloseTo(-1.99004745483398, 5);
    expect(stage2.a2).toBeCloseTo(0.99007225036621, 5);
  });

  it('maintains numerical stability across 100,000 samples at 44.1k, 48k, 96k, and 192k Hz without NaN or overflow', () => {
    const rates = [44100, 48000, 96000, 192000];

    for (const rate of rates) {
      const engine = new BS1770LoudnessEngine(rate, 2);
      const frameCount = 10000;
      const totalFrames = 100000;

      for (let offset = 0; offset < totalFrames; offset += frameCount) {
        const left = new Float32Array(frameCount).map((_, i) => Math.sin((offset + i) * 0.05) * 0.8);
        const right = new Float32Array(frameCount).map((_, i) => Math.cos((offset + i) * 0.05) * 0.8);

        engine.processChunk({
          channelData: [left, right],
          sampleOffset: offset,
          frameCount,
          totalSamples: totalFrames
        });
      }

      const result = engine.finish();
      expect(Number.isFinite(result.integratedLoudness)).toBe(true);
      expect(Number.isNaN(result.integratedLoudness)).toBe(false);
      expect(result.samplePeak).toBeCloseTo(0.8, 2);
    }
  });

  it('measures 1 kHz single-channel mono sine wave at 0 dBFS to within -3.08 LUFS (+/- 0.05 LU)', () => {
    const sampleRate = 48000;
    const durationSeconds = 3;
    const totalFrames = sampleRate * durationSeconds;

    const engine = new BS1770LoudnessEngine(sampleRate, 1, ['Mono']);

    // 1 kHz sine at 0 dBFS (peak = 1.0)
    const monoData = new Float32Array(totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      const t = i / sampleRate;
      monoData[i] = 1.0 * Math.sin(2 * Math.PI * 1000 * t);
    }

    engine.processChunk({
      channelData: [monoData],
      sampleOffset: 0,
      frameCount: totalFrames,
      totalSamples: totalFrames
    });

    const result = engine.finish();
    expect(result.integratedLoudness).toBeCloseTo(-3.08, 1);
    expect(result.samplePeak).toBeCloseTo(1.0, 3);
    expect(result.samplePeakDb).toBeCloseTo(0.0, 1);
  });

  it('measures 1 kHz stereo sine wave at 0 dBFS in phase to within -0.07 LUFS (+/- 0.05 LU)', () => {
    const sampleRate = 48000;
    const durationSeconds = 3;
    const totalFrames = sampleRate * durationSeconds;

    const engine = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);

    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      const t = i / sampleRate;
      const s = 1.0 * Math.sin(2 * Math.PI * 1000 * t);
      left[i] = s;
      right[i] = s;
    }

    engine.processChunk({
      channelData: [left, right],
      sampleOffset: 0,
      frameCount: totalFrames,
      totalSamples: totalFrames
    });

    const result = engine.finish();
    expect(result.integratedLoudness).toBeCloseTo(-0.07, 1);
    expect(result.samplePeak).toBeCloseTo(1.0, 3);
  });

  it('measures 1 kHz stereo sine wave at -20 dBFS (amplitude 0.1) to within -20.07 LUFS (+/- 0.05 LU)', () => {
    const sampleRate = 48000;
    const durationSeconds = 3;
    const totalFrames = sampleRate * durationSeconds;

    const engine = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);

    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      const t = i / sampleRate;
      const s = 0.1 * Math.sin(2 * Math.PI * 1000 * t);
      left[i] = s;
      right[i] = s;
    }

    engine.processChunk({
      channelData: [left, right],
      sampleOffset: 0,
      frameCount: totalFrames,
      totalSamples: totalFrames
    });

    const result = engine.finish();
    expect(result.integratedLoudness).toBeCloseTo(-20.07, 1);
    expect(result.samplePeak).toBeCloseTo(0.1, 3);
    expect(result.samplePeakDb).toBeCloseTo(-20.0, 1);
  });

  it('gates out quiet blocks below the -10 LU relative threshold', () => {
    const sampleRate = 48000;
    const engine = new BS1770LoudnessEngine(sampleRate, 1, ['Mono']);

    // Segment A: 3 seconds loud at ~ -15 LUFS (amp ~ 0.25)
    const framesA = sampleRate * 3;
    const dataA = new Float32Array(framesA);
    for (let i = 0; i < framesA; i++) {
      dataA[i] = 0.25 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
    }

    // Segment B: 3 seconds very quiet at ~ -40 LUFS (amp ~ 0.015, more than 10 LU below Segment A)
    const framesB = sampleRate * 3;
    const dataB = new Float32Array(framesB);
    for (let i = 0; i < framesB; i++) {
      dataB[i] = 0.015 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
    }

    engine.processChunk({ channelData: [dataA], sampleOffset: 0, frameCount: framesA, totalSamples: framesA + framesB });
    engine.processChunk({ channelData: [dataB], sampleOffset: framesA, frameCount: framesB, totalSamples: framesA + framesB });

    const result = engine.finish();
    // Segment B blocks should be gated out by relative gate, so integrated loudness reflects Segment A alone
    expect(result.integratedLoudness).toBeCloseTo(-15.3, 1);
    expect(result.blocksGated).toBeLessThan(result.blocksProcessed);
  });

  it('weights surround channels with +1.5 dB and excludes LFE channels', () => {
    expect(getChannelWeighting('Ls')).toBeCloseTo(1.4125, 4);
    expect(getChannelWeighting('Rs')).toBeCloseTo(1.4125, 4);
    expect(getChannelWeighting('LFE')).toBe(0.0);
    expect(getChannelWeighting('L')).toBe(1.0);
    expect(getChannelWeighting('R')).toBe(1.0);
    expect(getChannelWeighting('C')).toBe(1.0);
    expect(getChannelWeighting('Mono')).toBe(1.0);
  });

  it('returns -Infinity for pure silence', () => {
    const sampleRate = 44100;
    const engine = new BS1770LoudnessEngine(sampleRate, 2);

    const silence = new Float32Array(sampleRate * 2).fill(0.0);
    engine.processChunk({
      channelData: [silence, silence],
      sampleOffset: 0,
      frameCount: sampleRate * 2,
      totalSamples: sampleRate * 2
    });

    const result = engine.finish();
    expect(result.integratedLoudness).toBe(-Infinity);
    expect(result.samplePeak).toBe(0.0);
    expect(result.samplePeakDb).toBe(-Infinity);
    expect(result.truePeak).toBeNull();
  });
});
