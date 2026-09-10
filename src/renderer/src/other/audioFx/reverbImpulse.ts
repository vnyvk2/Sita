/**
 * Pure mathematical impulse response generation for algorithmic room reverb.
 * Free from Web Audio API DOM dependencies so it can be unit-tested headlessly.
 */

export interface ImpulseBufferData {
  sampleRate: number;
  length: number;
  leftChannel: Float32Array;
  rightChannel: Float32Array;
}

/**
 * Generates stereo impulse response data using white noise shaped by an exponential decay envelope.
 *
 * @param sampleRate The audio context sample rate (e.g. 44100 or 48000)
 * @param durationSeconds Length of the reverb tail in seconds (clamped to 0.1s - 8.0s)
 * @param decay Exponential decay exponent (higher = faster fade, clamped to 0.5 - 10.0)
 * @returns Object containing left and right Float32Array channel buffers
 */
export function generateReverbImpulse(
  sampleRate: number,
  durationSeconds: number,
  decay: number
): ImpulseBufferData {
  const safeSampleRate = Math.max(8000, Math.min(192000, sampleRate || 44100));
  const safeDuration = Math.max(0.1, Math.min(8.0, durationSeconds));
  const safeDecay = Math.max(0.5, Math.min(10.0, decay));

  const length = Math.floor(safeSampleRate * safeDuration);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  let leftSum = 0;
  let rightSum = 0;

  for (let i = 0; i < length; i++) {
    // Relative time from 0 to 1
    const t = i / length;
    // Exponential decay envelope
    const envelope = Math.pow(1 - t, safeDecay);

    // Stereo white noise (-1.0 to 1.0)
    const noiseL = Math.random() * 2 - 1;
    const noiseR = Math.random() * 2 - 1;

    left[i] = noiseL * envelope;
    right[i] = noiseR * envelope;

    leftSum += left[i];
    rightSum += right[i];
  }

  // Remove DC offset
  const meanL = leftSum / length;
  const meanR = rightSum / length;

  let maxPeak = 0;
  for (let i = 0; i < length; i++) {
    left[i] -= meanL;
    right[i] -= meanR;

    const absL = Math.abs(left[i]);
    const absR = Math.abs(right[i]);
    if (absL > maxPeak) maxPeak = absL;
    if (absR > maxPeak) maxPeak = absR;
  }

  // Normalize to 0.8 to prevent initial clipping
  if (maxPeak > 0) {
    const scale = 0.8 / maxPeak;
    for (let i = 0; i < length; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
  }

  return {
    sampleRate: safeSampleRate,
    length,
    leftChannel: left,
    rightChannel: right
  };
}

/** Scoped WeakMap cache to prevent memory bloat and cross-AudioContext buffer assignment */
const contextImpulseCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

/** Maximum cached buffers per AudioContext to cap memory footprint to ~4.6 MB */
const MAX_BUFFERS_PER_CONTEXT = 2;

/**
 * Creates or retrieves a cached Web Audio AudioBuffer for the given reverb parameters.
 * Buffers are strictly scoped to their creating AudioContext via WeakMap.
 */
export function getOrCreateReverbBuffer(
  audioContext: AudioContext,
  durationSeconds: number,
  decay: number
): AudioBuffer {
  // Quantize parameters to reduce cache churn during rapid slider movements
  const roundedDuration = Math.round(durationSeconds * 10) / 10;
  const roundedDecay = Math.round(decay * 10) / 10;
  const cacheKey = `${audioContext.sampleRate}_${roundedDuration}_${roundedDecay}`;

  let bufferMap = contextImpulseCache.get(audioContext);
  if (!bufferMap) {
    bufferMap = new Map<string, AudioBuffer>();
    contextImpulseCache.set(audioContext, bufferMap);
  }

  const cached = bufferMap.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rawData = generateReverbImpulse(audioContext.sampleRate, roundedDuration, roundedDecay);
  const audioBuffer = audioContext.createBuffer(2, rawData.length, rawData.sampleRate);
  audioBuffer.getChannelData(0).set(rawData.leftChannel);
  audioBuffer.getChannelData(1).set(rawData.rightChannel);

  // Evict oldest entry if exceeding limit
  if (bufferMap.size >= MAX_BUFFERS_PER_CONTEXT) {
    const firstKey = bufferMap.keys().next().value;
    if (firstKey) bufferMap.delete(firstKey);
  }

  bufferMap.set(cacheKey, audioBuffer);
  return audioBuffer;
}

/**
 * Utility function to inspect cache size for a given AudioContext (used in tests).
 */
export function getReverbCacheSizeForContext(audioContext: AudioContext): number {
  return contextImpulseCache.get(audioContext)?.size ?? 0;
}
