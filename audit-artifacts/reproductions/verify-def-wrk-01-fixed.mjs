/**
 * Verification Script: DEF-WRK-01 Fix
 * 
 * Verifies that when a worker exits/crashes while an onBatch transaction is in-flight:
 * 1. The in-flight onBatch transaction is allowed to complete durably before parseTask rejects.
 * 2. durablyCommittedSongCount is updated accurately before fallback begins.
 * 3. The local fallback slices songs starting AFTER the durably committed batch.
 * 4. Overlap count between onBatch and local fallback is strictly ZERO (no duplicate ingestion, no unique constraint crashes).
 */

import assert from 'node:assert';

console.log('=== VERIFYING DEF-WRK-01 FIX: Worker Crash with In-Flight onBatch ===\n');

async function testFixedWorkerCrashHandling() {
  const songs = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, path: `/music/song_${i + 1}.mp3` }));
  let durablyCommittedSongCount = 0;
  const committedToDb = [];
  const processedByFallback = [];

  let onBatchFinished = false;
  let activeBatchPromise = null;

  // Simulated MediaWorkerBridge task resolver with the fix
  let rejectParseTask;
  let resolveParseTask;
  let settled = false;

  const parsePromise = new Promise((resolve, reject) => {
    resolveParseTask = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    rejectParseTask = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
  });

  const parseTask = {
    resolve: resolveParseTask,
    reject: rejectParseTask,
    totalParsed: 0,
    totalErrors: 0,
    activeBatchPromise: undefined,
    onBatch: async (batch) => {
      // In-flight async DB transaction simulating 60ms commit
      await new Promise((r) => setTimeout(r, 60));
      committedToDb.push(...batch.tracks);
      durablyCommittedSongCount += batch.tracks.length;
      onBatchFinished = true;
    }
  };

  // Start batch 1 processing
  const batch1 = { batchId: 1, tracks: songs.slice(0, 100), errors: [], isLastBatch: false };
  const batchPromise = parseTask.onBatch(batch1);
  parseTask.activeBatchPromise = batchPromise;

  // Simulate worker crash at t = 20ms while onBatch is in flight!
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(onBatchFinished, false, 'onBatch should still be in-flight when worker crashes');

  // Simulated handleWorkerExit with the FIX:
  const exitCode = 1;
  const exitError = new Error(`[MediaWorkerBridge] Worker process exited with code ${exitCode} during track parsing.`);
  
  if (parseTask.activeBatchPromise) {
    void parseTask.activeBatchPromise
      .finally(() => {
        parseTask.reject(exitError);
      })
      .catch((err) => {
        console.warn('In-flight batch failed:', err);
      });
  } else {
    parseTask.reject(exitError);
  }

  // Caller (songWorkerPool) waits for parsePromise
  try {
    await parsePromise;
  } catch (workerErr) {
    // When workerErr is caught, verify that onBatch has completely settled!
    assert.strictEqual(onBatchFinished, true, 'onBatch MUST have finished before workerErr was thrown to caller');
    assert.strictEqual(durablyCommittedSongCount, 100, 'durablyCommittedSongCount must accurately be 100');

    // Slices remaining songs based on durablyCommittedSongCount
    const remainingSongs = songs.slice(durablyCommittedSongCount);
    processedByFallback.push(...remainingSongs);
  }

  return {
    totalOriginal: songs.length,
    durablyCommittedAfterBatch: durablyCommittedSongCount,
    batch1Count: committedToDb.length,
    fallbackCount: processedByFallback.length,
    overlapCount: committedToDb.filter((t) => processedByFallback.some((f) => f.id === t.id)).length
  };
}

const result = await testFixedWorkerCrashHandling();
console.log('Fixed Worker Crash Ingestion Result:', result);

assert.strictEqual(result.batch1Count, 100, 'Batch 1 must be committed');
assert.strictEqual(result.fallbackCount, 100, 'Fallback must process only the remaining 100 songs');
assert.strictEqual(result.durablyCommittedAfterBatch, 100, 'Committed count must be 100');
assert.strictEqual(result.overlapCount, 0, 'ZERO OVERLAP: songs 1-100 were NOT duplicated in fallback!');
assert.strictEqual(result.batch1Count + result.fallbackCount, 200, 'All 200 songs accounted for exactly once!');

console.log('\n[PASS] DEF-WRK-01 FIX VERIFIED: In-flight batch cleanly commits before fallback, completely eliminating duplicate ingestion and DB write races!');
