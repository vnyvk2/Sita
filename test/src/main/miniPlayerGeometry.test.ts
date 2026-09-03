import {
  COMPACT_LYRICS_EXTENSION_HEIGHT,
  COMPACT_MINI_PLAYER_HEIGHT,
  COMPACT_MINI_PLAYER_MIN_WIDTH,
  MINI_PLAYER_DEFAULT_SIZE_X,
  MINI_PLAYER_DEFAULT_SIZE_Y,
  MINI_PLAYER_MIN_SIZE_X,
  MINI_PLAYER_MIN_SIZE_Y
} from '@common/miniPlayerConstants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Track calls and mock state
let persistedUserSettings: Record<string, unknown> = {};
const mockSaveUserSettings = vi.fn((settings: Record<string, unknown>) => {
  persistedUserSettings = { ...persistedUserSettings, ...settings };
  return Promise.resolve(persistedUserSettings);
});

const mockGetUserSettings = vi.fn(async () => ({
  mainWindowHeight: 720,
  mainWindowWidth: 1280,
  miniPlayerHeight: MINI_PLAYER_DEFAULT_SIZE_Y,
  miniPlayerWidth: MINI_PLAYER_DEFAULT_SIZE_X,
  miniPlayerMode: 'standard',
  mainWindowX: 100,
  mainWindowY: 100,
  miniPlayerX: 500,
  miniPlayerY: 500,
  isMiniPlayerAlwaysOnTop: false,
  isMiniPlayerTaskbarHidden: false,
  ...persistedUserSettings
}));

// Mock main module dependencies
vi.mock('@main/db/queries/settings', () => ({
  getUserSettings: () => mockGetUserSettings(),
  saveUserSettings: (s: Record<string, unknown>) => mockSaveUserSettings(s)
}));

vi.mock('@main/db/queries/songs', () => ({
  getSongById: vi.fn()
}));

vi.mock('@main/fs/controlAbortControllers', () => ({
  closeAllAbortControllers: vi.fn(),
  saveAbortController: vi.fn()
}));

vi.mock('@main/ipc', () => ({
  initializeIPC: vi.fn()
}));

vi.mock('@main/library/LibraryLifecycleController', () => ({
  default: {}
}));

vi.mock('@main/lifecycle/ShutdownCoordinator', () => ({
  default: {}
}));

vi.mock('@main/lifecycle/ShutdownLogger', () => ({
  default: {
    logBootMilestone: vi.fn()
  }
}));

vi.mock('@main/core/manageTaskbarPlaybackButtonControls', () => ({
  default: vi.fn()
}));

vi.mock('@main/db/db', () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: { select: () => unknown }) => Promise<unknown>) =>
      cb({
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([])
      })
    )
  } as unknown as typeof import('@main/db/db').db,
  isDatabaseStubbed: false,
  closeDatabaseInstance: vi.fn()
}));

vi.mock('@main/updateSong/updateSongId3Tags', () => ({
  restorePersistedPendingWrites: vi.fn().mockResolvedValue(undefined)
}));

describe('Mini Player Geometry Engine & Real main.ts Implementation Tests', () => {
  let mainModule: typeof import('../../../src/main/main');
  let currentBounds = { x: 500, y: 500, width: 320, height: 240 };
  let moveEventHandler: (() => void) | null = null;
  let resizeEventHandler: (() => void) | null = null;
  const eventCallSequence: string[] = [];

  const mockWindow = {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    unmaximize: vi.fn(() => {
      mockWindow.isMaximized.mockReturnValue(false);
      eventCallSequence.push('unmaximize');
    }),
    isFullScreen: vi.fn(() => false),
    fullScreen: false,
    getPosition: vi.fn(() => [currentBounds.x, currentBounds.y]),
    getSize: vi.fn(() => [currentBounds.width, currentBounds.height]),
    getBounds: vi.fn(() => ({ ...currentBounds })),
    setPosition: vi.fn((x: number, y: number) => {
      eventCallSequence.push(`setPosition:${x},${y}`);
      currentBounds.x = x;
      currentBounds.y = y;
      moveEventHandler?.();
    }),
    setSize: vi.fn((width: number, height: number) => {
      eventCallSequence.push(`setSize:${width},${height}`);
      currentBounds.width = width;
      currentBounds.height = height;
      resizeEventHandler?.();
    }),
    setBounds: vi.fn((bounds: { x: number; y: number; width: number; height: number }) => {
      eventCallSequence.push(`setBounds:${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
      currentBounds = { ...bounds };
      moveEventHandler?.();
      resizeEventHandler?.();
    }),
    setMinimumSize: vi.fn((w: number, h: number) => {
      eventCallSequence.push(`setMinimumSize:${w},${h}`);
    }),
    setMaximumSize: vi.fn((w: number, h: number) => {
      eventCallSequence.push(`setMaximumSize:${w},${h}`);
      // Simulate OS immediate constraint clamping when max size is reduced below current size
      if (currentBounds.height > h) {
        eventCallSequence.push(`osConstraintSnap:${currentBounds.x},${currentBounds.y - 20}`);
        // OS emits move/resize event during snap
        moveEventHandler?.();
      }
    }),
    setMaximizable: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setFullScreen: vi.fn(),
    setAspectRatio: vi.fn(),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
      session: {
        clearStorageData: vi.fn()
      }
    },
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'moved') moveEventHandler = handler;
      if (event === 'resized') resizeEventHandler = handler;
    })
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    eventCallSequence.length = 0;
    persistedUserSettings = {
      miniPlayerX: 500,
      miniPlayerY: 500,
      miniPlayerWidth: MINI_PLAYER_DEFAULT_SIZE_X,
      miniPlayerHeight: MINI_PLAYER_DEFAULT_SIZE_Y,
      miniPlayerMode: 'standard'
    };
    currentBounds = {
      x: 500,
      y: 500,
      width: MINI_PLAYER_DEFAULT_SIZE_X,
      height: MINI_PLAYER_DEFAULT_SIZE_Y
    };

    mainModule = await import('../../../src/main/main');
    // Attach mocked window
    mainModule.setMainWindowForTests(mockWindow);
    await mainModule.changePlayerType('normal');
    mockWindow.isMaximized.mockReturnValue(false);
  });

  describe('F7: Dynamic Minimum Bounds Validation and Rejection', () => {
    it('rejects NaN, Infinity, negative, and zero bounds without mutating constraints', () => {
      mockWindow.setMinimumSize.mockClear();

      mainModule.setMiniPlayerMinimumBounds(NaN, 100);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();

      mainModule.setMiniPlayerMinimumBounds(250, NaN);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();

      mainModule.setMiniPlayerMinimumBounds(Infinity, 100);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();

      mainModule.setMiniPlayerMinimumBounds(-100, 80);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();

      mainModule.setMiniPlayerMinimumBounds(250, 0);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();
    });

    it('rejects bounds smaller than the canonical compact baseline', () => {
      mockWindow.setMinimumSize.mockClear();

      // Below COMPACT_MINI_PLAYER_MIN_WIDTH (200)
      mainModule.setMiniPlayerMinimumBounds(150, COMPACT_MINI_PLAYER_HEIGHT);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();

      // Below COMPACT_MINI_PLAYER_HEIGHT (64)
      mainModule.setMiniPlayerMinimumBounds(COMPACT_MINI_PLAYER_MIN_WIDTH, 50);
      expect(mockWindow.setMinimumSize).not.toHaveBeenCalled();
    });

    it('accepts valid dynamic bounds meeting canonical constraints', async () => {
      await mainModule.changePlayerType('mini');
      mockWindow.setMinimumSize.mockClear();

      mainModule.setMiniPlayerMinimumBounds(300, 150);
      // Valid bounds update native minimum constraints
      expect(mockWindow.setMinimumSize).toHaveBeenCalled();
    });
  });

  describe('F3: Mode Transition Geometry Sequencing & Persistence Invariant', () => {
    it('preserves the persistence invariant during standard -> compact transition under OS constraint snaps', async () => {
      // Enter mini player mode first
      await mainModule.changePlayerType('mini');
      mockSaveUserSettings.mockClear();

      // Switch to compact mode
      await mainModule.setMiniPlayerMode('compact');

      // The final persisted miniPlayerMode must be compact
      expect(persistedUserSettings.miniPlayerMode).toBe('compact');
      // The persisted position must NOT be corrupted by OS constraint snaps
      expect(persistedUserSettings.miniPlayerX).toBe(500);
      expect(persistedUserSettings.miniPlayerY).toBe(500);
      // Window bounds must settle at compact dimensions
      expect(currentBounds.height).toBe(COMPACT_MINI_PLAYER_HEIGHT);
      expect(currentBounds.width).toBe(
        Math.max(MINI_PLAYER_DEFAULT_SIZE_X, COMPACT_MINI_PLAYER_MIN_WIDTH)
      );
    });

    it('handles rapid back-to-back mode transitions without corrupting geometry or swallowing subsequent user movement', async () => {
      await mainModule.changePlayerType('mini');
      mockSaveUserSettings.mockClear();

      // Rapidly toggle: standard -> compact -> standard -> compact
      const p1 = mainModule.setMiniPlayerMode('compact');
      const p2 = mainModule.setMiniPlayerMode('standard');
      const p3 = mainModule.setMiniPlayerMode('compact');

      await Promise.all([p1, p2, p3]);

      // Verify settled state
      expect(persistedUserSettings.miniPlayerMode).toBe('compact');
      expect(currentBounds.height).toBe(COMPACT_MINI_PLAYER_HEIGHT);

      // Now simulate a legitimate user movement after transitions have settled
      currentBounds.x = 620;
      currentBounds.y = 410;
      moveEventHandler?.();

      // Verify legitimate user drag was captured and persisted
      expect(persistedUserSettings.miniPlayerX).toBe(620);
      expect(persistedUserSettings.miniPlayerY).toBe(410);
    });
  });

  describe('F3 & F6: Spatial Lyrics Extension Geometry', () => {
    it('uses canonical COMPACT_LYRICS_EXTENSION_HEIGHT and correctly expands and collapses', async () => {
      await mainModule.changePlayerType('mini');
      await mainModule.setMiniPlayerMode('compact');

      // Expand lyrics
      const expandResult = mainModule.expandMiniPlayer(true, 0, COMPACT_LYRICS_EXTENSION_HEIGHT);
      expect(expandResult.isExpanded).toBe(true);
      expect(expandResult.height).toBe(
        COMPACT_MINI_PLAYER_HEIGHT + COMPACT_LYRICS_EXTENSION_HEIGHT
      );

      // Collapse lyrics
      const collapseResult = mainModule.expandMiniPlayer(false);
      expect(collapseResult.isExpanded).toBe(false);
      expect(collapseResult.height).toBe(COMPACT_MINI_PLAYER_HEIGHT);
    });
  });

  describe('Mini Player Maximized State & Upper Bound Clamping Safety', () => {
    it('unmaximizes the window and applies smart bottom-right default bounds on first launch / reset', async () => {
      // Simulate app was maximized in normal mode
      mockWindow.isMaximized.mockReturnValue(true);
      persistedUserSettings = {
        miniPlayerX: null,
        miniPlayerY: null,
        miniPlayerWidth: null,
        miniPlayerHeight: null
      };

      await mainModule.changePlayerType('mini');

      // Must unmaximize window
      expect(mockWindow.unmaximize).toHaveBeenCalled();
      expect(eventCallSequence).toContain('unmaximize');

      // Must set bounds to canonical default mini player dimensions clamped to max limits
      expect(currentBounds.width).toBe(MINI_PLAYER_DEFAULT_SIZE_X);
      expect(currentBounds.height).toBe(MINI_PLAYER_DEFAULT_SIZE_Y);
      // Position must be anchored to bottom-right of screen (e.g. not 0, 0)
      expect(currentBounds.x).toBeGreaterThan(0);
      expect(currentBounds.y).toBeGreaterThan(0);
    });

    it('strictly clamps corrupted / huge persisted dimensions to canonical maximums', async () => {
      // Corrupted huge dimensions in DB (e.g. from screen resolution leak)
      persistedUserSettings = {
        miniPlayerX: 100,
        miniPlayerY: 100,
        miniPlayerWidth: 1920,
        miniPlayerHeight: 1080,
        miniPlayerMode: 'standard'
      };

      await mainModule.changePlayerType('mini');

      // Clamped to MINI_PLAYER_MAX_SIZE_X (540) and MINI_PLAYER_MAX_SIZE_Y (405)
      expect(currentBounds.width).toBeLessThanOrEqual(540);
      expect(currentBounds.height).toBeLessThanOrEqual(405);
    });

    it('ignores move and resize events when window is maximized to prevent settings corruption', async () => {
      await mainModule.changePlayerType('mini');
      mockSaveUserSettings.mockClear();

      // Window gets maximized by OS
      mockWindow.isMaximized.mockReturnValue(true);
      currentBounds.x = 0;
      currentBounds.y = 0;
      currentBounds.width = 1920;
      currentBounds.height = 1080;

      moveEventHandler?.();
      resizeEventHandler?.();

      // Settings must NOT be updated with maximized bounds
      expect(mockSaveUserSettings).not.toHaveBeenCalled();
      expect(persistedUserSettings.miniPlayerWidth).not.toBe(1920);
      expect(persistedUserSettings.miniPlayerHeight).not.toBe(1080);
    });
  });

  describe('F8: Mini Player Taskbar Visibility Lifecycle & Persistence', () => {
    it('sets skipTaskbar to true when isMiniPlayerTaskbarHidden is enabled in mini mode', async () => {
      persistedUserSettings = { isMiniPlayerTaskbarHidden: true };
      await mainModule.changePlayerType('mini');
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(true);
    });

    it('sets skipTaskbar to false when isMiniPlayerTaskbarHidden is disabled in mini mode', async () => {
      persistedUserSettings = { isMiniPlayerTaskbarHidden: false };
      await mainModule.changePlayerType('mini');
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
    });

    it('restores taskbar visibility (skipTaskbar false) when returning to normal player mode', async () => {
      persistedUserSettings = { isMiniPlayerTaskbarHidden: true };
      await mainModule.changePlayerType('mini');
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(true);

      mockWindow.setSkipTaskbar.mockClear();
      await mainModule.changePlayerType('normal');
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
    });

    it('toggles taskbar visibility dynamically and persists state', async () => {
      mockSaveUserSettings.mockClear();
      mockWindow.setSkipTaskbar.mockClear();

      await mainModule.changePlayerType('mini');
      await mainModule.toggleMiniPlayerTaskbarHidden(true);

      expect(mockSaveUserSettings).toHaveBeenCalledWith({ isMiniPlayerTaskbarHidden: true });
      expect(mockWindow.setSkipTaskbar).toHaveBeenCalledWith(true);
    });
  });
});
