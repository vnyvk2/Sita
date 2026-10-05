/**
 * REPRODUCTION: TEAM06-003
 * Title: Crossfade cancellation slot swap destroys outgoing track and forces incoming track to 100%
 *
 * Demonstrates that Nora player.ts swaps activeSlot to the incoming track at the START
 * of startFade(), which causes any cancellation (seeking, pausing, skipping backward)
 * to destroy the original track (track A) and jump the uncompleted incoming track (track B)
 * to full volume.
 */

import assert from 'node:assert';

class MockAudioSlot {
  constructor(name) {
    this.name = name;
    this.src = '';
    this.currentTime = 0;
    this.paused = true;
    this.gain = 1.0;
  }
}

class CrossfadeModel {
  constructor() {
    this.slotA = new MockAudioSlot('Slot A (Track 1)');
    this.slotB = new MockAudioSlot('Slot B (Track 2)');
    this.activeSlot = 'A';
    this.isCrossfading = false;
  }

  get audio() {
    return this.activeSlot === 'A' ? this.slotA : this.slotB;
  }

  get standbyAudio() {
    return this.activeSlot === 'A' ? this.slotB : this.slotA;
  }

  loadInitialTrack(trackPath) {
    this.slotA.src = trackPath;
    this.slotA.paused = false;
    this.slotA.gain = 1.0;
    this.slotB.gain = 0.0;
  }

  // Corresponds to Nora player.ts lines 1163-1280
  startFade(incomingTrackPath) {
    // 1. Prepare standby
    this.standbyAudio.src = incomingTrackPath;
    this.standbyAudio.paused = false;

    // 2. Scheduled fade curves (omitted for brevity)
    this.isCrossfading = true;

    // 3. Nora player.ts line 1249: SWAP ACTIVE SLOT IMMEDIATELY AT START OF FADE!
    this.activeSlot = this.activeSlot === 'A' ? 'B' : 'A';
  }

  // Corresponds to Nora player.ts lines 1299-1331
  onFadeCancel() {
    // Nora player.ts lines 1323-1328:
    // this.activeFadeGain.gain.setValueAtTime(1.0, now);
    // this.standbyFadeGain.gain.setValueAtTime(0.0, now);
    // this.standbyAudio.pause();
    // this.standbyAudio.currentTime = 0;
    // this.standbyAudio.src = '';
    this.audio.gain = 1.0;
    this.standbyAudio.gain = 0.0;
    this.standbyAudio.paused = true;
    this.standbyAudio.currentTime = 0;
    this.standbyAudio.src = '';
    this.isCrossfading = false;
  }
}

console.log('=== Running Reproduction TEAM06-003 ===');

const model = new CrossfadeModel();
model.loadInitialTrack('nora://track/original-song-1.mp3');

console.log('Initial state:');
console.log(`  Active: ${model.activeSlot} (${model.audio.src}), gain=${model.audio.gain}`);
console.log(`  Standby: ${model.standbyAudio.name}, gain=${model.standbyAudio.gain}`);

// Crossfade begins towards Track 2
console.log('\n--- Crossfade Starts (startFade called) ---');
model.startFade('nora://track/next-song-2.mp3');
console.log(`  Current active slot after startFade: ${model.activeSlot} (${model.audio.src})`);

// User pauses or seeks 0.5s into a 10s crossfade, expecting to stay on Track 1!
console.log('\n--- User seeks or cancels crossfade 0.5s into transition ---');
model.onFadeCancel();

console.log(`  Post-cancel active slot: ${model.activeSlot} (${model.audio.src}), gain=${model.audio.gain}`);
console.log(`  Post-cancel standby slot: ${model.standbyAudio.name} (${model.standbyAudio.src}), gain=${model.standbyAudio.gain}`);

// Assertions proving defect:
// 1. Original song in Slot A has been nuked!
assert.strictEqual(model.slotA.src, '', 'Original Track 1 was unexpectedly erased from Slot A!');
assert.strictEqual(model.slotA.paused, true, 'Original Track 1 was stopped!');

// 2. Incoming Track 2 has hijacked the active playback at 100% gain!
assert.strictEqual(model.activeSlot, 'B', 'Active slot hijacked by incoming track B!');
assert.strictEqual(model.slotB.src, 'nora://track/next-song-2.mp3');
assert.strictEqual(model.slotB.gain, 1.0, 'Incoming Track 2 jumped to 100% gain despite cancellation!');

console.log('\nConfirmed: Premature slot swap causes crossfade cancellation to destroy Track 1 and jump Track 2 to 100% volume.');
console.log('=== Reproduction TEAM06-003 Verified Successfully ===');
