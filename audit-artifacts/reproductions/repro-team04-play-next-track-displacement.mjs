/**
 * REPRODUCTION: TEAM04-003
 * Title: playerQueue.playNext corrupts active track position when target includes currently playing song
 *
 * Demonstrates that when `playNext(ids)` is called with an array that includes the currently
 * playing song (e.g. user multi-selects an album or playlist that contains the current song and clicks "Play Next"),
 * the current song is stripped from its current index and spliced in at `newPosition + 1`,
 * while `this.position` remains at `newPosition`.
 *
 * As a consequence:
 * 1. `this.currentSongId` immediately switches to whatever track was adjacent to the current track.
 * 2. The queue state diverges from the Web Audio graph (which is still playing the original track).
 * 3. Subsequent 'next' / 'previous' / repeat actions operate on the displaced index, desyncing playback.
 */

import assert from 'node:assert';

class QueueModel {
  constructor(songIds, initialPosition) {
    this.songIds = [...songIds];
    this.position = initialPosition;
  }

  get currentSongId() {
    return this.songIds[this.position];
  }

  // Exact reproduction of playerQueue.ts:388-460
  playNext(songIds) {
    const ids = Array.isArray(songIds) ? songIds : [songIds];
    if (ids.length === 0) return;

    if (this.songIds.length === 0) {
      this.songIds = [...ids];
      this.position = 0;
      return;
    }

    const removalSet = new Set(ids);
    const newSongIds = [];
    let removedBeforeCurrent = 0;
    let currentWasRemoved = false;

    for (let i = 0; i < this.songIds.length; i += 1) {
      const id = this.songIds[i];
      if (removalSet.has(id)) {
        if (i < this.position) {
          removedBeforeCurrent += 1;
        }
        if (i === this.position) {
          currentWasRemoved = true;
        }
      } else {
        newSongIds.push(id);
      }
    }

    let newPosition = 0;
    if (newSongIds.length === 0) {
      newSongIds.push(...ids);
      newPosition = 0;
    } else {
      if (currentWasRemoved) {
        newPosition = Math.max(
          0,
          Math.min(this.position - removedBeforeCurrent, newSongIds.length - 1)
        );
      } else {
        newPosition = this.position - removedBeforeCurrent;
      }
      newSongIds.splice(newPosition + 1, 0, ...ids);
    }

    const oldPosition = this.position;
    this.songIds = newSongIds;
    this.position = newPosition;
  }
}

console.log('=== Running Reproduction TEAM04-003 ===');

// Setup: Queue has 5 songs: [101, 102, 103, 104, 105]
// Currently playing song is 102 (position = 1)
const queue = new QueueModel([101, 102, 103, 104, 105], 1);
console.log('Initial queue state:');
console.log('  Queue:', queue.songIds);
console.log('  Position:', queue.position, '-> Song:', queue.currentSongId);
assert.strictEqual(queue.currentSongId, 102, 'Current song should be 102');

// User selects [102, 201] (including currently playing song 102) to Play Next
console.log('\nExecuting: playNext([102, 201])...');
queue.playNext([102, 201]);

console.log('Post-playNext state:');
console.log('  Queue:', queue.songIds);
console.log('  Position:', queue.position, '-> Song:', queue.currentSongId);

// What happened?
// newSongIds filtered out 102 -> [101, 103, 104, 105]
// currentWasRemoved = true
// removedBeforeCurrent = 0
// newPosition = Math.max(0, Math.min(1 - 0, 3)) = 1
// newSongIds.splice(1 + 1, 0, 102, 201) -> [101, 103, 102, 201, 104, 105]
// queue.position = 1
// queue.songIds[1] is now 103! But the audio engine was playing 102!
assert.notStrictEqual(
  queue.currentSongId,
  102,
  'Defect: Currently playing song 102 was silently displaced from queue.position'
);
assert.strictEqual(
  queue.currentSongId,
  103,
  'Defect: queue.position now unexpectedly points to 103'
);
assert.strictEqual(
  queue.songIds[queue.position + 1],
  102,
  'Defect: Currently playing song was demoted to play-next queue item'
);

console.log('\nConfirmed: Currently playing song was displaced from active playback pointer.');
console.log('Audio engine playing ID 102 while queue position points to ID 103.');
console.log('=== Reproduction TEAM04-003 Verified Successfully ===');
