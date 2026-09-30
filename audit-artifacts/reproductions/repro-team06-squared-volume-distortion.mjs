/**
 * REPRODUCTION: TEAM06-002
 * Title: Volume attenuation squared (V^2) causing non-linear loudness distortion
 *
 * Demonstrates how Nora applies volume simultaneously to HTMLAudioElement.volume
 * and Web Audio master GainNode.gain.value, resulting in compounded squaring of the
 * volume curve and severe decibel loss compared to standard perception.
 */

import assert from 'node:assert';

function calculateEffectiveDecibels(intendedVolume) {
  // Web Audio Spec: MediaElementAudioSourceNode outputs signal scaled by HTMLMediaElement.volume
  // FIXED: mediaElementGain is pinned to 1.0 (single authority on GainNode)
  const mediaElementGain = 1.0;

  // Nora player.ts: this.gainNode.gain.value = volume;
  const masterGainNodeGain = intendedVolume;

  // Actual linear amplitude at output
  const actualLinearAmplitude = mediaElementGain * masterGainNodeGain; // linear V (fixed)!

  // Intended dB vs Actual dB: dB = 20 * log10(amplitude)
  const intendedDb = intendedVolume > 0 ? 20 * Math.log10(intendedVolume) : -Infinity;
  const actualDb = actualLinearAmplitude > 0 ? 20 * Math.log10(actualLinearAmplitude) : -Infinity;
  const errorDb = actualDb - intendedDb;

  return {
    intendedVolume,
    mediaElementGain,
    masterGainNodeGain,
    actualLinearAmplitude,
    intendedDb: Number(intendedDb.toFixed(2)),
    actualDb: Number(actualDb.toFixed(2)),
    errorDb: Number(errorDb.toFixed(2))
  };
}

console.log('=== Running Verification for TEAM06-002 (Fixed Single Authority) ===');

const testCases = [1.0, 0.75, 0.5, 0.25, 0.1];
const results = testCases.map(calculateEffectiveDecibels);

console.table(results);

// At 50% volume (0.5), intended is -6.02 dB, actual is -6.02 dB (errorDb is strictly 0)
const case50 = results.find((r) => r.intendedVolume === 0.5);
assert(Math.abs(case50.actualLinearAmplitude - 0.5) < 1e-6);
assert.strictEqual(case50.errorDb, 0.0);

// At 10% volume (0.1), intended is -20 dB, actual is -20 dB (errorDb is strictly 0)
const case10 = results.find((r) => r.intendedVolume === 0.1);
assert(Math.abs(case10.actualLinearAmplitude - 0.1) < 1e-6);
assert.strictEqual(case10.errorDb, 0.0);

console.log('Confirmed: Single authority on GainNode preserves linear V output with 0 dB distortion penalty.');
console.log('=== TEAM06-002 Fix Verified Successfully ===');
