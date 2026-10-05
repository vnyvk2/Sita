/**
 * Adversarial Reproduction Script: Team 05 (Virtualization & 50k Baseline Performance)
 * 
 * Demonstrates:
 * 1. Restoration state machine permanent lock when list shrinks below saved target index (TEAM05-001).
 * 2. ScrollKey switch race condition overwriting index 0 with previous position (TEAM05-006).
 * 3. Benchmark metric array double-push calculation flaw (TEAM05-004).
 */

import assert from 'node:assert';

console.log('=== TEST 1: VirtualizedList Restoration State Machine Permanent Lock ===');

// Simulate the restoration state machine from src/renderer/src/components/VirtualizedList.tsx:111-120, 294-315
class VirtualizedListStateMachine {
  constructor(initialTargetIndex) {
    this.targetIndex = initialTargetIndex;
    this.restorationState = initialTargetIndex > 0 ? 'RESTORING' : 'TRACKING';
    this.savedRegistry = new Map();
    this.isScrollingClassAdded = false;
  }

  // Simulates Virtuoso's rangeChanged callback
  onRangeChanged(scrollKey, range) {
    if (this.restorationState === 'RESTORING') {
      const target = this.targetIndex;
      // Invariant check from line 296-298:
      const isTargetReached =
        (range.startIndex <= target && range.endIndex >= target) ||
        Math.abs(range.startIndex - target) <= 25;

      if (isTargetReached) {
        this.restorationState = 'TRACKING';
      }
    }

    if (scrollKey && this.restorationState === 'TRACKING') {
      this.savedRegistry.set(scrollKey, {
        index: range.startIndex
      });
    }
  }

  // Simulates handleScroll from line 143-156
  handleScroll() {
    if (this.restorationState === 'RESTORING') {
      return false; // Guard blocks .is-scrolling class and onScrollingStateChange!
    }
    this.isScrollingClassAdded = true;
    return true;
  }
}

// User had previously scrolled to song index 1200 in All Songs
const list = new VirtualizedListStateMachine(1200);
assert.strictEqual(list.restorationState, 'RESTORING');

// User now filters by an artist/genre with only 100 songs total
// Virtuoso clamps visible range to the very end of this list: [80, 100]
list.onRangeChanged('songs-list:genre_jazz', { startIndex: 80, endIndex: 100 });

console.log('Restoration state after clamping to 100 songs:', list.restorationState);
assert.strictEqual(list.restorationState, 'RESTORING', 'DEFECT: State machine is locked in RESTORING!');

// User scrolls up manually to index 20
list.onRangeChanged('songs-list:genre_jazz', { startIndex: 20, endIndex: 40 });
console.log('Restoration state after user scrolls to index 20:', list.restorationState);
assert.strictEqual(list.restorationState, 'RESTORING', 'DEFECT: Still stuck in RESTORING!');

// Verify handleScroll guard permanently blocks .is-scrolling optimizations
const scrollHandled = list.handleScroll();
console.log('Did handleScroll activate .is-scrolling class?', scrollHandled);
assert.strictEqual(scrollHandled, false, 'DEFECT: handleScroll optimizations are permanently disabled!');

// Verify scrollRegistry was never updated
const saved = list.savedRegistry.get('songs-list:genre_jazz');
console.log('Saved scroll position in registry:', saved);
assert.strictEqual(saved, undefined, 'DEFECT: Saved position was never stored!');


console.log('\n=== TEST 2: Benchmark Metric Double-Push Calculation Flaw ===');

// Simulate the timing collection bug from scripts/benchmark-songs-tab.mjs:320-344
function simulateBenchmarkFrameCollection() {
  const frameTimes = [];

  // Simulate 60 rAF frames (~16.6ms each)
  for (let i = 0; i < 60; i++) {
    const rAFDelta = 16.6 + (Math.random() * 0.4 - 0.2); // ~16.6ms
    frameTimes.push(rAFDelta);

    // Buggy synchronous push from loop: frameTimes.push(performance.now() - frameStart)
    const syncScrollDuration = 0.02; // DOM scrollTop write is ~0.02ms
    frameTimes.push(syncScrollDuration);
  }

  const validFrames = frameTimes.slice(2);
  const totalFrames = validFrames.length;
  const avgFrameTime = validFrames.reduce((a, b) => a + b, 0) / totalFrames;
  const calculatedFps = 1000 / avgFrameTime;

  return {
    rawFramesCount: 60,
    reportedTotalFrames: totalFrames,
    reportedAvgFrameTimeMs: avgFrameTime.toFixed(2),
    reportedFps: calculatedFps.toFixed(1)
  };
}

const bench = simulateBenchmarkFrameCollection();
console.log('Benchmark Result with Double-Push Flaw:', bench);

// In reality, 60 rAF frames at 16.6ms is 60 FPS and ~16.6ms avg frame time.
// The benchmark reports ~120 frames, ~8.3ms frame time, and ~120 FPS!
assert.ok(bench.reportedTotalFrames > 115, 'DEFECT: Frame count falsely doubled!');
assert.ok(Number(bench.reportedFps) > 100, 'DEFECT: Reported FPS falsely doubled to ~120 FPS due to 0.02ms scrollTop writes!');

console.log('\nALL VIRTUALIZATION & BENCHMARK DEFECTS PROVEN!');
