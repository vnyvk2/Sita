import assert from 'node:assert';

/**
 * REPRODUCTION SCRIPT: Queue versioning cache desync on structural reorder
 *
 * Demonstrates how QueuePanel and QueueContainer currently compute queueVersion using
 * ONLY viewingQueue.membershipVersion. When an existing song in the queue is moved via
 * playNext() or drag reordering, structureVersion increments but membershipVersion does not.
 * Consequently, queueVersion is unchanged, React Query reuses the old window cache,
 * and the UI displays mismatched track titles and artwork.
 */

console.log('=== Running Reproduction: Queue Versioning Cache Desync ===');

// 1. Minimal representation of PlayerQueue versioning semantics (matches src/renderer/src/other/playerQueue.ts)
class MockPlayerQueue {
  constructor(songIds) {
    this.id = 'queue-main';
    this.songIds = [...songIds];
    this.position = 0;
    this._structureVersion = 0;
    this._membershipVersion = 0;
  }

  get structureVersion() {
    return this._structureVersion;
  }

  get membershipVersion() {
    return this._membershipVersion;
  }

  // Exact implementation logic from src/renderer/src/other/playerQueue.ts lines 388-465
  playNext(songId) {
    const ids = Array.isArray(songId) ? songId : [songId];
    const incomingCounts = new Map();
    for (const id of ids) incomingCounts.set(id, (incomingCounts.get(id) || 0) + 1);

    const removedCounts = new Map();
    const newSongIds = [];
    for (const id of this.songIds) {
      if (incomingCounts.has(id) && (removedCounts.get(id) || 0) < incomingCounts.get(id)) {
        removedCounts.set(id, (removedCounts.get(id) || 0) + 1);
      } else {
        newSongIds.push(id);
      }
    }

    // Insert after current position
    newSongIds.splice(this.position + 1, 0, ...ids);

    let membershipChanged = incomingCounts.size !== removedCounts.size;
    if (!membershipChanged) {
      for (const [id, count] of incomingCounts.entries()) {
        if (removedCounts.get(id) !== count) {
          membershipChanged = true;
          break;
        }
      }
    }

    this.songIds = newSongIds;
    this._structureVersion = (this._structureVersion + 1) | 0;

    if (membershipChanged) {
      this._membershipVersion = (this._membershipVersion + 1) | 0;
    }
  }
}

// 2. Current queueVersion calculation from QueuePanel.tsx:47-50 and QueueContainer.tsx:221-224
function computeCurrentQueueVersion(viewingQueue, queueId, songIds) {
  if (viewingQueue?.membershipVersion !== undefined) {
    return `${queueId}:${viewingQueue.membershipVersion}`;
  }
  return `${queueId}:${songIds.length}`;
}

// 3. Proposed fix: incorporate structureVersion into the versioning key
function computeFixedQueueVersion(viewingQueue, queueId, songIds) {
  if (viewingQueue?.structureVersion !== undefined && viewingQueue?.membershipVersion !== undefined) {
    return `${queueId}:${viewingQueue.structureVersion}:${viewingQueue.membershipVersion}`;
  }
  return `${queueId}:${songIds.length}`;
}

// 4. Test Scenario: Initial queue with 4 tracks
const queue = new MockPlayerQueue([101, 102, 103, 104]);

// Initial state
const initialVersionCurrent = computeCurrentQueueVersion(queue, queue.id, queue.songIds);
const initialVersionFixed = computeFixedQueueVersion(queue, queue.id, queue.songIds);

console.log(`Initial Queue: [${queue.songIds.join(', ')}]`);
console.log(`Initial structureVersion: ${queue.structureVersion}, membershipVersion: ${queue.membershipVersion}`);
console.log(`Initial current queueVersion: "${initialVersionCurrent}"`);
console.log(`Initial fixed queueVersion:   "${initialVersionFixed}"`);

// Mock React Query Window Cache for window starting at index 0
const mockQueryCache = new Map();
mockQueryCache.set(`['queue','window','queue-main','${initialVersionCurrent}',0]`, [
  { songId: 101, title: 'Track 101' },
  { songId: 102, title: 'Track 102' },
  { songId: 103, title: 'Track 103' },
  { songId: 104, title: 'Track 104' }
]);

// 5. User action: "Play Next" for Track 104 (already in queue)
console.log('\n--- Action: playNext(104) ---');
queue.playNext(104);

console.log(`New Queue:     [${queue.songIds.join(', ')}]`);
console.log(`New structureVersion: ${queue.structureVersion}, membershipVersion: ${queue.membershipVersion}`);

const newVersionCurrent = computeCurrentQueueVersion(queue, queue.id, queue.songIds);
const newVersionFixed = computeFixedQueueVersion(queue, queue.id, queue.songIds);

console.log(`New current queueVersion:     "${newVersionCurrent}"`);
console.log(`New fixed queueVersion:       "${newVersionFixed}"`);

// 6. Verification of the bug in current code:
const isCurrentVersionStale = initialVersionCurrent === newVersionCurrent;
console.log(`\nDid current queueVersion change? ${!isCurrentVersionStale ? 'YES' : 'NO (BUG: STALE)'}`);
assert.strictEqual(isCurrentVersionStale, true, 'BUG CONFIRMED: Current queueVersion failed to update when track was reordered!');

// Show the consequence in UI:
const currentQueryKey = `['queue','window','queue-main','${newVersionCurrent}',0]`;
const cachedSlice = mockQueryCache.get(currentQueryKey);
console.log(`Cached slice returned by React Query for slot 1:`);
console.log(`  Actual queue song at index 1: Song ID ${queue.songIds[1]}`);
console.log(`  Rendered title from cache:     "${cachedSlice[1].title}" (Song ID ${cachedSlice[1].songId})`);
assert.notStrictEqual(queue.songIds[1], cachedSlice[1].songId, 'UI BUG: Metadata rendered for slot 1 is WRONG track!');

// 7. Verification of the fix:
const isFixedVersionUpdated = initialVersionFixed !== newVersionFixed;
console.log(`\nDid fixed queueVersion change?   ${isFixedVersionUpdated ? 'YES (CORRECT)' : 'NO'}`);
assert.strictEqual(isFixedVersionUpdated, true, 'FIX VERIFIED: Fixed queueVersion changed and invalidates cache!');

console.log('\n>>> REPRODUCTION SUCCESSFUL: Bug confirmed and fix verified in isolation! <<<');
