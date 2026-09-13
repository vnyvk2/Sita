/**
 * Real-time DSP Center-Channel Vocal Reducer (Karaoke Node)
 *
 * Implements a parallel complementary Linkwitz-Riley 4th-order (LR4) topology:
 *   L_out = (L - M) + LP(M) + HP(M)
 *   R_out = (R - M) + LP(M) + HP(M)
 *
 * Where M = 0.5 * (L + R).
 * For centered vocal material, L - M = 0, so attenuation depends strictly on
 * the stopband rejection of the cascaded LR4 legs, phase-independently.
 * Bass (< lowCutoff) and air/cymbals (> highCutoff) are preserved.
 */

export class KaraokeNode {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private isEnabled: boolean = false;

  constructor(
    private readonly ctx: AudioContext,
    lowCutoff = 220,
    highCutoff = 6000
  ) {
    const c = ctx;
    this.input = c.createGain();
    this.output = c.createGain();
    this.dry = c.createGain();
    this.wet = c.createGain();

    this.dry.gain.value = 1;
    this.wet.gain.value = 0;

    // Bypass path (always wired)
    this.input.connect(this.dry);
    this.dry.connect(this.output);

    // Deterministic stereo at entry: mono up-mixes to L=R, >2ch down-mixes
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'speakers';

    // Guard for test environments that use partial AudioContext mocks
    if (
      typeof c.createChannelSplitter !== 'function' ||
      typeof c.createChannelMerger !== 'function'
    ) {
      return;
    }

    const splitter = c.createChannelSplitter(2);

    const mid = c.createGain(); // M = 0.5 * (L + R)
    mid.gain.value = 0.5;
    const midInv = c.createGain(); // -M, fans out to both buses
    midInv.gain.value = -1;

    const bq = (type: BiquadFilterType, freq: number) => {
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = 0.707;
      return f;
    };

    // Cascaded Linkwitz-Riley 4th-order (LR4) legs: two 2nd-order Butterworth filters
    const lpA = bq('lowpass', lowCutoff);
    const lpB = bq('lowpass', lowCutoff);
    const hpA = bq('highpass', highCutoff);
    const hpB = bq('highpass', highCutoff);

    const leftBus = c.createGain();
    const rightBus = c.createGain();
    const merger = c.createChannelMerger(2);

    this.input.connect(splitter);
    splitter.connect(mid, 0);
    splitter.connect(mid, 1);
    mid.connect(midInv);

    mid.connect(lpA);
    lpA.connect(lpB);
    mid.connect(hpA);
    hpA.connect(hpB);

    lpB.connect(leftBus);
    lpB.connect(rightBus);
    hpB.connect(leftBus);
    hpB.connect(rightBus);

    // L_out = (L - M) + LP(M) + HP(M)
    // R_out = (R - M) + LP(M) + HP(M)
    splitter.connect(leftBus, 0);
    splitter.connect(rightBus, 1);
    midInv.connect(leftBus);
    midInv.connect(rightBus);

    leftBus.connect(merger, 0, 0);
    rightBus.connect(merger, 0, 1);
    merger.connect(this.wet);
    this.wet.connect(this.output);
  }

  private currentLevel = 100; // 0 to 100

  /**
   * Sets the vocal reduction level (0 to 100).
   * @param level Reduction percentage (0 = no reduction, 100 = full suppression)
   * @param immediate If true, sets gain values immediately without crossfade
   */
  setLevel(level: number, immediate = false): void {
    this.currentLevel = Math.max(0, Math.min(100, level));
    this.updateGains(immediate);
  }

  /**
   * Enables or disables karaoke mode.
   * @param on Whether karaoke mode is active
   * @param immediate If true, sets gain values immediately without crossfade (e.g. on graph build)
   * @param level Optional reduction level (0 to 100)
   */
  setEnabled(on: boolean, immediate = false, level?: number): void {
    this.isEnabled = on;
    if (level !== undefined) {
      this.currentLevel = Math.max(0, Math.min(100, level));
    }
    this.updateGains(immediate);
  }

  private updateGains(immediate: boolean): void {
    const wetTarget = this.isEnabled ? this.currentLevel / 100 : 0;
    const dryTarget = 1.0 - wetTarget;

    if (immediate) {
      this.dry.gain.value = dryTarget;
      this.wet.gain.value = wetTarget;
      return;
    }
    const t = this.ctx.currentTime;
    this.dry.gain.setTargetAtTime(dryTarget, t, 0.01); // ~30 ms fade
    this.wet.gain.setTargetAtTime(wetTarget, t, 0.01);
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  get level(): number {
    return this.currentLevel;
  }

  /** Disconnect all internal nodes (call when tearing down the audio graph). */
  destroy(): void {
    this.input.disconnect();
    this.dry.disconnect();
    this.wet.disconnect();
    this.output.disconnect();
  }
}

export default KaraokeNode;
