/**
 * NightModeNode — Smart Dynamic Volume Compressor ("Night Listening Mode").
 *
 * Levels out high dynamic-range material by compressing loud peaks and adding
 * musical make-up gain so quiet details stay audible at low listening volumes.
 *
 * Topology (parallel lanes, click-free crossfaded):
 *
 *   input ─┬─ dryGain ─────────────────────────────┐
 *         └─ compressor → makeupGain → wetGain ───┤→ output
 *
 * - Disabled: dry = 1, wet = 0 (pure bypass, zero coloration).
 * - Enabled:  dry = 0, wet = 1 (compressed + make-up gain).
 * - Lanes carry correlated audio and the complementary exponential ramps sum
 *   to exactly 1 → constant amplitude during the crossfade (no bump, no click).
 *
 * Placed between KaraokeNode and the Safety Limiter, so the brickwall limiter
 * still guards the final output *after* make-up gain is applied.
 */

export type NightModePreset = 'gentle' | 'standard' | 'strong';

export interface NightModePresetParams {
  /** dB above which compression engages. */
  threshold: number;
  /** dB of soft transition around the threshold. */
  knee: number;
  /** input:output ratio above threshold. */
  ratio: number;
  /** seconds — transient reaction time. */
  attack: number;
  /** seconds — recovery time (kept ≥ 250 ms to avoid pumping/breathing). */
  release: number;
  /** dB of make-up gain applied to the compressed lane only. */
  makeupGainDb: number;
}

export const NIGHT_MODE_PRESETS: Record<NightModePreset, NightModePresetParams> = {
  gentle: { threshold: -16, knee: 16, ratio: 3, attack: 0.025, release: 0.35, makeupGainDb: 3 },
  standard: { threshold: -20, knee: 12, ratio: 4, attack: 0.02, release: 0.3, makeupGainDb: 5 },
  strong: { threshold: -24, knee: 6, ratio: 8, attack: 0.01, release: 0.25, makeupGainDb: 7 }
};

/** Web Audio GainNode operates on linear amplitude: A = 10^(dB / 20). */
export const dBToLinearGain = (db: number): number => 10 ** (db / 20);

export class NightModeNode {
  readonly input: GainNode;
  readonly output: GainNode;

  /** Exposed read-only for live metering & tests (GR meter reads `.reduction`). */
  readonly compressor: DynamicsCompressorNode;
  readonly makeupGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;

  private enabled = false;
  private preset: NightModePreset = 'standard';

  /** ~25 ms exponential time constant ≈ 75 ms perceptual crossfade. */
  private static readonly FADE_TIME_CONSTANT = 0.025;
  /** ~30 ms morph for compressor-parameter changes. */
  private static readonly PARAM_TIME_CONSTANT = 0.03;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.makeupGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // Explicit stereo configuration
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';

    // Dry bypass lane
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet compressed lane (make-up gain lives *inside* the wet lane, so the
    // disabled bypass path is untouched by it)
    this.input.connect(this.compressor);
    this.compressor.connect(this.makeupGain);
    this.makeupGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Start fully bypassed
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    this.applyPresetParams('standard', true);
  }

  /**
   * Enable/disable with a click-free crossfade between dry and wet lanes.
   * `immediate = true` snaps (used for cold-start restore — no signal flowing,
   * no crossfade needed).
   *
   * Idempotent: re-applying the current state is a no-op. The store sync in
   * `player.ts` relies on this to make UI ⇄ DSP feedback loops impossible.
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
      this.dryGain.gain.setTargetAtTime(dryTarget, now, NightModeNode.FADE_TIME_CONSTANT);
      this.wetGain.gain.setTargetAtTime(wetTarget, now, NightModeNode.FADE_TIME_CONSTANT);
    }
  }

  /** Swap preset profile. Safe mid-playback — parameters are ramped, not snapped. */
  setPreset(preset: NightModePreset, immediate = false): void {
    if (preset === this.preset) return;
    this.preset = preset;
    this.applyPresetParams(preset, immediate);
  }

  /**
   * Current gain reduction in dB. `DynamicsCompressorNode.reduction` reports 0
   * when idle and *negative* dB under compression (e.g. −6.4). UI meters should
   * render `Math.abs(getReduction())`.
   */
  getReduction(): number {
    return this.compressor?.reduction ?? 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPreset(): NightModePreset {
    return this.preset;
  }

  /** Disconnect all internal nodes (call when tearing down the audio graph). */
  destroy(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.compressor.disconnect();
    this.makeupGain.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }

  private applyPresetParams(preset: NightModePreset, immediate: boolean): void {
    const p = NIGHT_MODE_PRESETS[preset];
    const now = this.ctx.currentTime;

    const scheduled: readonly [AudioParam | undefined, number][] = [
      [this.compressor?.threshold, p.threshold],
      [this.compressor?.knee, p.knee],
      [this.compressor?.ratio, p.ratio],
      [this.compressor?.attack, p.attack],
      [this.compressor?.release, p.release],
      [this.makeupGain?.gain, dBToLinearGain(p.makeupGainDb)]
    ];

    for (const [param, value] of scheduled) {
      if (!param) continue;
      if (typeof param.cancelScheduledValues === 'function') {
        param.cancelScheduledValues(now);
      }
      if (immediate || typeof param.setTargetAtTime !== 'function') {
        param.value = value;
      } else {
        param.setTargetAtTime(value, now, NightModeNode.PARAM_TIME_CONSTANT);
      }
    }
  }
}

export default NightModeNode;
