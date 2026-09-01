import { describe, expect, it } from 'vitest';

import {
  BS1770LoudnessEngine,
  getChannelWeighting,
  getKWeightingCoefficients
} from '../../../../../src/main/workers/process/audio/BS1770LoudnessEngine';

describe('Gate D2-R2: BS1770LoudnessEngine (ITU-R BS.1770-4 Gating, Chunk Boundaries & Calibration)', () => {
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

  it('maintains numerical stability and O(1) rolling accumulation across 100,000 samples at 44.1k, 48k, 96k, and 192k Hz', () => {
    const rates = [44100, 48000, 96000, 192000];

    for (const rate of rates) {
      const engine = new BS1770LoudnessEngine(rate, 2);
      const frameCount = 10000;
      const totalFrames = 100000;

      for (let offset = 0; offset < totalFrames; offset += frameCount) {
        const left = new Float32Array(frameCount).map(
          (_, i) => Math.sin((offset + i) * 0.05) * 0.8
        );
        const right = new Float32Array(frameCount).map(
          (_, i) => Math.cos((offset + i) * 0.05) * 0.8
        );

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

  describe('Chunk Boundary Invariants & Exact Duration Boundaries', () => {
    it('produces identical loudness when audio is processed in a single chunk vs arbitrary small chunks', () => {
      const sampleRate = 48000;
      const totalFrames = sampleRate * 3; // 3 seconds

      const left = new Float32Array(totalFrames);
      const right = new Float32Array(totalFrames);
      for (let i = 0; i < totalFrames; i++) {
        const s = 0.5 * Math.sin(2 * Math.PI * 440 * (i / sampleRate));
        left[i] = s;
        right[i] = s;
      }

      // 1. Single chunk execution
      const engineSingle = new BS1770LoudnessEngine(sampleRate, 2);
      engineSingle.processChunk({
        channelData: [left, right],
        sampleOffset: 0,
        frameCount: totalFrames,
        totalSamples: totalFrames
      });
      const resultSingle = engineSingle.finish();

      // 2. Fragmented execution across arbitrary chunk sizes (e.g. 512 frames, 16384 frames, 73 frames)
      const engineChunked = new BS1770LoudnessEngine(sampleRate, 2);
      const chunkSizes = [512, 16384, 1024, 73, 8192, 2048];
      let offset = 0;
      let sizeIdx = 0;

      while (offset < totalFrames) {
        const size = Math.min(chunkSizes[sizeIdx % chunkSizes.length], totalFrames - offset);
        const chunkL = left.subarray(offset, offset + size);
        const chunkR = right.subarray(offset, offset + size);

        engineChunked.processChunk({
          channelData: [chunkL, chunkR],
          sampleOffset: offset,
          frameCount: size,
          totalSamples: totalFrames
        });

        offset += size;
        sizeIdx++;
      }

      const resultChunked = engineChunked.finish();

      expect(resultChunked.integratedLoudness).toBe(resultSingle.integratedLoudness);
      expect(resultChunked.samplePeak).toBe(resultSingle.samplePeak);
      expect(resultChunked.blocksProcessed).toBe(resultSingle.blocksProcessed);
      expect(resultChunked.blocksSurvivingGate).toBe(resultSingle.blocksSurvivingGate);
    });

    it('evaluates exactly 1 block at 400ms, 400ms + 1 frame, and 499ms, and 2 blocks at 500ms (48 kHz)', () => {
      const sampleRate = 48000;
      const blockSize = Math.floor(0.4 * sampleRate); // 19,200 frames (400ms)
      const hopSize = Math.floor(0.1 * sampleRate); // 4,800 frames (100ms)

      // Test 1: Exactly 400ms (19,200 frames) -> 1 block
      const engine400 = new BS1770LoudnessEngine(sampleRate, 2);
      const audio400 = new Float32Array(blockSize).fill(0.1);
      engine400.processChunk({
        channelData: [audio400, audio400],
        sampleOffset: 0,
        frameCount: blockSize,
        totalSamples: blockSize
      });
      const res400 = engine400.finish();
      expect(res400.blocksProcessed).toBe(1);
      expect(res400.blocksSurvivingGate).toBe(1);

      // Test 2: Exactly 400ms + 1 frame (19,201 frames) -> 1 block
      const engine400Plus1 = new BS1770LoudnessEngine(sampleRate, 2);
      const audio400Plus1 = new Float32Array(blockSize + 1).fill(0.1);
      engine400Plus1.processChunk({
        channelData: [audio400Plus1, audio400Plus1],
        sampleOffset: 0,
        frameCount: blockSize + 1,
        totalSamples: blockSize + 1
      });
      const res400Plus1 = engine400Plus1.finish();
      expect(res400Plus1.blocksProcessed).toBe(1);

      // Test 3: 499ms (19,200 + 4,752 = 23,952 frames) -> 1 block
      const frames499 = Math.floor(0.499 * sampleRate);
      const engine499 = new BS1770LoudnessEngine(sampleRate, 2);
      const audio499 = new Float32Array(frames499).fill(0.1);
      engine499.processChunk({
        channelData: [audio499, audio499],
        sampleOffset: 0,
        frameCount: frames499,
        totalSamples: frames499
      });
      const res499 = engine499.finish();
      expect(res499.blocksProcessed).toBe(1);

      // Test 4: Exactly 500ms (19,200 + 4,800 = 24,000 frames) -> 2 blocks (first block + 1st hop)
      const frames500 = blockSize + hopSize;
      const engine500 = new BS1770LoudnessEngine(sampleRate, 2);
      const audio500 = new Float32Array(frames500);
      for (let i = 0; i < frames500; i++) {
        audio500[i] = 0.1 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      }
      engine500.processChunk({
        channelData: [audio500, audio500],
        sampleOffset: 0,
        frameCount: frames500,
        totalSamples: frames500
      });
      const res500 = engine500.finish();
      expect(res500.blocksProcessed).toBe(2);
      expect(res500.blocksSurvivingGate).toBe(2);
    });

    it('evaluates blocks across 400ms split evenly across 2 chunks (200ms + 200ms)', () => {
      const sampleRate = 48000;
      const frames200ms = Math.floor(0.2 * sampleRate);
      const audio200 = new Float32Array(frames200ms).fill(0.1);

      const engine = new BS1770LoudnessEngine(sampleRate, 2);
      // Chunk 1: 200ms
      engine.processChunk({
        channelData: [audio200, audio200],
        sampleOffset: 0,
        frameCount: frames200ms,
        totalSamples: frames200ms * 2
      });
      // Chunk 2: 200ms (completes 400ms block)
      engine.processChunk({
        channelData: [audio200, audio200],
        sampleOffset: frames200ms,
        frameCount: frames200ms,
        totalSamples: frames200ms * 2
      });

      const res = engine.finish();
      expect(res.blocksProcessed).toBe(1);
      expect(res.blocksSurvivingGate).toBe(1);
      expect(Number.isFinite(res.integratedLoudness)).toBe(true);
    });
  });

  describe('BS.1770 Mathematical / Calibration Verification Vectors', () => {
    it('measures 1 kHz Stereo Sine calibrated for -23.00 LUFS target (EBU R128 reference level)', () => {
      const sampleRate = 48000;
      const durationSeconds = 3;
      const totalFrames = sampleRate * durationSeconds;

      const engine = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);

      // Amplitude for -23.00 LUFS stereo: 10^((-23.00 + 0.069) / 20) ≈ 0.07137
      const targetAmp = Math.pow(10, (-23.0 + 0.069) / 20);
      const left = new Float32Array(totalFrames);
      const right = new Float32Array(totalFrames);
      for (let i = 0; i < totalFrames; i++) {
        const s = targetAmp * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
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
      expect(result.integratedLoudness).toBeCloseTo(-23.0, 1);
      expect(result.samplePeak).toBeCloseTo(targetAmp, 3);
    });

    it('measures 1 kHz single-channel Left-only sine wave at 0 dBFS to within -3.08 LUFS (+/- 0.05 LU)', () => {
      const sampleRate = 48000;
      const durationSeconds = 3;
      const totalFrames = sampleRate * durationSeconds;

      const engine = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);

      const left = new Float32Array(totalFrames);
      const right = new Float32Array(totalFrames).fill(0.0);
      for (let i = 0; i < totalFrames; i++) {
        left[i] = 1.0 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      }

      engine.processChunk({
        channelData: [left, right],
        sampleOffset: 0,
        frameCount: totalFrames,
        totalSamples: totalFrames
      });

      const result = engine.finish();
      expect(result.integratedLoudness).toBeCloseTo(-3.08, 1);
      expect(result.samplePeak).toBeCloseTo(1.0, 3);
    });

    it('measures 1 kHz single-channel Right-only sine wave at 0 dBFS to within -3.08 LUFS (+/- 0.05 LU)', () => {
      const sampleRate = 48000;
      const durationSeconds = 3;
      const totalFrames = sampleRate * durationSeconds;

      const engine = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);

      const left = new Float32Array(totalFrames).fill(0.0);
      const right = new Float32Array(totalFrames);
      for (let i = 0; i < totalFrames; i++) {
        right[i] = 1.0 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      }

      engine.processChunk({
        channelData: [left, right],
        sampleOffset: 0,
        frameCount: totalFrames,
        totalSamples: totalFrames
      });

      const result = engine.finish();
      expect(result.integratedLoudness).toBeCloseTo(-3.08, 1);
      expect(result.samplePeak).toBeCloseTo(1.0, 3);
    });

    it('measures 1 kHz stereo sine wave at 0 dBFS in phase to within -0.07 LUFS (+/- 0.05 LU)', () => {
      const sampleRate = 48000;
      const durationSeconds = 3;
      const totalFrames = sampleRate * durationSeconds;

      const engine = new BS1770LoudnessEngine(sampleRate, 2, ['L', 'R']);

      const left = new Float32Array(totalFrames);
      const right = new Float32Array(totalFrames);
      for (let i = 0; i < totalFrames; i++) {
        const s = 1.0 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
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
        const s = 0.1 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
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
  });

  describe('Gating and Edge Cases', () => {
    it('gates out quiet blocks below the -10 LU relative threshold', () => {
      const sampleRate = 48000;
      const engine = new BS1770LoudnessEngine(sampleRate, 1, ['Mono']);

      // Segment A: 3 seconds loud at ~ -15.3 LUFS (amp = 0.25)
      const framesA = sampleRate * 3;
      const dataA = new Float32Array(framesA);
      for (let i = 0; i < framesA; i++) {
        dataA[i] = 0.25 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      }

      // Segment B: 3 seconds very quiet at ~ -40 LUFS (amp = 0.015, more than 10 LU below Segment A)
      const framesB = sampleRate * 3;
      const dataB = new Float32Array(framesB);
      for (let i = 0; i < framesB; i++) {
        dataB[i] = 0.015 * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      }

      engine.processChunk({
        channelData: [dataA],
        sampleOffset: 0,
        frameCount: framesA,
        totalSamples: framesA + framesB
      });
      engine.processChunk({
        channelData: [dataB],
        sampleOffset: framesA,
        frameCount: framesB,
        totalSamples: framesA + framesB
      });

      const result = engine.finish();
      expect(result.integratedLoudness).toBeCloseTo(-15.3, 1);
      expect(result.blocksSurvivingGate).toBeLessThan(result.blocksProcessed);
    });

    it('strictly returns -Infinity for tracks shorter than the 400ms gating block window (< 400ms)', () => {
      const sampleRate = 48000;
      const engine = new BS1770LoudnessEngine(sampleRate, 2);

      // 100ms of audio (only 4800 frames, less than 400ms block size of 19200 frames)
      const frames = Math.floor(0.1 * sampleRate);
      const audio = new Float32Array(frames).fill(0.5);

      engine.processChunk({
        channelData: [audio, audio],
        sampleOffset: 0,
        frameCount: frames,
        totalSamples: frames
      });

      const result = engine.finish();
      // Invariant: strict BS.1770 compliance requires 400ms gating window
      expect(result.integratedLoudness).toBe(-Infinity);
      expect(result.samplePeak).toBeCloseTo(0.5, 3);
      expect(result.blocksProcessed).toBe(0);
      expect(result.blocksSurvivingGate).toBe(0);
    });

    it('is idempotent on multiple finish() calls and throws on subsequent processChunk()', () => {
      const sampleRate = 48000;
      const engine = new BS1770LoudnessEngine(sampleRate, 2);

      const frames = sampleRate * 1;
      const audio = new Float32Array(frames).fill(0.1);
      engine.processChunk({
        channelData: [audio, audio],
        sampleOffset: 0,
        frameCount: frames,
        totalSamples: frames
      });

      const res1 = engine.finish();
      const res2 = engine.finish();
      expect(res1).toBe(res2); // Same object reference

      // Processing chunks after finish throws
      expect(() => {
        engine.processChunk({
          channelData: [audio, audio],
          sampleOffset: frames,
          frameCount: frames,
          totalSamples: frames * 2
        });
      }).toThrow(/already been finalized/i);
    });

    it('rejects unknown channel layouts explicitly rather than assigning silent 1.0 weight', () => {
      expect(() => {
        new BS1770LoudnessEngine(48000, 3, ['L', 'R', 'Unknown']);
      }).toThrow(/unknown channel position/i);

      expect(() => {
        getChannelWeighting('Unknown');
      }).toThrow(/unknown channel position/i);
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
});
