/**
 * REPRODUCTION: TEAM09-002
 * Title: UndoEngine in-memory sequence pointer causes journal desync and re-application after app restart
 *
 * Demonstrates that because `UndoEngine.sequencePointers` is stored in an ephemeral in-memory Map,
 * restarting or reloading the application clears all sequence pointers.
 *
 * Consequently:
 * 1. If an operation was undone prior to restart, `undo()` after restart calls `getLatest()` from DB,
 *    retrieving the already-undone operation and inverting it a second time.
 * 2. New operations executed after restart bypass redo branch pruning because `getCurrentPointer()`
 *    returns `undefined`, creating corrupted journal histories or unique constraint collisions.
 */

import assert from 'node:assert';

class InMemoryJournalRepo {
  constructor() {
    this.entries = []; // { collectionId, sequenceNumber, op, inverseOp }
  }

  async insert(collectionId, op, inverseOp) {
    const latest = await this.getLatest(collectionId);
    const seq = (latest?.sequenceNumber ?? 0) + 1;
    const entry = { collectionId, sequenceNumber: seq, op, inverseOp };
    this.entries.push(entry);
    return seq;
  }

  async getLatest(collectionId) {
    const list = this.entries.filter((e) => e.collectionId === collectionId);
    if (list.length === 0) return null;
    return list.sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
  }

  async getCurrentOrPrevious(collectionId, currentSeq) {
    const list = this.entries
      .filter((e) => e.collectionId === collectionId && e.sequenceNumber <= currentSeq)
      .sort((a, b) => b.sequenceNumber - a.sequenceNumber);
    return list[0] || null;
  }

  async pruneAfter(collectionId, seq) {
    this.entries = this.entries.filter(
      (e) => e.collectionId !== collectionId || e.sequenceNumber <= seq
    );
  }
}

// Simulates Nora's UndoEngine and OperationJournalWriter
class SimulatedUndoEngine {
  constructor(journalRepo) {
    this.journalRepo = journalRepo;
    this.sequencePointers = new Map();
  }

  getCurrentPointer(collectionId) {
    return this.sequencePointers.get(collectionId);
  }

  async executeNewOperation(collectionId, opName) {
    // OperationJournalWriter pruning logic (from OperationJournalWriter.ts:25-37)
    const currentSeq = this.getCurrentPointer(collectionId);
    if (currentSeq !== undefined) {
      await this.journalRepo.pruneAfter(collectionId, currentSeq);
    }

    const seq = await this.journalRepo.insert(
      collectionId,
      opName,
      `inverse_${opName}`
    );
    this.sequencePointers.set(collectionId, seq);
    return seq;
  }

  async undo(collectionId) {
    let currentSeq = this.sequencePointers.get(collectionId);
    if (currentSeq === undefined) {
      const latest = await this.journalRepo.getLatest(collectionId);
      if (!latest) return null;
      currentSeq = latest.sequenceNumber;
    }

    if (currentSeq <= 0) return null;

    const entry = await this.journalRepo.getCurrentOrPrevious(collectionId, currentSeq);
    if (!entry) return null;

    // Invert operation
    const invertedOp = entry.inverseOp;
    this.sequencePointers.set(collectionId, entry.sequenceNumber - 1);
    return { appliedInverse: invertedOp, sequenceNumber: entry.sequenceNumber };
  }
}

console.log('=== Running Reproduction TEAM09-002 ===');

const sharedJournalDb = new InMemoryJournalRepo();

// Session 1: User adds 3 tracks to playlist 1
let engine = new SimulatedUndoEngine(sharedJournalDb);
await engine.executeNewOperation(1, 'add_song_A'); // seq 1
await engine.executeNewOperation(1, 'add_song_B'); // seq 2
await engine.executeNewOperation(1, 'add_song_C'); // seq 3

console.log('Session 1 - Executed 3 operations: [A, B, C].');
console.log('Current in-memory pointer:', engine.getCurrentPointer(1)); // 3

// User hits Undo: reverts C
const undoResult1 = await engine.undo(1);
console.log('Session 1 - Undid operation:', undoResult1);
assert.strictEqual(undoResult1.appliedInverse, 'inverse_add_song_C');
assert.strictEqual(engine.getCurrentPointer(1), 2);

// App closes / reloads: In-memory pointers are LOST, but SQLite journal DB persists
console.log('\n--- Simulating Application Restart / Reload ---');
engine = new SimulatedUndoEngine(sharedJournalDb); // Fresh instance
console.log('Session 2 - Pointer after reload:', engine.getCurrentPointer(1)); // undefined!

// Defect 1: User hits Undo again in the new session
// Expected: Revert song B (seq 2).
// Actual bug: Because pointer is undefined, it loads getLatest() which is STILL seq 3!
const undoResult2 = await engine.undo(1);
console.log('Session 2 - Undid operation after restart:', undoResult2);

assert.strictEqual(
  undoResult2.sequenceNumber,
  3,
  'Defect: Re-executed inverse of operation 3 (already undone in previous session)!'
);
assert.strictEqual(
  undoResult2.appliedInverse,
  'inverse_add_song_C',
  'Defect: Repeatedly inverted the same already-undone operation!'
);

console.log('\nConfirmed: Ephemeral sequence pointer causes journal desynchronization and duplicate undo.');
console.log('=== Reproduction TEAM09-002 Verified Successfully ===');
