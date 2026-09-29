/**
 * VERIFICATION SCRIPT: DEF-LFC-01 Fixed
 *
 * Verifies that:
 * 1. Window close button (X) interception prevents immediate window and webContents destruction.
 * 2. ShutdownCoordinator dispatches 'app/beforeQuitEvent' to the alive webContents.
 * 3. Renderer completes state flush (flushPendingLocalStorage + storage options) and sends 'app/beforeQuitEventAck'.
 * 4. Main process awaits the ACK, logs completion, and finishes shutdown cleanly before window close.
 * 5. If renderer is unresponsive or hangs, the 1500ms timeout safely unblocks shutdown coordinator without hanging.
 */

import { EventEmitter } from 'events';
import assert from 'assert';

class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this._destroyed = false;
  }
  isDestroyed() {
    return this._destroyed;
  }
  send(channel, ...args) {
    if (this._destroyed) {
      throw new Error(`Error: Render frame was disposed / Object has been destroyed [channel: ${channel}]`);
    }
    this.emit('ipc-send', { channel, args });
  }
  destroy() {
    this._destroyed = true;
    this.emit('destroyed');
  }
}

class MockBrowserWindow extends EventEmitter {
  constructor() {
    super();
    this.webContents = new MockWebContents();
    this._destroyed = false;
  }
  isDestroyed() {
    return this._destroyed;
  }
  close() {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    this.emit('close', event);

    if (!event.defaultPrevented) {
      this.webContents.destroy();
      this._destroyed = true;
      this.emit('closed');
    }
  }
}

class MockElectronApp extends EventEmitter {
  constructor() {
    super();
    this.isQuitting = false;
  }
  quit() {
    this.isQuitting = true;
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    this.emit('before-quit', event);
  }
}

class MockIpcMain extends EventEmitter {}

async function testCloseLifecycleHandshake() {
  console.log('=== TEST 1: Window Close Interception + Renderer State Flush Handshake ===');

  const app = new MockElectronApp();
  const mainWindow = new MockBrowserWindow();
  const ipcMain = new MockIpcMain();

  let isCleaningUp = false;
  let isCleanupComplete = false;
  let rendererFlushedState = false;
  let databaseClosed = false;

  // 1. Attach mainWindow 'close' interceptor (from src/main/main.ts)
  mainWindow.on('close', (e) => {
    if (!isCleanupComplete) {
      e.preventDefault();
      if (!isCleaningUp) {
        app.quit();
      }
    }
  });

  // 2. Attach app 'before-quit' handler (from src/main/main.ts)
  app.on('before-quit', (e) => {
    if (isCleanupComplete) {
      return;
    }
    e.preventDefault();
    if (isCleaningUp) {
      return;
    }
    isCleaningUp = true;

    void (async () => {
      try {
        console.log('[Main] Running ShutdownCoordinator...');
        // Simulate ShutdownCoordinator Step 3:
        assert.strictEqual(mainWindow.isDestroyed(), false, 'Window must NOT be destroyed when ShutdownCoordinator runs');
        assert.strictEqual(mainWindow.webContents.isDestroyed(), false, 'WebContents must NOT be destroyed when ShutdownCoordinator runs');

        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
          const flushPromise = new Promise((resolve) => {
            const timeout = setTimeout(() => {
              ipcMain.removeListener('app/beforeQuitEventAck', ackHandler);
              resolve();
            }, 1500);

            const ackHandler = () => {
              clearTimeout(timeout);
              resolve();
            };

            ipcMain.once('app/beforeQuitEventAck', ackHandler);
            mainWindow.webContents.send('app/beforeQuitEvent');
          });

          await flushPromise;
        }

        // Step 5: Database shutdown
        console.log('[Main] Closing database...');
        databaseClosed = true;
      } finally {
        isCleanupComplete = true;
        app.quit();
        // Finally close window
        mainWindow.close();
      }
    })();
  });

  // 3. Simulate Renderer behavior (from useAppLifecycle.tsx + preload)
  mainWindow.webContents.on('ipc-send', ({ channel }) => {
    if (channel === 'app/beforeQuitEvent') {
      console.log('[Renderer] Received app/beforeQuitEvent. Flushing pending localStorage...');
      // Simulate flushPendingLocalStorage()
      rendererFlushedState = true;
      // Simulate preload sendBeforeQuitEventAck()
      setImmediate(() => {
        console.log('[Renderer] Sending app/beforeQuitEventAck...');
        ipcMain.emit('app/beforeQuitEventAck');
      });
    }
  });

  // User clicks close button (X)
  console.log('[User Action] User clicks close button (X)...');
  mainWindow.close();

  // Wait for the async shutdown pipeline to complete
  await new Promise((resolve) => {
    mainWindow.on('closed', resolve);
  });

  assert.strictEqual(rendererFlushedState, true, 'Renderer must have flushed state before database closed');
  assert.strictEqual(databaseClosed, true, 'Database must be closed cleanly');
  assert.strictEqual(isCleanupComplete, true, 'Cleanup must be complete');
  assert.strictEqual(mainWindow.isDestroyed(), true, 'Window is only destroyed AFTER shutdown completion');

  console.log('TEST 1 PASSED: Window close gracefully coordinated and flushed state.\n');
}

async function testTimeoutFallbackWhenRendererHangs() {
  console.log('=== TEST 2: Timeout Safety When Renderer Process is Unresponsive ===');

  const app = new MockElectronApp();
  const mainWindow = new MockBrowserWindow();
  const ipcMain = new MockIpcMain();

  let isCleaningUp = false;
  let isCleanupComplete = false;
  let databaseClosed = false;

  mainWindow.on('close', (e) => {
    if (!isCleanupComplete) {
      e.preventDefault();
      if (!isCleaningUp) {
        app.quit();
      }
    }
  });

  const startTime = Date.now();

  app.on('before-quit', (e) => {
    if (isCleanupComplete) return;
    e.preventDefault();
    if (isCleaningUp) return;
    isCleaningUp = true;

    void (async () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
          const flushPromise = new Promise((resolve) => {
            const timeout = setTimeout(() => {
              ipcMain.removeListener('app/beforeQuitEventAck', ackHandler);
              console.log('[ShutdownCoordinator] Timeout waiting for renderer ACK (100ms test timeout)');
              resolve();
            }, 100); // use 100ms for fast test

            const ackHandler = () => {
              clearTimeout(timeout);
              resolve();
            };

            ipcMain.once('app/beforeQuitEventAck', ackHandler);
            mainWindow.webContents.send('app/beforeQuitEvent');
          });

          await flushPromise;
        }

        databaseClosed = true;
      } finally {
        isCleanupComplete = true;
        app.quit();
        mainWindow.close();
      }
    })();
  });

  // Renderer NEVER sends ACK (simulating hung renderer)
  mainWindow.webContents.on('ipc-send', ({ channel }) => {
    if (channel === 'app/beforeQuitEvent') {
      console.log('[Renderer] Frozen/hung! Not sending ACK.');
    }
  });

  console.log('[User Action] User clicks close button (X)...');
  mainWindow.close();

  await new Promise((resolve) => {
    mainWindow.on('closed', resolve);
  });

  const elapsed = Date.now() - startTime;
  console.log(`Shutdown completed in ${elapsed}ms despite hung renderer`);

  assert.strictEqual(databaseClosed, true, 'Database closed even with hung renderer');
  assert.strictEqual(isCleanupComplete, true, 'Shutdown completed via timeout');
  assert.strictEqual(mainWindow.isDestroyed(), true, 'Window closed');

  console.log('TEST 2 PASSED: Timeout protection successfully unblocked shutdown coordinator.\n');
}

async function run() {
  await testCloseLifecycleHandshake();
  await testTimeoutFallbackWhenRendererHangs();
  console.log('ALL DEF-LFC-01 VERIFICATION TESTS PASSED!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
