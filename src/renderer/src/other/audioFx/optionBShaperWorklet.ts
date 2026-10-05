/**
 * OptionBShaperWorklet — Web Audio AudioWorklet implementation of the canonical
 * Option B Upward Nuance Shaper.
 *
 * Implements the exact sample-accurate equations matching `sound_profile.rs`:
 * - Upward nuance lift: +1.5 dB for quiet details (<= -24 dBFS)
 * - Smooth C^1 cubic Hermite transition across mid-levels (-24 dBFS to -12 dBFS)
 * - Exact unity gain (0.0 dB / 1.000000) for loud material (>= -12 dBFS)
 * - Peak attack time constant: 15 ms
 * - Musical release time constant: 250 ms
 * - Deep silence / noise floor taper: below -60 dBFS to 0.0 dB at -80 dBFS
 *
 * Operates on the dedicated Web Audio rendering thread without main thread latency.
 */

export const OPTION_B_WORKLET_NAME = 'option-b-shaper-processor';

export const OPTION_B_PARAMS = {
  maxLiftDb: 1.5,
  lowThresholdDb: -24.0,
  highThresholdDb: -12.0,
  noiseGateDb: -60.0,
  noiseFloorDb: -80.0,
  attackSec: 0.015,
  releaseSec: 0.25
} as const;

export const OPTION_B_SHAPER_PROCESSOR_CODE = `
class OptionBShaperProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 48000;
    this.sampleRate = Math.max(8000, sr);
    this.attackCoeff = Math.exp(-1.0 / (0.015 * this.sampleRate));
    this.releaseCoeff = Math.exp(-1.0 / (0.250 * this.sampleRate));
    this.nuanceEnvelope = 0.0;
    this.nuanceGain = 1.0;
    this.maxLiftDb = 1.5;
    this.lowThresholdDb = -24.0;
    this.highThresholdDb = -12.0;
    this.noiseGateDb = -60.0;
    this.noiseFloorDb = -80.0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const inL = input[0];
    const inR = input.length > 1 ? input[1] : inL;
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : outL;
    const frameCount = inL.length;

    for (let i = 0; i < frameCount; i++) {
      const sL = inL[i];
      const sR = inR[i];
      const peak = Math.max(Math.abs(sL), Math.abs(sR));

      // 1. Envelope tracking (15ms attack, 250ms release)
      if (peak > this.nuanceEnvelope) {
        this.nuanceEnvelope = this.attackCoeff * this.nuanceEnvelope + (1.0 - this.attackCoeff) * peak;
      } else {
        this.nuanceEnvelope = this.releaseCoeff * this.nuanceEnvelope + (1.0 - this.releaseCoeff) * peak;
      }

      // 2. Transfer function: Cubic Hermite spline
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

      // 3. Gain smoothing (15ms attack when gain drops, 250ms release when gain lifts)
      if (targetG < this.nuanceGain) {
        this.nuanceGain = this.attackCoeff * this.nuanceGain + (1.0 - this.attackCoeff) * targetG;
      } else {
        this.nuanceGain = this.releaseCoeff * this.nuanceGain + (1.0 - this.releaseCoeff) * targetG;
      }

      // 4. In-place modulation
      outL[i] = sL * this.nuanceGain;
      if (output.length > 1) {
        outR[i] = sR * this.nuanceGain;
      }
      if (outputs.length > 1 && outputs[1] && outputs[1][0]) {
        outputs[1][0][i] = this.nuanceGain;
      }
    }

    return true;
  }
}

registerProcessor('${OPTION_B_WORKLET_NAME}', OptionBShaperProcessor);
`;

const contextLoadPromises = new WeakMap<BaseAudioContext, Promise<boolean>>();

/**
 * Ensures the OptionBShaperProcessor AudioWorklet module is registered in the given AudioContext.
 * Deduplicates in-flight registration via a per-context WeakMap Promise to eliminate concurrent race conditions.
 * Uses an inlined blob URL for zero-dependency packaging in Electron and Vite.
 */
export function ensureOptionBWorkletLoaded(ctx: BaseAudioContext): Promise<boolean> {
  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') {
    return Promise.resolve(false);
  }
  const existingPromise = contextLoadPromises.get(ctx);
  if (existingPromise) {
    return existingPromise;
  }

  const loadPromise = (async () => {
    try {
      const blob = new Blob([OPTION_B_SHAPER_PROCESSOR_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(url);
        return true;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn('[optionBShaperWorklet] Failed to load AudioWorklet module:', err);
      return false;
    }
  })();

  contextLoadPromises.set(ctx, loadPromise);
  return loadPromise;
}
