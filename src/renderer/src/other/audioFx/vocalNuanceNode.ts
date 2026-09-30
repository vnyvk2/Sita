import type { SoundProfile } from '@common/audioEngineProtocol';

/**
 * VocalNuanceNode — Web Audio Dynamic Nuance Shaper.
 *
 * Implements the locked +1.5 dB upward nuance contour for Web Audio fallback parity, matching the
 * Rust native audio engine's Option B transfer function.
 *
 * Locked Contour Specifications:
 *
 * - Upward nuance lift: +1.5 dB
 * - Soft-knee transition: -24 dBFS to -12 dBFS (knee = 12 dB, threshold = -12 dB)
 * - Compression ratio: 1.25 : 1
 * - Attack time constant: 15 ms
 * - Release time constant: 250 ms
 * - Crossfade transition time: 30 ms exponential time constant
 *
 * Parallel Wet/Dry Topology:
 *
 * Input ─┬─ dryGain ─────────────────────────────┐ └─ compressor → makeupGain → wetGain ───┤→
 * output
 *
 * - StudioReference: dry = 1, wet = 0 (bit-transparent digital null, zero coloration).
 * - VocalNuanceBoost: dry = 0, wet = 1 (upward nuance contour +1.5 dB).
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

export class VocalNuanceNode {
  readonly input: GainNode;
  readonly output: GainNode;

  readonly compressor: DynamicsCompressorNode;
  readonly makeupGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;

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

    // Explicit stereo channel configuration
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';

    // 1. Dry bypass lane
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // 2. Wet shaped lane: input -> compressor -> makeupGain -> wetGain -> output
    this.input.connect(this.compressor);
    this.compressor.connect(this.makeupGain);
    this.makeupGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Configure compressor with locked production parameters
    this.compressor.threshold.value = VOCAL_NUANCE_PARAMS.threshold;
    this.compressor.knee.value = VOCAL_NUANCE_PARAMS.knee;
    this.compressor.ratio.value = VOCAL_NUANCE_PARAMS.ratio;
    this.compressor.attack.value = VOCAL_NUANCE_PARAMS.attack;
    this.compressor.release.value = VOCAL_NUANCE_PARAMS.release;

    // Calibrated +1.5 dB makeup gain
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
      this.dryGain.gain.setTargetAtTime(dryTarget, now, VocalNuanceNode.FADE_TIME_CONSTANT);
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
   * Returns current compressor gain reduction in dB. Reports 0 when idle and negative dB under
   * compression.
   */
  getReduction(): number {
    return this.compressor?.reduction ?? 0;
  }

  destroy(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.compressor.disconnect();
    this.makeupGain.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}

export default VocalNuanceNode;
