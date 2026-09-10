/// <reference types="vitest/globals" />

vi.mock('electron', () => {
  const listeners: Record<string, Function[]> = {};
  let visible = false;
  const mockWebContents = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false)
  };
  const mockWin = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    show: vi.fn(() => {
      visible = true;
    }),
    hide: vi.fn(() => {
      visible = false;
    }),
    focus: vi.fn(),
    close: vi.fn(() => {
      visible = false;
      if (listeners['closed']) {
        listeners['closed'].forEach((cb) => cb());
      }
    }),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 200, width: 650, height: 160 })),
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, cb: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    once: vi.fn((_event: string, cb: Function) => {
      cb();
    }),
    webContents: mockWebContents
  };

  return {
    app: {
      getPath: vi.fn(() => 'C:\\fake\\userData'),
      getAppPath: vi.fn(() => 'C:\\fake\\appPath'),
      isPackaged: false
    },
    BrowserWindow: vi.fn(function () {
      return mockWin;
    }),
    globalShortcut: {
      register: vi.fn((_key: string, _cb: Function) => true),
      unregister: vi.fn()
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 }
      })),
      getAllDisplays: vi.fn(() => [
        { bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
      ])
    }
  };
});

vi.mock('../core/getSongLyrics', () => ({
  getCachedLyrics: vi.fn(() => ({
    title: 'Test Track',
    lyrics: { isSynced: true, parsedLyrics: [] }
  }))
}));

vi.mock('../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import {
  createOrToggleFloatingLyricsWindow,
  closeFloatingLyricsWindow,
  isFloatingLyricsOpen,
  toggleFloatingLyricsLock,
  setFloatingLyricsIgnoreMouse,
  broadcastLyricsToFloatingWindow,
  broadcastTimeToFloatingWindow,
  broadcastPlayStateToFloatingWindow,
  getFloatingLyricsPlayState,
  registerFloatingLyricsGlobalShortcut
} from '../floatingLyricsWindow';
import { BrowserWindow, globalShortcut } from 'electron';

describe('floatingLyricsWindow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    closeFloatingLyricsWindow();
    await createOrToggleFloatingLyricsWindow();
  });

  it('should create BrowserWindow with transparent, skipTaskbar: true, and backgroundThrottling: false', () => {
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: expect.objectContaining({
          backgroundThrottling: false
        })
      })
    );
    expect(isFloatingLyricsOpen()).toBe(true);
  });

  it('should toggle lock and setIgnoreMouseEvents', () => {
    const lockedFirst = toggleFloatingLyricsLock();
    expect(lockedFirst).toBe(true);

    setFloatingLyricsIgnoreMouse(true, true);

    const lockedSecond = toggleFloatingLyricsLock();
    expect(lockedSecond).toBe(false);
  });

  it('should broadcast lyrics and time to webContents', () => {
    broadcastLyricsToFloatingWindow({ title: 'New Song' });
    broadcastTimeToFloatingWindow(45.5);
    broadcastLyricsToFloatingWindow(null);

    const instance = (BrowserWindow as unknown as { mock: { results: Array<{ value: any }> } }).mock
      .results[0]?.value;
    expect(instance).toBeDefined();
    expect(instance.webContents.send).toHaveBeenCalledWith(
      'floating-lyrics/update-lyrics',
      { title: 'New Song' }
    );
    expect(instance.webContents.send).toHaveBeenCalledWith(
      'floating-lyrics/update-time',
      45.5
    );
    expect(instance.webContents.send).toHaveBeenCalledWith(
      'floating-lyrics/update-lyrics',
      null
    );
  });

  it('should synchronize playback state and track getFloatingLyricsPlayState()', () => {
    expect(getFloatingLyricsPlayState()).toBe(false);

    broadcastPlayStateToFloatingWindow(true);
    expect(getFloatingLyricsPlayState()).toBe(true);

    const instance = (BrowserWindow as unknown as { mock: { results: Array<{ value: any }> } }).mock
      .results[0]?.value;
    expect(instance).toBeDefined();
    expect(instance.webContents.send).toHaveBeenCalledWith(
      'floating-lyrics/update-play-state',
      true
    );

    broadcastPlayStateToFloatingWindow(false);
    expect(getFloatingLyricsPlayState()).toBe(false);
    expect(instance.webContents.send).toHaveBeenCalledWith(
      'floating-lyrics/update-play-state',
      false
    );
  });

  it('should register CommandOrControl+Shift+L and CommandOrControl+Shift+U global shortcuts', () => {
    registerFloatingLyricsGlobalShortcut();
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+L',
      expect.any(Function)
    );
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+U',
      expect.any(Function)
    );
  });
});
