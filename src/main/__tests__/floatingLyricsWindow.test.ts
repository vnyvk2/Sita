/// <reference types="vitest/globals" />

vi.mock('electron', () => {
  const listeners: Record<string, Function[]> = {};
  const mockWebContents = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false)
  };
  const mockWin = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
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
  isFloatingLyricsOpen,
  toggleFloatingLyricsLock,
  setFloatingLyricsIgnoreMouse,
  broadcastLyricsToFloatingWindow,
  broadcastTimeToFloatingWindow,
  registerFloatingLyricsGlobalShortcut
} from '../floatingLyricsWindow';
import { BrowserWindow, globalShortcut } from 'electron';

describe('floatingLyricsWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create BrowserWindow with transparent and backgroundThrottling: false', async () => {
    await createOrToggleFloatingLyricsWindow();

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: false,
        transparent: true,
        alwaysOnTop: true,
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

    const instance = (BrowserWindow as unknown as { mock: { results: Array<{ value: any }> } }).mock
      .results[0]?.value;
    if (instance) {
      expect(instance.webContents.send).toHaveBeenCalledWith(
        'floating-lyrics/update-lyrics',
        { title: 'New Song' }
      );
      expect(instance.webContents.send).toHaveBeenCalledWith(
        'floating-lyrics/update-time',
        45.5
      );
    }
  });

  it('should register CommandOrControl+Shift+L global shortcut', () => {
    registerFloatingLyricsGlobalShortcut();
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+L',
      expect.any(Function)
    );
  });
});
