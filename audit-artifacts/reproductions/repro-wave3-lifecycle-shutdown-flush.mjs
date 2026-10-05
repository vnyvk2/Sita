/**
 * WAVE 3 REPRODUCTION HARNESS: DEF-LFC-01
 * (Window Close Destroys Renderer Process Before Shutdown Coordinator Flushes State)
 *
 * Demonstrates:
 * In src/main/main.ts (lines 570-655):
 * 1. mainWindow has event listeners for 'moved', 'resized', 'maximize', etc.
 * 2. BUT it lacks a `mainWindow.on('close', (e) => { ... })` intercept handler!
 * 3. When the user clicks the window close button (X) or calls `mainWindow.close()`:
 *    - Electron's default behavior immediately tears down the BrowserWindow and destroys its webContents.
 *    - Once destroyed, `app.on('window-all-closed')` fires and calls `app.quit()`.
 *    - `app.quit()` fires `app.on('before-quit', handleBeforeQuit)`.
 *    - In `handleBeforeQuit`, `ShutdownCoordinator.shutdown(..., mainWindow, ...)` is called.
 *    - By this point, `mainWindow.isDestroyed()` and `mainWindow.webContents.isDestroyed()` are already TRUE!
 *    - Any attempt to request current playback position, flush React state, or save renderer stores fails!
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
    this.emit('message', { channel, args });
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
      // Electron default behavior: immediately destroys webContents and window
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

async function simulateNoraShutdownCoordinator(mainWindow) {
  console.log('[ShutdownCoordinator] Attempting to flush renderer playback state and store data...');
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents?.isDestroyed()) {
    console.error('[ShutdownCoordinator] FAILED: Renderer is already destroyed! Cannot request current playback position.');
    return { flushed: false, error: 'RENDERER_ALREADY_DESTROYED' };
  }
  
  mainWindow.webContents.send('app/requestPlaybackStateFlush');
  return { flushed: true, error: null };
}

async function testLifecycleCloseDefect() {
  console.log('=== TEST: DEF-LFC-01 (Window Close vs Shutdown Coordinator Invariant) ===');

  const app = new MockElectronApp();
  const mainWindow = new MockBrowserWindow();

  // Attach Nora's actual listeners from src/main/main.ts:
  // Note: NO mainWindow.on('close', ...) intercept exists in main.ts!

  app.on('window-all-closed', () => {
    console.log('[App] window-all-closed fired. Invoking app.quit()...');
    app.quit();
  });

  let shutdownPromise = null;
  app.on('before-quit', (e) => {
    console.log('[App] before-quit fired. Invoking handleBeforeQuit / ShutdownCoordinator...');
    shutdownPromise = simulateNoraShutdownCoordinator(mainWindow);
  });

  // User clicks close button (X) on Nora mainWindow
  console.log('[User Action] User clicks close button (X)...');
  mainWindow.close();

  // Trigger window-all-closed as in Electron
  app.emit('window-all-closed');

  const shutdownResult = await shutdownPromise;
  console.log('Shutdown flush result:', shutdownResult);

  assert.strictEqual(mainWindow.isDestroyed(), true, 'Window is destroyed before before-quit');
  assert.strictEqual(mainWindow.webContents.isDestroyed(), true, 'WebContents is destroyed before before-quit');
  assert.strictEqual(shutdownResult.flushed, false, 'State flush failed due to premature destruction');
  assert.strictEqual(shutdownResult.error, 'RENDERER_ALREADY_DESTROYED');

  console.log('\nSUCCESS: Proved DEF-LFC-01: mainWindow close destroys renderer before ShutdownCoordinator flushes state.');
}

testLifecycleCloseDefect().catch(err => {
  console.error(err);
  process.exit(1);
});
