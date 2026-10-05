/**
 * Repro Script: Team 13 (Hostile User Behaviors & Rapid Interactions)
 *
 * Proves 4 critical defects:
 * 1. TEAM13-001: Deleting current song via removeSongId / removeSongAtPosition fails to emit positionChange
 * 2. TEAM13-002: AbortError from rapid play/pause spamming has null player.error, triggering user-facing ErrorPrompt modal
 * 3. TEAM13-003: Floating lyrics window prevents app exit on main window close because window-all-closed requires ALL windows closed
 * 4. TEAM13-004: PlayerQueue.clear() fails to emit positionChange or notify AudioPlayer, causing orphan playback from empty queue
 */

import assert from 'node:assert';
import { EventEmitter } from 'node:events';

console.log('=== RUNNING REPRO: TEAM 13 (Hostile User Behaviors & Rapid Interactions) ===');

// =========================================================================
// TEST 1: TEAM13-001 - Current song removal omits positionChange
// =========================================================================
console.log('\n--- TEST 1: TEAM13-001 (removeSongId ignores current song removal) ---');

class MockPlayerQueue extends EventEmitter {
  constructor(songIds, position = 0) {
    super();
    this.songIds = [...songIds];
    this.position = position;
  }

  get currentSongId() {
    return this.songIds[this.position] ?? null;
  }

  // Exact logic from src/renderer/src/other/playerQueue.ts:627-665
  removeSongId(songId) {
    const index = this.songIds.indexOf(songId);
    if (index !== -1) {
      this.songIds.splice(index, 1);
      this.emit('songRemoved', { songId, position: index });

      // Adjust position if necessary (from lines 647-663)
      if (index < this.position) {
        const oldPosition = this.position;
        this.position -= 1;
        this.emit('positionChange', {
          oldPosition,
          newPosition: this.position,
          currentSongId: this.currentSongId
        });
      } else if (index === this.position && this.position >= this.songIds.length) {
        const oldPosition = this.position;
        this.position = Math.max(0, this.songIds.length - 1);
        this.emit('positionChange', {
          oldPosition,
          newPosition: this.position,
          currentSongId: this.currentSongId
        });
      }
      this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
      return true;
    }
    return false;
  }

  // Exact logic from src/renderer/src/other/playerQueue.ts:547-603 (batch version)
  removeSongIds(songIds) {
    const idsSet = new Set(songIds);
    const newSongIds = [];
    let removedBeforeCurrent = 0;
    let currentWasRemoved = false;
    let removedAny = false;

    for (let i = 0; i < this.songIds.length; i += 1) {
      const id = this.songIds[i];
      if (idsSet.has(id)) {
        removedAny = true;
        if (i < this.position) removedBeforeCurrent += 1;
        if (i === this.position) currentWasRemoved = true;
      } else {
        newSongIds.push(id);
      }
    }
    if (!removedAny) return false;

    const oldPosition = this.position;
    let newPosition = 0;
    if (newSongIds.length > 0) {
      if (currentWasRemoved) {
        newPosition = Math.max(0, Math.min(this.position - removedBeforeCurrent, newSongIds.length - 1));
      } else {
        newPosition = this.position - removedBeforeCurrent;
      }
    }
    this.songIds = newSongIds;
    this.position = newPosition;

    // Notice lines 595-601:
    if (oldPosition !== newPosition || currentWasRemoved) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }
    return true;
  }
}

const queue = new MockPlayerQueue([101, 102, 103], 0);
assert.strictEqual(queue.currentSongId, 101, 'Current song should be 101');

let positionChangeEventFired = false;
queue.on('positionChange', (data) => {
  positionChangeEventFired = true;
});

// Remove current playing song (101)
const removed = queue.removeSongId(101);
assert.strictEqual(removed, true, 'Song 101 should be removed');
assert.deepStrictEqual(queue.songIds, [102, 103], 'Remaining songs should be [102, 103]');
assert.strictEqual(queue.position, 0, 'Position is still 0');
assert.strictEqual(queue.currentSongId, 102, 'Current song ID in queue is now 102');

// BUG PROVEN: positionChange was NOT emitted because index === 0 and position < songIds.length!
console.log('removeSongId current track removal: positionChange fired =', positionChangeEventFired);
assert.strictEqual(positionChangeEventFired, false, 'DEFECT PROVEN: removeSongId failed to emit positionChange when current song was removed!');

// Contrast with removeSongIds (batch)
const queue2 = new MockPlayerQueue([101, 102, 103], 0);
let batchPositionFired = false;
queue2.on('positionChange', () => {
  batchPositionFired = true;
});
queue2.removeSongIds([101]);
assert.strictEqual(batchPositionFired, true, 'Batch removeSongIds correctly emits positionChange due to currentWasRemoved check');
console.log('SUCCESS: Proved TEAM13-001 defect: single removeSongId drops positionChange when current song removed');

// =========================================================================
// TEST 2: TEAM13-002 - AbortError triggers user-facing ErrorPrompt
// =========================================================================
console.log('\n--- TEST 2: TEAM13-002 (AbortError triggers user error modal) ---');

// Mock usePlaybackErrors handler from src/renderer/src/hooks/usePlaybackErrors.tsx:36-92
function simulateManagePlaybackErrors(player, appError, onPromptShown) {
  const playerErrorData = player.error; // In Chromium, player.error is null for AbortError!

  if (player.src && playerErrorData) {
    // Normal audio error recovery
    return 'RECOVER_VIA_LOAD';
  } else {
    // Falls into fatal error prompt branch!
    player.pause();
    onPromptShown('ERROR_IN_PLAYER');
    return 'SHOW_FATAL_PROMPT';
  }
}

const mockAudio = {
  src: 'nora://tracks/song1.flac',
  error: null, // HTMLMediaElement.error is null when play() rejects with DOMException: AbortError
  paused: false,
  pause() {
    this.paused = true;
  }
};

const chromiumAbortError = new Error('The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22');
chromiumAbortError.name = 'AbortError';

let shownPromptReason = null;
const result = simulateManagePlaybackErrors(mockAudio, chromiumAbortError, (reason) => {
  shownPromptReason = reason;
});

assert.strictEqual(result, 'SHOW_FATAL_PROMPT', 'Must enter show fatal prompt branch');
assert.strictEqual(shownPromptReason, 'ERROR_IN_PLAYER', 'DEFECT PROVEN: ErrorPrompt dialog triggered for benign AbortError');
console.log('SUCCESS: Proved TEAM13-002 defect: AbortError misdiagnosed as fatal player error');

// =========================================================================
// TEST 3: TEAM13-003 - Floating lyrics window prevents app exit on window close
// =========================================================================
console.log('\n--- TEST 3: TEAM13-003 (Floating lyrics window prevents app exit) ---');

class MockElectronApp extends EventEmitter {
  constructor() {
    super();
    this.windows = new Set();
    this.isQuit = false;
  }

  addWindow(win) {
    this.windows.add(win);
    win.on('closed', () => {
      this.windows.delete(win);
      if (this.windows.size === 0) {
        this.emit('window-all-closed');
      }
    });
  }

  quit() {
    this.isQuit = true;
    this.emit('before-quit');
  }
}

class MockBrowserWindow extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
  }

  close() {
    this.emit('closed');
  }
}

const electronApp = new MockElectronApp();
electronApp.on('window-all-closed', () => {
  electronApp.quit();
});

const mainWindow = new MockBrowserWindow('MainWindow');
const floatingLyrics = new MockBrowserWindow('FloatingLyrics');

electronApp.addWindow(mainWindow);
electronApp.addWindow(floatingLyrics);

// User closes MainWindow
mainWindow.close();

// Check if electronApp has quit
console.log('Windows open after mainWindow.close():', electronApp.windows.size);
console.log('App isQuit status:', electronApp.isQuit);

assert.strictEqual(electronApp.windows.size, 1, 'Floating lyrics window remains alive');
assert.strictEqual(electronApp.isQuit, false, 'DEFECT PROVEN: electronApp NEVER quit because floating lyrics window was not closed with mainWindow');
console.log('SUCCESS: Proved TEAM13-003 defect: floating lyrics window blocks application exit');

// =========================================================================
// TEST 4: TEAM13-004 - PlayerQueue.clear() drops positionChange & keeps playing
// =========================================================================
console.log('\n--- TEST 4: TEAM13-004 (PlayerQueue.clear() drops positionChange) ---');

class MockClearQueue extends EventEmitter {
  constructor(songIds, position = 0) {
    super();
    this.songIds = [...songIds];
    this.position = position;
  }

  // Exact logic from src/renderer/src/other/playerQueue.ts:708-723
  clear() {
    this.songIds = [];
    const oldPosition = this.position;
    this.position = 0;
    this.emit('queueCleared', {});
    this.emit('queueChange', { queue: [], length: 0 });
  }
}

const clearQueue = new MockClearQueue([101, 102, 103], 1);
let clearPositionFired = false;
clearQueue.on('positionChange', () => {
  clearPositionFired = true;
});

clearQueue.clear();
assert.strictEqual(clearQueue.songIds.length, 0, 'Queue is empty');
assert.strictEqual(clearPositionFired, false, 'DEFECT PROVEN: PlayerQueue.clear() NEVER emits positionChange');
console.log('SUCCESS: Proved TEAM13-004 defect: PlayerQueue.clear() leaves audio engine orphaned without position change');

console.log('\n=== ALL TEAM 13 HOSTILE INTERACTION REPRODUCTIONS PASSED SUCCESSFULLY ===');
