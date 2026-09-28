import assert from 'node:assert';
import PlayerQueue from '../../src/renderer/src/other/playerQueue.ts';

console.log('=== Running Verification DEF-QUE-01 Fixed ===');

// 1. Test removeSongId when deleting currently playing song (not the last song)
{
  const queue = new PlayerQueue([101, 102, 103], 0);
  assert.strictEqual(queue.currentSongId, 101);

  let positionChangeData = null;
  queue.on('positionChange', (data) => {
    positionChangeData = data;
  });

  const removed = queue.removeSongId(101);
  assert.strictEqual(removed, true, 'Song 101 should be removed');
  assert.deepStrictEqual(queue.songIds, [102, 103]);
  assert.strictEqual(queue.position, 0);
  assert.strictEqual(queue.currentSongId, 102);

  assert.notStrictEqual(
    positionChangeData,
    null,
    'positionChange MUST be emitted when active song is deleted!'
  );
  assert.strictEqual(positionChangeData.oldPosition, 0);
  assert.strictEqual(positionChangeData.newPosition, 0);
  assert.strictEqual(positionChangeData.currentSongId, 102);
  console.log('Test 1 Passed: removeSongId on active middle track emits positionChange');
}

// 2. Test removeSongId when deleting currently playing song (last song in queue)
{
  const queue = new PlayerQueue([101, 102, 103], 2);
  assert.strictEqual(queue.currentSongId, 103);

  let positionChangeData = null;
  queue.on('positionChange', (data) => {
    positionChangeData = data;
  });

  const removed = queue.removeSongId(103);
  assert.strictEqual(removed, true);
  assert.deepStrictEqual(queue.songIds, [101, 102]);
  assert.strictEqual(queue.position, 1);
  assert.strictEqual(queue.currentSongId, 102);

  assert.notStrictEqual(positionChangeData, null);
  assert.strictEqual(positionChangeData.oldPosition, 2);
  assert.strictEqual(positionChangeData.newPosition, 1);
  assert.strictEqual(positionChangeData.currentSongId, 102);
  console.log('Test 2 Passed: removeSongId on last track shifts position to previous track and emits');
}

// 3. Test removeSongAtPosition when deleting currently playing song
{
  const queue = new PlayerQueue([201, 202, 203], 1);
  assert.strictEqual(queue.currentSongId, 202);

  let positionChangeData = null;
  queue.on('positionChange', (data) => {
    positionChangeData = data;
  });

  const removed = queue.removeSongAtPosition(1);
  assert.strictEqual(removed, 202);
  assert.deepStrictEqual(queue.songIds, [201, 203]);
  assert.strictEqual(queue.position, 1);
  assert.strictEqual(queue.currentSongId, 203);

  assert.notStrictEqual(positionChangeData, null);
  assert.strictEqual(positionChangeData.oldPosition, 1);
  assert.strictEqual(positionChangeData.newPosition, 1);
  assert.strictEqual(positionChangeData.currentSongId, 203);
  console.log('Test 3 Passed: removeSongAtPosition on active song emits positionChange');
}

// 4. Test PlayerQueue.clear() when position was 0
{
  const queue = new PlayerQueue([301, 302], 0);
  assert.strictEqual(queue.currentSongId, 301);

  let positionChangeData = null;
  queue.on('positionChange', (data) => {
    positionChangeData = data;
  });

  queue.clear();
  assert.strictEqual(queue.songIds.length, 0);
  assert.strictEqual(queue.currentSongId, null);

  assert.notStrictEqual(
    positionChangeData,
    null,
    'clear() MUST emit positionChange even if oldPosition === 0'
  );
  assert.strictEqual(positionChangeData.oldPosition, 0);
  assert.strictEqual(positionChangeData.newPosition, 0);
  assert.strictEqual(positionChangeData.currentSongId, null);
  console.log('Test 4 Passed: clear() at position 0 emits positionChange with currentSongId: null');
}

// 5. Test PlayerQueue.clear() when position was > 0
{
  const queue = new PlayerQueue([401, 402, 403], 2);
  let positionChangeData = null;
  queue.on('positionChange', (data) => {
    positionChangeData = data;
  });

  queue.clear();
  assert.notStrictEqual(positionChangeData, null);
  assert.strictEqual(positionChangeData.oldPosition, 2);
  assert.strictEqual(positionChangeData.newPosition, 0);
  assert.strictEqual(positionChangeData.currentSongId, null);
  console.log('Test 5 Passed: clear() at position 2 emits positionChange with currentSongId: null');
}

// 6. Test removing the single only track in the queue
{
  const queue = new PlayerQueue([501], 0);
  let positionChangeData = null;
  queue.on('positionChange', (data) => {
    positionChangeData = data;
  });

  queue.removeSongId(501);
  assert.strictEqual(queue.songIds.length, 0);
  assert.strictEqual(queue.position, 0);
  assert.strictEqual(queue.currentSongId, null);

  assert.notStrictEqual(positionChangeData, null);
  assert.strictEqual(positionChangeData.currentSongId, null);
  console.log('Test 6 Passed: removeSongId emptying queue emits positionChange with currentSongId: null');
}

console.log('=== All DEF-QUE-01 Verifications Passed Successfully ===');
