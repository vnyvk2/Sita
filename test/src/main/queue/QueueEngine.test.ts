import { describe, it, expect, beforeEach } from 'vitest';

import { QueueEngine } from '../../../../src/main/queue/QueueEngine';

describe('QueueEngine', () => {
  let engine: QueueEngine;

  beforeEach(() => {
    engine = new QueueEngine();
  });

  it('should replace the queue', () => {
    engine.replaceQueue([101, 102, 103], { type: 'playlist', id: 1 });
    const state = engine.getState();

    expect(state.entries.length).toBe(3);
    expect(state.entries.map((e) => e.songId)).toEqual([101, 102, 103]);
    expect(state.shufflePermutation).toEqual([0, 1, 2]);
    expect(state.currentEntryId).toBe(state.entries[0].id);
    expect(state.history).toEqual([]);
  });

  it('should add to end', () => {
    engine.replaceQueue([101, 102], { type: 'playlist', id: 1 });
    engine.addToEnd([103, 104], { type: 'playlist', id: 1 });

    const state = engine.getState();
    expect(state.entries.length).toBe(4);
    expect(state.shufflePermutation).toEqual([0, 1, 2, 3]);
  });

  it('should add next', () => {
    engine.replaceQueue([101, 102], { type: 'playlist', id: 1 }); // Current is 101 (pos 0)
    engine.addNext([103], { type: 'playlist', id: 1 });

    const state = engine.getState();
    // Order should be 101, 103, 102
    expect(state.entries.map((e) => e.songId)).toEqual([101, 103, 102]);
    expect(state.shufflePermutation).toEqual([0, 1, 2]);
  });

  it('should advance and update history', () => {
    engine.replaceQueue([101, 102], { type: 'playlist', id: 1 });
    const firstId = engine.getState().currentEntryId;

    engine.advance();

    const state = engine.getState();
    expect(state.currentEntryId).toBe(state.entries[1].id);
    expect(state.history.length).toBe(1);
    expect(state.history[0]).toBe(firstId);
  });

  it('should jump and update history', () => {
    engine.replaceQueue([101, 102, 103], { type: 'playlist', id: 1 });
    const state = engine.getState();
    const targetId = state.entries[2].id; // Jump to third song
    const currentId = state.currentEntryId;

    engine.jumpTo(targetId);

    expect(engine.getState().currentEntryId).toBe(targetId);
    expect(engine.getState().history.length).toBe(1);
    expect(engine.getState().history[0]).toBe(currentId);
  });

  it('should remove entry', () => {
    engine.replaceQueue([101, 102, 103], { type: 'playlist', id: 1 });
    const state = engine.getState();
    const idToRemove = state.entries[1].id;

    engine.removeEntry(idToRemove);

    const newState = engine.getState();
    expect(newState.entries.length).toBe(2);
    expect(newState.entries.map((e) => e.songId)).toEqual([101, 103]);
    expect(newState.shufflePermutation).toEqual([0, 1]);
  });

  it('should handle repeat modes', () => {
    engine.replaceQueue([101, 102], { type: 'playlist', id: 1 });

    // Test repeat all
    engine.setRepeatMode('all');
    engine.advance(); // now at 102
    engine.advance(); // back to 101

    expect(engine.getState().currentEntryId).toBe(engine.getState().entries[0].id);

    // Test repeat one
    engine.setRepeatMode('one');
    const currId = engine.getState().currentEntryId;
    engine.advance(); // should stay on 101

    expect(engine.getState().currentEntryId).toBe(currId);
  });

  it('should have idempotence for shuffle -> unshuffle', () => {
    // Provide a deterministic randomizer for this test if needed, but the test ensures structural match regardless of randomness.
    engine.replaceQueue([101, 102, 103, 104, 105], { type: 'playlist', id: 1 });
    const initialStateStr = JSON.stringify(engine.getState());

    engine.toggleShuffle(); // Shuffled
    engine.toggleShuffle(); // Unshuffled

    const finalStateStr = JSON.stringify(engine.getState());
    expect(initialStateStr).toEqual(finalStateStr);
  });

  it('should handle removing current track while shuffled', () => {
    // Force a deterministic randomizer that reverses the array [0,1,2] -> [0,2,1]
    const deterministicEngine = new QueueEngine({
      randomizer: () => 0
    });
    deterministicEngine.replaceQueue([101, 102, 103], { type: 'playlist', id: 1 });
    deterministicEngine.toggleShuffle();
    // Shuffle puts current (101) at index 0. The rest is [103, 102].
    // So playback is [101, 103, 102].

    const state = deterministicEngine.getState();
    const currentId = state.currentEntryId!;
    expect(state.entries.find((e) => e.id === currentId)?.songId).toBe(101);

    // Remove current
    deterministicEngine.removeEntry(currentId);

    // The current track should advance to 103 automatically
    const newState = deterministicEngine.getState();
    expect(newState.entries.length).toBe(2);
    expect(newState.entries.find((e) => e.id === newState.currentEntryId)?.songId).toBe(103);
  });

  it('should safely handle empty queue operations', () => {
    engine.clear();
    expect(() => {
      engine.advance();
      engine.goBack();
      engine.jumpTo('non-existent');
      engine.removeEntry('non-existent');
      engine.toggleShuffle();
    }).not.toThrow();
  });

  it('should correctly handle single-song queue with repeat bounds', () => {
    engine.replaceQueue([101], { type: 'playlist', id: 1 });

    // Repeat None
    engine.setRepeatMode('none');
    engine.advance();
    expect(engine.getState().currentEntryId).toBeUndefined();

    // Reset
    engine.replaceQueue([101], { type: 'playlist', id: 1 });

    // Repeat All
    engine.setRepeatMode('all');
    engine.advance();
    expect(engine.getState().currentEntryId).toBe(engine.getState().entries[0].id);

    // Repeat One
    engine.setRepeatMode('one');
    engine.advance();
    expect(engine.getState().currentEntryId).toBe(engine.getState().entries[0].id);
  });

  it('should random stress test 1000 operations without breaking invariants', () => {
    engine.replaceQueue([101, 102, 103, 104, 105], { type: 'playlist', id: 1 });

    for (let i = 0; i < 1000; i++) {
      const state = engine.getState();
      const op = Math.random();

      if (op < 0.2 && state.entries.length > 0) {
        engine.advance();
      } else if (op < 0.4) {
        engine.addToEnd([Math.floor(Math.random() * 1000)], { type: 'songs' });
      } else if (op < 0.5 && state.entries.length > 0) {
        const randomId = state.entries[Math.floor(Math.random() * state.entries.length)].id;
        engine.removeEntry(randomId);
      } else if (op < 0.7) {
        engine.toggleShuffle();
      } else if (op < 0.8 && state.entries.length > 0) {
        const randomId = state.entries[Math.floor(Math.random() * state.entries.length)].id;
        engine.jumpTo(randomId);
      } else if (op < 0.9 && state.entries.length > 0) {
        const randomId = state.entries[Math.floor(Math.random() * state.entries.length)].id;
        const targetPos = Math.floor(Math.random() * state.entries.length);
        engine.reorder(randomId, targetPos);
      } else {
        engine.goBack();
      }

      // Assert Invariants
      const s = engine.getState();
      expect(s.entries.length).toBe(s.shufflePermutation.length);

      // Ensure permutation values are within bounds and unique
      const sortedPerm = [...s.shufflePermutation].sort((a, b) => a - b);
      const expectedPerm = s.entries.map((_, idx) => idx);
      expect(sortedPerm).toEqual(expectedPerm);

      // currentEntryId must be valid if entries exist and we haven't advanced past end
      if (s.currentEntryId) {
        const exists = s.entries.some((e) => e.id === s.currentEntryId);
        expect(exists).toBe(true);
      }
    }
  });
});
