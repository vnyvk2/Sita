/**
 * Adversarial Reproduction Script: Team 11 (Git Archaeology & Regression Cycles)
 * 
 * Demonstrates:
 * 1. Proof of the dropped default parameter in VirtualizedList.tsx (re-introducing daea6f2c regression).
 * 2. Crossfade one-way cancellation trap: premature activeSlot swap wipes original track on mid-fade abort.
 * 3. Responsive breakpoint column count mismatch between CompactListHeader and CompactSongRow.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== TEST 1: Re-introduced Scroll Seek Default Parameter Regression ===');

// Check current VirtualizedList.tsx props vs commit daea6f2c
const currentListContent = fs.readFileSync('src/renderer/src/components/VirtualizedList.tsx', 'utf8');

// In commit daea6f2c: scrollSeekConfiguration = DEFAULT_SCROLL_SEEK_CONFIG
// In commit b5a05ca0 and HEAD: scrollSeekConfiguration, (default removed!)
const hasDefaultSeekConfigInDestructure = currentListContent.includes('scrollSeekConfiguration = DEFAULT_SCROLL_SEEK_CONFIG');
console.log('Does VirtualizedList destructuring provide DEFAULT_SCROLL_SEEK_CONFIG?', hasDefaultSeekConfigInDestructure);
assert.strictEqual(hasDefaultSeekConfigInDestructure, false, 'DEFECT CONFIRMED: Default seek configuration was dropped in b5a05ca0!');

// Check if SongsPage passes scrollSeekConfiguration
const songsPageContent = fs.readFileSync('src/renderer/src/routes/main-player/songs/index.tsx', 'utf8');
const songsPagePassesSeek = songsPageContent.includes('scrollSeekConfiguration=');
console.log('Does SongsPage pass scrollSeekConfiguration to VirtualizedList?', songsPagePassesSeek);
assert.strictEqual(songsPagePassesSeek, false, 'DEFECT CONFIRMED: SongsPage relies on dropped default, disabling seek placeholders!');


console.log('\n=== TEST 2: Crossfade One-Way Cancellation Trap Simulation ===');

class PlayerSimulation {
  constructor() {
    this.activeSlot = 'A';
    this.audioA = { id: 100, title: 'Track A', src: 'songA.mp3', currentTime: 180, isPlaying: true };
    this.audioB = { id: 101, title: 'Track B', src: 'songB.mp3', currentTime: 0, isPlaying: false };
    this.gainA = 1.0;
    this.gainB = 0.0;
  }

  get activeAudio() {
    return this.activeSlot === 'A' ? this.audioA : this.audioB;
  }

  get standbyAudio() {
    return this.activeSlot === 'A' ? this.audioB : this.audioA;
  }

  // startFade from src/renderer/src/other/player.ts:1210-1250
  startFade() {
    this.audioB.isPlaying = true;
    // PREMATURE SWAP AT START OF FADE (line 1249):
    this.activeSlot = this.activeSlot === 'A' ? 'B' : 'A';
    // Mid-fade gains at t = 2s into 5s fade
    this.gainA = 0.6;
    this.gainB = 0.4;
  }

  // onFadeCancel from src/renderer/src/other/player.ts:1299-1331
  onFadeCancel() {
    // line 1323: this.activeFadeGain.gain.setValueAtTime(1.0, now)
    // line 1324: this.standbyFadeGain.gain.setValueAtTime(0.0, now)
    if (this.activeSlot === 'A') {
      this.gainA = 1.0;
      this.gainB = 0.0;
    } else {
      this.gainB = 1.0;
      this.gainA = 0.0;
    }

    // line 1326-1328: standbyAudio is paused, reset to 0, and src wiped!
    this.standbyAudio.isPlaying = false;
    this.standbyAudio.currentTime = 0;
    this.standbyAudio.src = '';
  }
}

const sim = new PlayerSimulation();
console.log('Initial State: Active track is', sim.activeAudio.title, 'with Gain:', sim.gainA);

// Start crossfade to Track B
sim.startFade();
console.log('During Fade: Active slot swapped to', sim.activeAudio.title, '| Gain A:', sim.gainA, '| Gain B:', sim.gainB);

// User cancels crossfade mid-fade (e.g. hits pause or seeks back in Track A)
sim.onFadeCancel();
console.log('After Cancel: Active track is', sim.activeAudio.title, 'with Gain:', sim.gainB);
console.log('State of Track A after cancel: isPlaying =', sim.audioA.isPlaying, ', src =', JSON.stringify(sim.audioA.src));

// Verify Track A was destroyed and Track B jumped to 1.0
assert.strictEqual(sim.activeAudio.title, 'Track B', 'DEFECT: Cancel forced transition to Track B!');
assert.strictEqual(sim.gainB, 1.0, 'DEFECT: Track B volume stepped violently to 1.0!');
assert.strictEqual(sim.audioA.src, '', 'DEFECT: Original Track A was completely wiped!');


console.log('\n=== TEST 3: Responsive Column Mismatch Between Header and Row ===');
const headerContent = fs.readFileSync('src/renderer/src/components/SongsPage/CompactListHeader.tsx', 'utf8');
const rowContent = fs.readFileSync('src/renderer/src/components/SongsPage/CompactSongRow.tsx', 'utf8');

const headerHasResponsiveAlbum = headerContent.includes('sm:hidden') || headerContent.includes('md:hidden');
const rowHasResponsiveAlbum = rowContent.includes('sm:hidden md:hidden lg:flex');

console.log('Does CompactSongRow have responsive breakpoint on Album?', rowHasResponsiveAlbum);
console.log('Does CompactListHeader have responsive breakpoint on Album?', headerHasResponsiveAlbum);

assert.strictEqual(rowHasResponsiveAlbum, true);
assert.strictEqual(headerHasResponsiveAlbum, false, 'DEFECT CONFIRMED: Header misses responsive class, desyncing columns on md/sm viewports!');

console.log('\nALL GIT ARCHAEOLOGY & REGRESSION DEFECTS PROVEN!');
