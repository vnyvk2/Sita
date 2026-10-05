/**
 * Adversarial Reproduction Script: Team 12 (Cross-Subsystem Chaos & Concurrency)
 * 
 * Demonstrates:
 * 1. Worker crash race: parseTask.reject unblocks caller before in-flight onBatch transaction settles,
 *    causing duplicate ingestion of the batch tracks in local fallback.
 * 2. withTxLock read starvation: bare SELECT statements are blocked waiting for write transactions,
 *    destroying SQLite WAL mode concurrent read capabilities.
 * 3. Concurrent playlist deletion during Spotify sync leaving remote playlist irreversibly mutated.
 */

import assert from 'node:assert';

console.log('=== TEST 1: Worker Crash Race with In-Flight onBatch Transaction ===');

// Simulate the race between handleWorkerExit and in-flight onBatch
async function simulateWorkerCrashRace() {
  const songs = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, path: `/music/song_${i + 1}.mp3` }));
  let durablyCommittedSongCount = 0;
  const committedToDb = [];
  const processedByFallback = [];

  let onBatchResolve;
  const onBatchActive = new Promise((resolve) => (onBatchResolve = resolve));

  // Simulated MediaWorkerBridge
  let rejectParseTask;
  const parsePromise = new Promise((resolve, reject) => {
    rejectParseTask = reject;
  });

  // Simulated onBatch callback (running in Main process)
  const onBatch = async (batch) => {
    // In-flight async DB transaction simulating 100ms commit
    await new Promise((r) => setTimeout(r, 60));
    committedToDb.push(...batch.tracks);
    durablyCommittedSongCount += batch.tracks.length;
    onBatchResolve();
  };

  // Start batch 1 processing
  const batch1 = { batchId: 1, tracks: songs.slice(0, 100), errors: [] };
  const inFlightBatchPromise = onBatch(batch1);

  // Worker crashes while onBatch is still in-flight at t = 20ms!
  await new Promise((r) => setTimeout(r, 20));
  rejectParseTask(new Error('Worker process crashed (exit code 1)'));

  // Main catches worker error (as in songWorkerPool.ts:427-460)
  try {
    await parsePromise;
  } catch (workerErr) {
    // Slices remaining songs based on durablyCommittedSongCount (which is still 0!)
    const remainingSongs = songs.slice(durablyCommittedSongCount);
    // Local fallback processes remaining songs
    processedByFallback.push(...remainingSongs);
  }

  // Await the in-flight onBatch to complete
  await inFlightBatchPromise;

  return {
    totalOriginal: songs.length,
    durablyCommittedAfterBatch: durablyCommittedSongCount,
    batch1Count: committedToDb.length,
    fallbackCount: processedByFallback.length,
    overlapCount: committedToDb.filter((t) => processedByFallback.some((f) => f.id === t.id)).length
  };
}

const raceResult = await simulateWorkerCrashRace();
console.log('Worker Crash Ingestion Race Result:', raceResult);

// Verify that batch 1 tracks (IDs 1-100) were processed BOTH by in-flight onBatch AND by local fallback!
assert.strictEqual(raceResult.batch1Count, 100);
assert.strictEqual(raceResult.fallbackCount, 200);
assert.strictEqual(raceResult.overlapCount, 100, 'DEFECT CONFIRMED: 100 songs were duplicated due to un-awaited onBatch!');


console.log('\n=== TEST 2: withTxLock Read Starvation Under SQLite WAL Mode ===');

// Simulate the engine.ts withTxLock and guardBareStatement
class EngineLockSimulation {
  constructor() {
    this.txLock = null;
  }

  async withTxLock(fn) {
    const prev = this.txLock;
    let release;
    const lock = new Promise((resolve) => (release = resolve));
    this.txLock = lock;
    try {
      if (prev) await prev;
      return await fn();
    } finally {
      release();
      if (this.txLock === lock) this.txLock = null;
    }
  }

  // Simulated bare SELECT statement from guardBareStatement (engine.ts:153-156)
  async executeSelect(queryName) {
    const t0 = Date.now();
    if (this.txLock) {
      const prev = this.txLock;
      await prev; // Waits for write transaction lock to release!
    }
    const waitTime = Date.now() - t0;
    return { queryName, waitTime };
  }
}

const engine = new EngineLockSimulation();

// Start a 100ms write transaction (e.g. library scanner batch insert)
const writeTxPromise = engine.withTxLock(async () => {
  await new Promise((r) => setTimeout(r, 100));
  return 'WRITE_COMMITTED';
});

// While write transaction is active, audio player queries song metadata for playback
await new Promise((r) => setTimeout(r, 10)); // let write lock acquire
const readResult = await engine.executeSelect('getSongInfo([42])');
await writeTxPromise;

console.log('Read query result during active write transaction:', readResult);
assert.ok(readResult.waitTime >= 60, 'DEFECT CONFIRMED: Read query was blocked for >60ms despite SQLite WAL capability!');


console.log('\n=== TEST 3: Concurrent Playlist Deletion During Spotify Sync ===');

// Simulate Spotify Sync + Playlist Deletion
class SpotifySyncSimulation {
  constructor() {
    this.activeSyncLocks = new Set();
    this.localPlaylists = new Map([[15, { id: 15, name: 'Chill Vibes' }]]);
    this.remoteSpotifyPlaylist = ['spotify:track:1', 'spotify:track:2'];
  }

  async deletePlaylist(playlistId) {
    // deletePlaylist does NOT check activeSyncLocks!
    this.localPlaylists.delete(playlistId);
    return true;
  }

  async syncPlaylist(playlistId, newTracks) {
    this.activeSyncLocks.add(playlistId);
    try {
      // Phase 1: Remote HTTP network calls to Spotify (takes 100ms)
      await new Promise((r) => setTimeout(r, 100));
      this.remoteSpotifyPlaylist = [...newTracks]; // Mutated remotely!

      // Phase 2: Local SQLite transaction
      const localRecord = this.localPlaylists.get(playlistId);
      if (!localRecord) {
        throw new Error('Local playlist does not exist (deleted concurrently)');
      }
    } finally {
      this.activeSyncLocks.delete(playlistId);
    }
  }
}

const syncSim = new SpotifySyncSimulation();
console.log('Initial Remote Spotify Tracks:', syncSim.remoteSpotifyPlaylist);

// Start sync in background
const syncPromise = syncSim.syncPlaylist(15, ['spotify:track:99', 'spotify:track:100']);

// User deletes playlist locally at t = 30ms while Spotify network calls are in flight
await new Promise((r) => setTimeout(r, 30));
await syncSim.deletePlaylist(15);
console.log('Local playlist deleted while sync was in flight. Local playlists:', syncSim.localPlaylists.size);

// Sync attempts Phase 2 and fails
let syncError = null;
try {
  await syncPromise;
} catch (err) {
  syncError = err.message;
}

console.log('Sync result:', syncError);
console.log('Remote Spotify Tracks after failure:', syncSim.remoteSpotifyPlaylist);

assert.strictEqual(syncError, 'Local playlist does not exist (deleted concurrently)');
assert.deepStrictEqual(syncSim.remoteSpotifyPlaylist, ['spotify:track:99', 'spotify:track:100'], 'DEFECT CONFIRMED: Remote Spotify playlist was irreversibly modified despite local deletion failure!');

console.log('\nALL CROSS-SUBSYSTEM CHAOS & CONCURRENCY DEFECTS PROVEN!');
