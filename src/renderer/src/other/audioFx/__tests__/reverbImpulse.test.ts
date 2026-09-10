import {
  generateReverbImpulse,
  getOrCreateReverbBuffer,
  getReverbCacheSizeForContext
} from '../reverbImpulse';

describe('generateReverbImpulse', () => {
  it('generates stereo float32 buffers of the correct length and sample rate', () => {
    const sampleRate = 44100;
    const duration = 2.0;
    const decay = 2.5;

    const result = generateReverbImpulse(sampleRate, duration, decay);

    expect(result.sampleRate).toBe(sampleRate);
    expect(result.length).toBe(sampleRate * duration);
    expect(result.leftChannel).toBeInstanceOf(Float32Array);
    expect(result.rightChannel).toBeInstanceOf(Float32Array);
    expect(result.leftChannel.length).toBe(sampleRate * duration);
    expect(result.rightChannel.length).toBe(sampleRate * duration);
  });

  it('clamps extreme inputs to safe ranges', () => {
    // Negative duration and huge decay
    const result = generateReverbImpulse(0, -5, 50);

    expect(result.sampleRate).toBe(44100);
    expect(result.length).toBe(Math.floor(44100 * 0.1)); // clamped to 0.1s minimum
  });

  it('removes DC bias and scales peaks safely below clipping threshold', () => {
    const result = generateReverbImpulse(48000, 1.5, 3.0);

    let maxPeak = 0;
    let sumL = 0;
    let sumR = 0;

    for (let i = 0; i < result.length; i++) {
      const absL = Math.abs(result.leftChannel[i]);
      const absR = Math.abs(result.rightChannel[i]);
      if (absL > maxPeak) maxPeak = absL;
      if (absR > maxPeak) maxPeak = absR;
      sumL += result.leftChannel[i];
      sumR += result.rightChannel[i];
    }

    // Peak is normalized to ~0.8 (never >= 1.0)
    expect(maxPeak).toBeLessThanOrEqual(0.85);

    // Mean offset should be virtually zero (< 0.001)
    const meanL = Math.abs(sumL / result.length);
    const meanR = Math.abs(sumR / result.length);
    expect(meanL).toBeLessThan(0.001);
    expect(meanR).toBeLessThan(0.001);
  });

  it('exhibits exponential decay over time', () => {
    const result = generateReverbImpulse(44100, 2.0, 4.0);

    // Calculate RMS in the first 10% vs last 10%
    const sliceLen = Math.floor(result.length * 0.1);
    let earlyEnergy = 0;
    let lateEnergy = 0;

    for (let i = 0; i < sliceLen; i++) {
      earlyEnergy += result.leftChannel[i] * result.leftChannel[i];
    }
    for (let i = result.length - sliceLen; i < result.length; i++) {
      lateEnergy += result.leftChannel[i] * result.leftChannel[i];
    }

    const earlyRms = Math.sqrt(earlyEnergy / sliceLen);
    const lateRms = Math.sqrt(lateEnergy / sliceLen);

    // Tail energy must be significantly lower than initial transient energy
    expect(earlyRms).toBeGreaterThan(lateRms * 5);
  });
});

describe('getOrCreateReverbBuffer', () => {
  const createMockAudioContext = (sampleRate = 48000): AudioContext => {
    return {
      sampleRate,
      createBuffer: vi.fn((channels: number, length: number, sr: number) => {
        const left = new Float32Array(length);
        const right = new Float32Array(length);
        return {
          numberOfChannels: channels,
          length,
          sampleRate: sr,
          getChannelData: (c: number) => (c === 0 ? left : right)
        } as unknown as AudioBuffer;
      })
    } as unknown as AudioContext;
  };

  it('reuses cached buffer for identical parameters on the same context', () => {
    const ctx = createMockAudioContext(48000);
    const buf1 = getOrCreateReverbBuffer(ctx, 2.0, 2.5);
    const buf2 = getOrCreateReverbBuffer(ctx, 2.0, 2.5);

    expect(buf1).toBe(buf2);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(getReverbCacheSizeForContext(ctx)).toBe(1);
  });

  it('isolates cache per AudioContext avoiding cross-context leakage', () => {
    const ctx1 = createMockAudioContext(48000);
    const ctx2 = createMockAudioContext(48000);

    const bufCtx1 = getOrCreateReverbBuffer(ctx1, 2.0, 2.5);
    const bufCtx2 = getOrCreateReverbBuffer(ctx2, 2.0, 2.5);

    // Buffers belong to their respective context
    expect(bufCtx1).not.toBe(bufCtx2);
    expect(ctx1.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx2.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('caps cache size per context to at most 2 buffers', () => {
    const ctx = createMockAudioContext(48000);

    getOrCreateReverbBuffer(ctx, 1.0, 2.0); // entry 1
    getOrCreateReverbBuffer(ctx, 2.0, 2.0); // entry 2
    expect(getReverbCacheSizeForContext(ctx)).toBe(2);

    getOrCreateReverbBuffer(ctx, 3.0, 2.0); // entry 3 (should evict entry 1)
    expect(getReverbCacheSizeForContext(ctx)).toBe(2);
  });
});
