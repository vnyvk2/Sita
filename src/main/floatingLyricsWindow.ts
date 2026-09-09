import fs from 'fs';
import path from 'path';

import { app, BrowserWindow, globalShortcut, screen } from 'electron';

import { getCachedLyrics } from './core/getSongLyrics';
import logger from './logger';

let floatingLyricsWindow: BrowserWindow | null = null;
let isLocked = false;
let boundsSaveTimeout: NodeJS.Timeout | null = null;

const BOUNDS_FILE = path.join(app.getPath('userData'), 'floating_lyrics_bounds.json');

interface SavedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getSavedBounds(): SavedBounds | null {
  try {
    if (fs.existsSync(BOUNDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf-8'));
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        return data;
      }
    }
  } catch (err) {
    logger.warn('[FloatingLyrics] Failed to read saved bounds:', { err });
  }
  return null;
}

function saveBounds(bounds: SavedBounds): void {
  if (boundsSaveTimeout) clearTimeout(boundsSaveTimeout);
  boundsSaveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('[FloatingLyrics] Failed to save bounds:', { err });
    }
  }, 500);
}

function getPreloadPath(): string {
  const candidates = [
    path.resolve(import.meta.dirname, '../preload/floatingLyrics.cjs'),
    path.resolve(import.meta.dirname, '../../preload/floatingLyrics.cjs'),
    path.resolve(app.getAppPath(), 'out/preload/floatingLyrics.cjs')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function isBoundsVisibleOnAnyScreen(b: SavedBounds): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x, y, width, height } = display.bounds;
    return b.x >= x - 50 && b.x < x + width && b.y >= y - 50 && b.y < y + height;
  });
}

export function isFloatingLyricsOpen(): boolean {
  return floatingLyricsWindow !== null && !floatingLyricsWindow.isDestroyed();
}

export async function createOrToggleFloatingLyricsWindow(
  _mainWindowRef?: BrowserWindow
): Promise<void> {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
    if (floatingLyricsWindow.isVisible()) {
      floatingLyricsWindow.hide();
    } else {
      floatingLyricsWindow.show();
      floatingLyricsWindow.focus();
    }
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const defaultWidth = 650;
  const defaultHeight = 160;
  let initialX = Math.round(primaryDisplay.bounds.x + (primaryDisplay.bounds.width - defaultWidth) / 2);
  let initialY = Math.round(primaryDisplay.bounds.y + primaryDisplay.bounds.height - defaultHeight - 120);

  const saved = getSavedBounds();
  if (saved && isBoundsVisibleOnAnyScreen(saved)) {
    initialX = saved.x;
    initialY = saved.y;
  }

  floatingLyricsWindow = new BrowserWindow({
    x: initialX,
    y: initialY,
    width: saved?.width ?? defaultWidth,
    height: saved?.height ?? defaultHeight,
    minWidth: 320,
    minHeight: 100,
    title: 'Nora - Floating Lyrics',
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  floatingLyricsWindow.setAlwaysOnTop(true, 'screen-saver');

  // Track and persist bounds
  const updateBounds = () => {
    if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
      saveBounds(floatingLyricsWindow.getBounds());
    }
  };
  floatingLyricsWindow.on('moved', updateBounds);
  floatingLyricsWindow.on('resized', updateBounds);

  floatingLyricsWindow.on('closed', () => {
    floatingLyricsWindow = null;
    isLocked = false;
  });

  // Load URL or file
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await floatingLyricsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/floatingLyrics.html`);
  } else {
    const htmlCandidates = [
      path.join(import.meta.dirname, '../renderer/floatingLyrics.html'),
      path.join(import.meta.dirname, '../../renderer/floatingLyrics.html'),
      path.join(app.getAppPath(), 'out/renderer/floatingLyrics.html')
    ];
    const htmlPath = htmlCandidates.find((c) => fs.existsSync(c)) ?? htmlCandidates[0];
    await floatingLyricsWindow.loadFile(htmlPath);
  }

  floatingLyricsWindow.once('ready-to-show', () => {
    floatingLyricsWindow?.show();
    // Send cached lyrics immediately
    const lyrics = getCachedLyrics();
    if (lyrics) {
      broadcastLyricsToFloatingWindow(lyrics);
    }
  });
}

export function closeFloatingLyricsWindow(): void {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
    floatingLyricsWindow.close();
    floatingLyricsWindow = null;
  }
}

export function toggleFloatingLyricsLock(): boolean {
  if (!floatingLyricsWindow || floatingLyricsWindow.isDestroyed()) {
    return false;
  }
  isLocked = !isLocked;
  floatingLyricsWindow.setIgnoreMouseEvents(isLocked, { forward: true });
  floatingLyricsWindow.webContents.send('floating-lyrics/lock-changed', isLocked);
  return isLocked;
}

export function setFloatingLyricsIgnoreMouse(ignore: boolean, forward: boolean = true): void {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
    floatingLyricsWindow.setIgnoreMouseEvents(ignore, { forward });
  }
}

export function broadcastLyricsToFloatingWindow(lyrics: unknown): void {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
    floatingLyricsWindow.webContents.send('floating-lyrics/update-lyrics', lyrics);
  }
}

export function broadcastTimeToFloatingWindow(time: number): void {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
    floatingLyricsWindow.webContents.send('floating-lyrics/update-time', time);
  }
}

export function broadcastPlayStateToFloatingWindow(isPlaying: boolean): void {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) {
    floatingLyricsWindow.webContents.send('floating-lyrics/update-play-state', isPlaying);
  }
}

export function registerFloatingLyricsGlobalShortcut(mainWindowRef?: BrowserWindow): void {
  try {
    const shortcutKey = 'CommandOrControl+Shift+L';
    const registered = globalShortcut.register(shortcutKey, () => {
      createOrToggleFloatingLyricsWindow(mainWindowRef);
    });
    if (!registered) {
      logger.warn(`[FloatingLyrics] Shortcut ${shortcutKey} registration failed (may already be bound)`);
    } else {
      logger.info(`[FloatingLyrics] Global shortcut ${shortcutKey} registered successfully`);
    }
  } catch (err) {
    logger.warn('[FloatingLyrics] Error registering global shortcut:', { err });
  }
}
