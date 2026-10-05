/**
 * REPRODUCTION: TEAM04-001
 * Title: VirtualizedList restoration state machine permanently deadlocks in 'RESTORING' state
 *
 * Demonstrates that when scroll restoration targets an index that is no longer reachable
 * (e.g. user applied a filter, deleted tracks, or changed sorting such that list length < targetIndex - 25),
 * the restoration state machine can NEVER satisfy `isTargetReached`.
 *
 * As a consequence:
 * 1. `restorationStateRef.current` is stuck in 'RESTORING' indefinitely.
 * 2. `scrollRegistry.set()` is never called, permanently breaking scroll position persistence.
 * 3. The `is-scrolling` class handler early-returns on line 147, disabling scroll velocity tracking.
 */

import assert from 'node:assert';

class VirtualizedListRestorationModel {
  constructor(initialTargetIndex, initialListLength) {
    this.targetIndex = initialTargetIndex;
    this.listLength = initialListLength;
    this.restorationState = initialTargetIndex > 0 ? 'RESTORING' : 'TRACKING';
    this.scrollRegistry = new Map();
    this.scrollKey = 'songs-page-all';
  }

  // Simulates Virtuoso's rangeChanged callback (from VirtualizedList.tsx:292-317)
  onRangeChanged(startIndex, endIndex) {
    const range = { startIndex, endIndex };

    if (this.restorationState === 'RESTORING') {
      const target = this.targetIndex;
      const isTargetReached =
        (range.startIndex <= target && range.endIndex >= target) ||
        Math.abs(range.startIndex - target) <= 25;

      if (isTargetReached) {
        this.restorationState = 'TRACKING';
      }
    }

    if (this.scrollKey && this.restorationState === 'TRACKING') {
      this.scrollRegistry.set(this.scrollKey, { index: range.startIndex });
    }
  }

  // Simulates user scrolling event (from VirtualizedList.tsx:143-156)
  handleScroll(scrollerElement) {
    if (this.restorationState === 'RESTORING') {
      return { scrollClassAdded: false }; // Guard blocks scroll tracking!
    }
    return { scrollClassAdded: true };
  }
}

console.log('=== Running Reproduction TEAM04-001 ===');

// Scenario: User was previously at song index 400 in a 1,000-song library.
// User navigates back, but a search filter is active (or tracks were removed), so only 60 songs exist!
const targetIndex = 400;
const newListLength = 60;

const list = new VirtualizedListRestorationModel(targetIndex, newListLength);
console.log('Initial state:', { targetIndex, listLength: newListLength, state: list.restorationState });

// Virtuoso renders the maximum possible range for 60 items (0 to 59)
list.onRangeChanged(0, 59);
console.log('After initial render (range 0-59):', { state: list.restorationState });

// User scrolls up and down through the list
list.onRangeChanged(10, 35);
list.onRangeChanged(25, 59);
list.onRangeChanged(0, 25);

console.log('After active user scrolling across available list:', { state: list.restorationState });
console.log('Scroll registry contents:', list.scrollRegistry);

// Assertions:
// 1. State machine is permanently trapped in 'RESTORING'
assert.strictEqual(
  list.restorationState,
  'RESTORING',
  'State machine should be trapped in RESTORING because 400 is unreachable'
);

// 2. Scroll registry was never updated despite multiple scroll events!
assert.strictEqual(
  list.scrollRegistry.size,
  0,
  'Scroll registry should be empty because tracking was permanently blocked'
);

// 3. User scroll events are blocked from updating active scroll classes
const scrollResult = list.handleScroll();
assert.strictEqual(
  scrollResult.scrollClassAdded,
  false,
  'Scroll class handling should be blocked by deadlocked RESTORING state'
);

console.log('Confirmed: State machine deadlocks in RESTORING when targetIndex > listLength.');
console.log('=== Reproduction TEAM04-001 Verified Successfully ===');
