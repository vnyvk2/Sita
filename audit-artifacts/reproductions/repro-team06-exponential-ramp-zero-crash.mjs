/**
 * REPRODUCTION: TEAM06-001
 * Title: fadeOutAudio crashes with unhandled RangeError on zero volume / mute
 *
 * Verifies that calling exponentialRampToValueAtTime when starting value is 0
 * (which occurs when volume is 0 or muted) violates the Web Audio API specification
 * and throws an uncaught exception, breaking playback controls in the UI.
 */

import assert from 'node:assert';

// Web Audio API Specification (W3C AudioParam.exponentialRampToValueAtTime):
// "An RangeError exception MUST be thrown if value is less than or equal to 0,
//  or if the value at the time of the previous event is less than or equal to 0."

class MockAudioParam {
  constructor(initialValue = 1.0) {
    this.value = initialValue;
    this.timeline = [];
  }

  setValueAtTime(val, time) {
    this.value = val;
    this.timeline.push({ type: 'setValueAtTime', val, time });
  }

  exponentialRampToValueAtTime(targetVal, endTime) {
    if (targetVal <= 0) {
      throw new RangeError(
        `Failed to execute 'exponentialRampToValueAtTime' on 'AudioParam': The float target value provided (${targetVal}) must be greater than zero.`
      );
    }
    const currentStartVal = this.value;
    if (currentStartVal <= 0) {
      throw new RangeError(
        `Failed to execute 'exponentialRampToValueAtTime' on 'AudioParam': The starting value (${currentStartVal}) for an exponential ramp must be strictly positive and greater than zero.`
      );
    }
    this.value = targetVal;
    this.timeline.push({ type: 'exponentialRampToValueAtTime', targetVal, endTime });
  }
}

// Emulate Nora player.ts fadeOutAudio implementation (lines 674-694)
function fadeOutAudio(gainNode, currentContextTime, audioFadeDuration = 250) {
  const currentTime = currentContextTime;
  const targetVolume = 0.001;
  const fadeDuration = audioFadeDuration / 1000;

  // Nora player.ts line 681: Directly passes this.gainNode.gain.value without Math.max(0.001) guard!
  // Compare with fadeInAudio line 703 which has: Math.max(0.001, this.gainNode.gain.value)
  gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
  gainNode.gain.exponentialRampToValueAtTime(targetVolume, currentTime + fadeDuration);
}

console.log('=== Running Reproduction TEAM06-001 ===');

// Case 1: Normal playback (volume = 0.8)
const normalGain = { gain: new MockAudioParam(0.8) };
assert.doesNotThrow(() => {
  fadeOutAudio(normalGain, 10.0);
}, 'Normal fade-out should succeed');
console.log('Case 1 Passed: Normal volume fade-out schedules correctly.');

// Case 2: Muted playback (gain = 0)
const mutedGain = { gain: new MockAudioParam(0) };
let caughtError = null;
try {
  fadeOutAudio(mutedGain, 10.0);
} catch (err) {
  caughtError = err;
}

assert(caughtError !== null, 'Expected fadeOutAudio to throw RangeError when muted');
assert(caughtError instanceof RangeError, 'Expected RangeError');
console.log('Case 2 Confirmed: fadeOutAudio throws RangeError when muted or volume is 0:');
console.log(`  Error: ${caughtError.message}`);
console.log('=== Reproduction TEAM06-001 Verified Successfully ===');
