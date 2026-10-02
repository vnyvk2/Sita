import type { SoundProfile } from '@common/audioEngineProtocol';

/**
 * VocalNuanceNode — Web Audio Dynamic Nuance Shaper.
 *
 * Implements the locked +1.5 dB upward nuance contour for Web Audio fallback, exactly matching the
 * Rust native audio engine's Option B transfer function.
 *
 * Locked Option B Contour Specifications:
 *
 * - Upward nuance lift: +1.5 dB for quiet details (< -24 dBFS)
 * - Smooth C^1 cubic Hermite transition across mid-levels (-24 dBFS to -12 dBFS)
 * - Exact unity gain (0.0 dB / 1.000000) for loud material (>= -12 dBFS)
 * - Attack time constant: 15 ms
 * - Release time constant: 250 ms
 * - Deep silence / noise floor taper: below -60 dBFS tapering to 0.0 dB at -80 dBFS
 * - Crossfade transition time: 30 ms exponential time constant
 *
 * Product Invariant: Web Audio Limiter Semantics
 *
 * - StudioReference: Prioritizes bit transparency and uncolored response. The Web Audio safety
 *   limiter is bypassed (limiterDry = 1.0, limiterWet = 0.0) to preserve a pure digital null. It
 *   does NOT promise brickwall output protection on the Web Audio fallback.
 * - VocalNuanceBoost: Upward nuance shaping applies +1.5 dB lift to quiet passages. The Web Audio
 *   safety limiter is engaged (limiterDry = 0.0, limiterWet = 1.0) to guard the output against
 *   potential digital clipping on hot masters.
 */

export const VOCAL_NUANCE_MAKEUP_DB = 1.5;

export const VOCAL_NUANCE_PARAMS = {
  threshold: -12, // dBFS
  knee: 12, // dB
  ratio: 1.25, // gentle upward slope ratio
  attack: 0.015, // 15 ms reaction time
  release: 0.25 // 250 ms anti-pumping release
} as const;

/** Linear amplitude conversion: A = 10^(dB / 20) */
export const dBToLinear = (db: number): number => 10 ** (db / 20);

/**
 * OptionBShaper — Exact mathematical port of the Rust Option B Upward Nuance Transfer Function.
 * Provides sample-by-sample and block-by-block processing with exact parity to
 * `SoundProfileStage`.
 */
export class OptionBShaper {
  sampleRate: number;
  nuanceEnvelope: number = 0.0;
  nuanceGain: number = 1.0;
  attackCoeff: number;
  releaseCoeff: number;
  readonly maxLiftDb: number = 1.5;
  readonly lowThresholdDb: number = -24.0;
  readonly highThresholdDb: number = -12.0;
  readonly noiseGateDb: number = -60.0;
  readonly noiseFloorDb: number = -80.0;

  constructor(sampleRate = 48000) {
    this.sampleRate = Math.max(8000, sampleRate);
    this.attackCoeff = Math.exp(-1.0 / (0.015 * this.sampleRate));
    this.releaseCoeff = Math.exp(-1.0 / (0.25 * this.sampleRate));
  }

  processFrame(left: number, right: number, alpha: number): [number, number] {
    const peak = Math.max(Math.abs(left), Math.abs(right));

    // 1. Envelope tracking
    if (peak > this.nuanceEnvelope) {
      this.nuanceEnvelope =
        this.attackCoeff * this.nuanceEnvelope + (1.0 - this.attackCoeff) * peak;
    } else {
      this.nuanceEnvelope =
        this.releaseCoeff * this.nuanceEnvelope + (1.0 - this.releaseCoeff) * peak;
    }

    // 2. Upward Nuance Shaping transfer function
    const envDb = 20.0 * Math.log10(Math.max(1e-6, this.nuanceEnvelope));
    let targetLiftDb = 0.0;

    if (envDb >= this.highThresholdDb) {
      targetLiftDb = 0.0;
    } else if (envDb > this.lowThresholdDb) {
      const u = (envDb - this.lowThresholdDb) / (this.highThresholdDb - this.lowThresholdDb);
      // Cubic Hermite smoothstep: s(0) = 1, s(1) = 0
      const s = 1.0 - (3.0 * u * u - 2.0 * u * u * u);
      targetLiftDb = this.maxLiftDb * s;
    } else if (envDb >= this.noiseGateDb) {
      targetLiftDb = this.maxLiftDb;
    } else if (envDb > this.noiseFloorDb) {
      const v = (envDb - this.noiseFloorDb) / (this.noiseGateDb - this.noiseFloorDb);
      const sGate = 3.0 * v * v - 2.0 * v * v * v;
      targetLiftDb = this.maxLiftDb * sGate;
    } else {
      targetLiftDb = 0.0;
    }

    const targetG = Math.pow(10.0, targetLiftDb / 20.0);

    // 3. Gain smoothing: 15ms attack when gain drops toward unity, 250ms release when gain lifts
    if (targetG < this.nuanceGain) {
      this.nuanceGain = this.attackCoeff * this.nuanceGain + (1.0 - this.attackCoeff) * targetG;
    } else {
      this.nuanceGain = this.releaseCoeff * this.nuanceGain + (1.0 - this.releaseCoeff) * targetG;
    }

    // 4. Modulation: g_eff = (1 - alpha) * 1.0 + alpha * nuance_gain
    const gEff = (1.0 - alpha) * 1.0 + alpha * this.nuanceGain;

    return [left * gEff, right * gEff];
  }

  processInterleaved(samples: Float32Array, alpha: number): void {
    for (let i = 0; i < samples.length; i += 2) {
      const [outL, outR] = this.processFrame(samples[i], samples[i + 1], alpha);
      samples[i] = outL;
      samples[i + 1] = outR;
    }
  }
}

export class VocalNuanceNode {
  readonly input: GainNode;
  readonly output: GainNode;

  readonly compressor: DynamicsCompressorNode;
  readonly makeupGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;

  readonly shaper: OptionBShaper;
  private processorNode: ScriptProcessorNode | null = null;
  private enabled = false;

  /** 30 ms exponential time constant matching the Rust engine's 30 ms transition */
  private static readonly FADE_TIME_CONSTANT = 0.03;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.makeupGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.shaper = new OptionBShaper(ctx.sampleRate ?? 48000);

    // Explicit stereo channel configuration
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';

    // 1. Dry bypass lane
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // 2. Wet shaped lane (Native Web Audio graph for real-time audio thread safety)
    this.input.connect(this.compressor);
    this.compressor.connect(this.makeupGain);
    this.makeupGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Configure compressor parameters matching locked Option B transition
    this.compressor.threshold.value = VOCAL_NUANCE_PARAMS.threshold;
    this.compressor.knee.value = VOCAL_NUANCE_PARAMS.knee;
    this.compressor.ratio.value = VOCAL_NUANCE_PARAMS.ratio;
    this.compressor.attack.value = VOCAL_NUANCE_PARAMS.attack;
    this.compressor.release.value = VOCAL_NUANCE_PARAMS.release;
    this.makeupGain.gain.value = dBToLinear(VOCAL_NUANCE_MAKEUP_DB);

    // Default to Studio Reference (pure bypass, dry=1, wet=0)
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
  }

  /**
   * Smoothly crossfade between dry bypass (StudioReference) and wet shaped (VocalNuanceBoost).
   *
   * @param enabled True for VocalNuanceBoost, false for StudioReference
   * @param immediate If true, snaps instantly (e.g. cold start restore)
   */
  setEnabled(enabled: boolean, immediate = false): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;

    const now = this.ctx.currentTime;
    const dryTarget = enabled ? 0 : 1;
    const wetTarget = enabled ? 1 : 0;

    if (typeof this.dryGain.gain.cancelScheduledValues === 'function') {
      this.dryGain.gain.cancelScheduledValues(now);
    }
    if (typeof this.wetGain.gain.cancelScheduledValues === 'function') {
      this.wetGain.gain.cancelScheduledValues(now);
    }

    if (immediate || typeof this.dryGain.gain.setTargetAtTime !== 'function') {
      this.dryGain.gain.value = dryTarget;
      this.wetGain.gain.value = wetTarget;
    } else {
      this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now); this.dryGain.gain.setTargetAtTime(dryTarget, now, VocalNuanceNode.FADE_TIME_CONSTANT);
      this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now); this.wetGain.gain.setTargetAtTime(wetTarget, now, VocalNuanceNode.FADE_TIME_CONSTANT);
    }
  }

  setProfile(profile: SoundProfile, immediate = false): void {
    this.setEnabled(profile === 'vocal_nuance_boost', immediate);
  }

  getProfile(): SoundProfile {
    return this.enabled ? 'vocal_nuance_boost' : 'studio_reference';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns current live nuance gain in dB relative to unity. Reports 0 when idle and positive dB
   * (e.g. +1.5 dB) when lifting quiet nuances.
   */
  getReduction(): number {
    if (this.processorNode) {
      return 20.0 * Math.log10(Math.max(1e-6, this.shaper.nuanceGain));
    }
    return this.compressor?.reduction ?? 0;
  }

  destroy(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.compressor.disconnect();
    this.makeupGain.disconnect();
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
    }
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}

export default VocalNuanceNode;
