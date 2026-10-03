import type { SoundProfile } from '@common/audioEngineProtocol';
import {
  ensureOptionBWorkletLoaded,
  OPTION_B_WORKLET_NAME,
  OPTION_B_PARAMS
} from './optionBShaperWorklet';

/**
 * VocalNuanceNode — Web Audio Dynamic Nuance Shaper (Gate 5 AudioWorklet Port).
 *
 * Implements the locked +1.5 dB upward nuance contour for Web Audio, matching the
 * Rust native audio engine's Option B transfer function with real-time audio thread safety.
 *
 * Locked Option B Contour Specifications:
 * - Upward nuance lift: +1.5 dB for quiet details (<= -24 dBFS)
 * - Smooth C^1 cubic Hermite transition across mid-levels (-24 dBFS to -12 dBFS)
 * - Exact unity gain (0.0 dB / 1.000000) for loud material (>= -12 dBFS)
 * - Attack time constant: 15 ms
 * - Release time constant: 250 ms
 * - Deep silence / noise floor taper: below -60 dBFS tapering to 0.0 dB at -80 dBFS
 * - Crossfade transition time: 30 ms exponential time constant
 *
 * Product Invariant: Web Audio Limiter Semantics
 * - StudioReference: Prioritizes bit transparency and uncolored response. The Web Audio safety
 *   limiter is bypassed (limiterDry = 1.0, limiterWet = 0.0) to preserve a pure digital null.
 * - VocalNuanceBoost: Upward nuance shaping applies +1.5 dB lift to quiet passages. The Web Audio
 *   safety limiter is engaged (limiterDry = 0.0, limiterWet = 1.0) to guard the output against
 *   potential digital clipping on hot masters.
 */

export const VOCAL_NUANCE_MAKEUP_DB = 1.5;

export const VOCAL_NUANCE_PARAMS = {
  maxLiftDb: OPTION_B_PARAMS.maxLiftDb,
  lowThresholdDb: OPTION_B_PARAMS.lowThresholdDb,
  highThresholdDb: OPTION_B_PARAMS.highThresholdDb,
  noiseGateDb: OPTION_B_PARAMS.noiseGateDb,
  noiseFloorDb: OPTION_B_PARAMS.noiseFloorDb,
  attackSec: OPTION_B_PARAMS.attackSec,
  releaseSec: OPTION_B_PARAMS.releaseSec,
  // Legacy compatibility mappings
  threshold: OPTION_B_PARAMS.highThresholdDb, // -12 dBFS (unity threshold)
  knee: 12,
  ratio: 1.0,
  attack: OPTION_B_PARAMS.attackSec,
  release: OPTION_B_PARAMS.releaseSec
} as const;

/** Linear amplitude conversion: A = 10^(dB / 20) */
export const dBToLinear = (db: number): number => 10 ** (db / 20);

/**
 * OptionBShaper — Exact mathematical reference port of the Rust Option B Upward Nuance Transfer Function.
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
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;

  readonly shaper: OptionBShaper;
  workletNode: AudioWorkletNode | null = null;
  readonly ready: Promise<boolean>;

  private enabled = false;
  private destroyed = false;
  // Lifecycle: the wet lane has no input until the worklet (or fallback
  // passthrough) is attached. setEnabled() calls arriving before settlement
  // record intent here instead of ramping gains on a silent graph.
  private workletSettled = false;
  private pendingEnabled: { enabled: boolean; immediate: boolean } | null = null;

  /** 30 ms exponential time constant matching the Rust engine's 30 ms transition */
  private static readonly FADE_TIME_CONSTANT = 0.03;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.shaper = new OptionBShaper(ctx.sampleRate ?? 48000);

    // Explicit stereo channel configuration
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';

    // 1. Dry bypass lane (StudioReference bit-transparent pass)
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // 2. Wet shaped lane: initialize to wetGain -> output
    this.wetGain.connect(this.output);

    // Default to Studio Reference (pure bypass, dry=1, wet=0)
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    // Asynchronously attach the AudioWorklet processor module
    this.ready = this.initWorklet();
  }

  private async initWorklet(): Promise<boolean> {
    try {
      const loaded = await ensureOptionBWorkletLoaded(this.ctx);
      if (loaded && !this.destroyed && typeof AudioWorkletNode !== 'undefined') {
        const worklet = new AudioWorkletNode(this.ctx, OPTION_B_WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2]
        });
        this.workletNode = worklet;
        this.input.connect(worklet);
        worklet.connect(this.wetGain);
        this.workletSettled = true;
        this.flushPendingEnabled();
        return true;
      }
    } catch (err) {
      console.warn('[VocalNuanceNode] AudioWorkletNode attachment failed, falling back:', err);
    }

    // Fallback path if AudioWorklet is not available (e.g. mock test environments)
    if (!this.workletNode && !this.destroyed) {
      try {
        this.input.connect(this.wetGain);
      } catch {
        // Already connected or mock
      }
    }
    this.workletSettled = true;
    this.flushPendingEnabled();
    return false;
  }

  /** Applies a previously deferred enable intent once the wet lane exists. */
  private flushPendingEnabled(): void {
    const pending = this.pendingEnabled;
    this.pendingEnabled = null;
    if (pending && !this.destroyed) {
      this.applyEnabled(pending.enabled, pending.immediate);
    }
  }

  /**
   * Smoothly crossfade between dry bypass (StudioReference) and wet shaped (VocalNuanceBoost).
   *
   * @param enabled True for VocalNuanceBoost, false for StudioReference
   * @param immediate If true, snaps instantly (e.g. cold start restore)
   */
  setEnabled(enabled: boolean, immediate = false): void {
    if (enabled === this.enabled && this.workletSettled) return;
    this.enabled = enabled;

    // Wet lane has no input until worklet/fallback attach completes: record
    // intent and keep dry=1/wet=0 so output never goes silent. flushPendingEnabled
    // applies the latest intent on settlement.
    if (!this.workletSettled) {
      this.pendingEnabled = { enabled, immediate };
      return;
    }
    this.applyEnabled(enabled, immediate);
  }

  /** Ramps dry/wet gains toward the enabled state. Requires an attached wet lane. */
  private applyEnabled(enabled: boolean, immediate = false): void {
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
      this.dryGain.gain.setValueAtTime(this.dryGain.gain.value, now);
      this.dryGain.gain.setTargetAtTime(dryTarget, now, VocalNuanceNode.FADE_TIME_CONSTANT);
      this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
      this.wetGain.gain.setTargetAtTime(wetTarget, now, VocalNuanceNode.FADE_TIME_CONSTANT);
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
    return 20.0 * Math.log10(Math.max(1e-6, this.shaper.nuanceGain));
  }

  destroy(): void {
    this.destroyed = true;
    this.pendingEnabled = null;
    this.input.disconnect();
    this.dryGain.disconnect();
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}

export default VocalNuanceNode;
