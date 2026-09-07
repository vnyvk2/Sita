import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { dispatch } from '@renderer/store/store';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
// @vitest-environment jsdom
import { render, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import storage from '../../utils/localStorage';
import { workspaceActions } from '@renderer/workspace/store';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

vi.mock('../useOverlayNavigation', () => ({
  useOverlayNavigation: () => ({ toggleOverlay: vi.fn() })
}));

vi.mock('../useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    audio: {},
    currentTime: 0,
    duration: 100,
    volume: 1,
    playSong: vi.fn(),
    pauseSong: vi.fn(),
    stopSong: vi.fn()
  })
}));

describe('useKeyboardShortcuts - Library Resync & Guard Tests', () => {
  const mockResyncSongsLibrary = vi.fn();

  const defaultProps = {
    player: { currentTime: 0, duration: 100, volume: 1 },
    toggleSongPlayback: vi.fn(),
    toggleMutedState: vi.fn(),
    handleSkipForwardClick: vi.fn(),
    handleSkipBackwardClick: vi.fn(),
    updateVolume: vi.fn(),
    toggleShuffling: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleIsFavorite: vi.fn(),
    addNewNotifications: vi.fn(),
    updatePlayerType: vi.fn(),
    toggleMultipleSelections: vi.fn(),
    changePromptMenuData: vi.fn()
  };

  /**
   * Mounts the shortcut hook inside a REAL router backed by memory history. Module-mocking
   *
   * @tanstack/react-router proved unreliable across vitest pools; a genuine router context keeps
   * these tests deterministic everywhere.
   */
  const setupShortcuts = async () => {
    const rootRoute = createRootRoute();
    const ShortcutWrapper = () => {
      useKeyboardShortcuts(defaultProps);
      return null;
    };
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: ShortcutWrapper
    });
    const history = createMemoryHistory({ initialEntries: ['/'] });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history
    });

    const backSpy = vi.spyOn(history, 'back');
    const forwardSpy = vi.spyOn(history, 'forward');

    render(<RouterProvider router={router} />);

    // Flush the router's async transitioner so the route component (and its window keydown
    // listener) is fully mounted before a test fires events.
    await act(async () => {});

    return { backSpy, forwardSpy };
  };

  const fireKey = (key: string, eventInit: KeyboardEventInit = {}) => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...eventInit }));
    });
  };

  const setPlayerType = (type: 'normal' | 'mini' | 'full') => {
    act(() => {
      dispatch({ type: 'UPDATE_PLAYER_TYPE', data: type });
    });
  };

  /**
   * Jsdom has no Web Audio API. The hook under test constructs the real AudioPlayer singleton, and
   * module-mocking useAudioPlayer does not reliably intercept across vitest pools on Windows, so
   * provide a permissive AudioContext stub instead.
   */
  const makeStubNode = () => {
    const rampFns = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn()
    };
    const node: Record<string, unknown> = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      type: 'allpass'
    };
    node.frequency = { value: 0, ...rampFns };
    node.Q = { value: 0, ...rampFns };
    node.gain = { value: 1, ...rampFns };
    node.pan = { value: 0 };
    node.threshold = { value: 0 };
    node.knee = { value: 0 };
    node.ratio = { value: 0 };
    node.attack = { value: 0 };
    node.release = { value: 0 };
    return node;
  };

  class AudioContextStub {
    destination = {};
    sampleRate = 44100;
    state = 'running';
    currentTime = 0;
    decodeAudioData = vi.fn().mockResolvedValue({});
    resume = vi.fn().mockResolvedValue(undefined);
    suspend = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    createGain = vi.fn(() => makeStubNode());
    createBiquadFilter = vi.fn(() => makeStubNode());
    createDynamicsCompressor = vi.fn(() => makeStubNode());
    createStereoPanner = vi.fn(() => makeStubNode());
    createMediaElementSource = vi.fn(() => makeStubNode());
  }

  beforeEach(() => {
    mockResyncSongsLibrary.mockClear();

    window.AudioContext = AudioContextStub as unknown as typeof window.AudioContext;

    // Mock window.api
    window.api = {
      ...window.api,
      properties: { isInDevelopment: true },
      audioLibraryControls: {
        resyncSongsLibrary: mockResyncSongsLibrary
      }
    } as unknown as typeof window.api;

    storage.keyboardShortcuts.resetShortcutsToDefaults();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setPlayerType('normal');
  });

  it('should trigger resyncSongsLibrary when Insert key is pressed', async () => {
    await setupShortcuts();

    fireKey('Insert');

    expect(mockResyncSongsLibrary).toHaveBeenCalledTimes(1);
  });

  it('should ignore Insert key when active element is an INPUT', async () => {
    await setupShortcuts();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireKey('Insert');

    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should ignore Insert key when active element is a TEXTAREA', async () => {
    await setupShortcuts();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    fireKey('Insert');

    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('should ignore keydown when event is repeated (e.repeat is true)', async () => {
    await setupShortcuts();

    fireKey('Insert', { repeat: true });

    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();
  });

  it('should respect custom shortcut rebinding for resyncLibrary', async () => {
    await setupShortcuts();

    // Rebind resyncLibrary shortcut to Ctrl+Shift+R
    const label = 'appShortcutsPrompt.resyncLibrary';
    storage.keyboardShortcuts.setKeyboardShortcuts(label, ['Ctrl', 'Shift', 'R']);

    // Press Insert -> should NOT trigger resync
    fireKey('Insert');
    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();

    // Press Ctrl+Shift+R -> SHOULD trigger resync
    fireKey('R', { ctrlKey: true, shiftKey: true });
    expect(mockResyncSongsLibrary).toHaveBeenCalledTimes(1);
  });

  it('should trigger history.back when goBack shortcut is pressed (Alt+ArrowLeft)', async () => {
    const { backSpy } = await setupShortcuts();

    fireKey('ArrowLeft', { altKey: true });

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('should trigger history.forward when goForward shortcut is pressed (Alt+ArrowRight)', async () => {
    const { forwardSpy } = await setupShortcuts();

    fireKey('ArrowRight', { altKey: true });

    expect(forwardSpy).toHaveBeenCalledTimes(1);
  });

  describe('Mini Player Mode Shortcut Gating', () => {
    it('allows playback shortcuts while in mini player mode', async () => {
      setPlayerType('mini');
      defaultProps.toggleSongPlayback.mockClear();
      await setupShortcuts();

      storage.keyboardShortcuts.setKeyboardShortcuts('appShortcutsPrompt.playPause', ['Ctrl', 'P']);
      fireKey('P', { ctrlKey: true });

      expect(defaultProps.toggleSongPlayback).toHaveBeenCalledTimes(1);
    });

    it('blocks navigation shortcuts (goBack) while in mini player mode', async () => {
      setPlayerType('mini');
      const { backSpy } = await setupShortcuts();

      // goBack default binding is Alt+ArrowLeft
      fireKey('ArrowLeft', { altKey: true });

      expect(backSpy).not.toHaveBeenCalled();
    });

    it('opens standard mini player via openMiniPlayer shortcut from normal mode', async () => {
      setPlayerType('normal');
      defaultProps.updatePlayerType.mockClear();
      await setupShortcuts();

      // openMiniPlayer default binding is Ctrl+N
      fireKey('N', { ctrlKey: true });

      expect(defaultProps.updatePlayerType).toHaveBeenCalledWith('mini', 'standard');
    });

    it('opens compact mini player via openCompactPlayer shortcut from normal mode', async () => {
      setPlayerType('normal');
      defaultProps.updatePlayerType.mockClear();
      await setupShortcuts();

      // openCompactPlayer default binding is Ctrl+Shift+N
      fireKey('N', { ctrlKey: true, shiftKey: true });

      expect(defaultProps.updatePlayerType).toHaveBeenCalledWith('mini', 'compact');
    });

    it('switches to compact mode via openCompactPlayer shortcut when in standard mini mode', async () => {
      setPlayerType('mini');
      queryClient.setQueryData(settingsQuery.all.queryKey, { miniPlayerMode: 'standard' });
      defaultProps.updatePlayerType.mockClear();
      await setupShortcuts();

      fireKey('N', { ctrlKey: true, shiftKey: true });

      expect(defaultProps.updatePlayerType).toHaveBeenCalledWith('mini', 'compact');
    });

    it('exits to normal mode via openCompactPlayer shortcut when already in compact mode', async () => {
      setPlayerType('mini');
      queryClient.setQueryData(settingsQuery.all.queryKey, { miniPlayerMode: 'compact' });
      defaultProps.updatePlayerType.mockClear();
      await setupShortcuts();

      fireKey('N', { ctrlKey: true, shiftKey: true });

      expect(defaultProps.updatePlayerType).toHaveBeenCalledWith('normal');
    });

    it('switches to standard mode via openMiniPlayer shortcut when in compact mode', async () => {
      setPlayerType('mini');
      queryClient.setQueryData(settingsQuery.all.queryKey, { miniPlayerMode: 'compact' });
      defaultProps.updatePlayerType.mockClear();
      await setupShortcuts();

      fireKey('N', { ctrlKey: true });

      expect(defaultProps.updatePlayerType).toHaveBeenCalledWith('mini', 'standard');
    });

    it('exits to normal mode via openMiniPlayer shortcut when in standard mini mode', async () => {
      setPlayerType('mini');
      queryClient.setQueryData(settingsQuery.all.queryKey, { miniPlayerMode: 'standard' });
      defaultProps.updatePlayerType.mockClear();
      await setupShortcuts();

      // openMiniPlayer default binding is Ctrl+N
      fireKey('N', { ctrlKey: true });

      expect(defaultProps.updatePlayerType).toHaveBeenCalledWith('normal');
    });

    it('keeps navigation shortcuts working in normal mode (control case)', async () => {
      setPlayerType('normal');
      const { backSpy } = await setupShortcuts();

      fireKey('ArrowLeft', { altKey: true });

      expect(backSpy).toHaveBeenCalledTimes(1);
    });

    it('routes goToSearch to the mini player search surface while in mini mode', async () => {
      setPlayerType('mini');
      const toggleMiniPlayerSearch = vi.fn().mockResolvedValue(undefined);
      window.api = {
        ...window.api,
        miniPlayer: { ...window.api?.miniPlayer, toggleMiniPlayerSearch }
      } as unknown as typeof window.api;
      await setupShortcuts();

      // goToSearch default binding is Ctrl+F
      fireKey('F', { ctrlKey: true });

      expect(toggleMiniPlayerSearch).toHaveBeenCalledWith(true);
      expect(window.location.pathname).not.toContain('/main-player/search');
    });

    it('routes goToQueue to the mini player queue surface while in mini mode', async () => {
      setPlayerType('mini');
      const toggleMiniPlayerQueue = vi.fn().mockResolvedValue(undefined);
      window.api = {
        ...window.api,
        miniPlayer: { ...window.api?.miniPlayer, toggleMiniPlayerQueue }
      } as unknown as typeof window.api;
      await setupShortcuts();

      // goToQueue default binding is Ctrl+Q
      fireKey('Q', { ctrlKey: true });

      expect(toggleMiniPlayerQueue).toHaveBeenCalledWith(true);
    });
  });

  describe('Workspace Panel Shortcuts', () => {
    beforeEach(() => {
      act(() => {
        storage.preferences.setPreferences('isExperimentalWorkspaceEnabled', true);
      });
    });

    afterEach(() => {
      act(() => {
        storage.preferences.setPreferences('isExperimentalWorkspaceEnabled', false);
      });
    });

    it('does not trigger workspace panel shortcuts when experimental workspace is OFF', async () => {
      act(() => {
        storage.preferences.setPreferences('isExperimentalWorkspaceEnabled', false);
      });
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('q', { altKey: true, code: 'KeyQ' });
      fireKey('l', { altKey: true, code: 'KeyL' });
      fireKey('p', { altKey: true, code: 'KeyP' });

      expect(spy).not.toHaveBeenCalled();
    });

    it('triggers toggleOrOpenPanel with queue on Alt+Q', async () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('q', { altKey: true, code: 'KeyQ' });

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('queue');
      });
    });

    it('triggers toggleOrOpenPanel with lyrics on Alt+L', async () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('l', { altKey: true, code: 'KeyL' });

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('lyrics');
      });
    });

    it('triggers toggleOrOpenPanel with playlists on Alt+P', async () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('p', { altKey: true, code: 'KeyP' });

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('playlists');
      });
    });

    it('triggers toggleOrOpenPanel with visualizer on Alt+V', async () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('v', { altKey: true, code: 'KeyV' });

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('visualizer');
      });
    });

    it('triggers toggleOrOpenPanel with now-playing on Alt+N', async () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('n', { altKey: true, code: 'KeyN' });

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('now-playing');
      });
    });

    it('triggers openSaveLayoutModal on Alt+S', async () => {
      const spy = vi.spyOn(workspaceActions, 'openSaveLayoutModal').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('s', { altKey: true, code: 'KeyS' });

      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('save');
      });
    });

    it('supports macOS Option key unicode characters via e.code', async () => {
      const panelSpy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const saveSpy = vi.spyOn(workspaceActions, 'openSaveLayoutModal').mockImplementation(() => {});
      await setupShortcuts();

      // macOS Option+Q produces 'œ' with code 'KeyQ'
      fireKey('œ', { altKey: true, code: 'KeyQ' });
      await vi.waitFor(() => {
        expect(panelSpy).toHaveBeenCalledWith('queue');
      });

      // macOS Option+S produces 'ß' with code 'KeyS'
      fireKey('ß', { altKey: true, code: 'KeyS' });
      await vi.waitFor(() => {
        expect(saveSpy).toHaveBeenCalledWith('save');
      });

      // macOS Option+L produces '¬' with code 'KeyL'
      fireKey('¬', { altKey: true, code: 'KeyL' });
      await vi.waitFor(() => {
        expect(panelSpy).toHaveBeenCalledWith('lyrics');
      });
    });

    it('respects custom shortcut rebinding for workspace panels', async () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      // Rebind toggleQueuePanel to Ctrl+Shift+Q
      storage.keyboardShortcuts.setKeyboardShortcuts('appShortcutsPrompt.toggleQueuePanel', [
        'Ctrl',
        'Shift',
        'Q'
      ]);

      // Alt+Q should no longer trigger queue panel
      fireKey('q', { altKey: true, code: 'KeyQ' });
      expect(spy).not.toHaveBeenCalled();

      // Ctrl+Shift+Q should trigger queue panel
      fireKey('q', { ctrlKey: true, shiftKey: true, code: 'KeyQ' });
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledWith('queue');
      });
    });

    it('blocks workspace panel shortcuts while in mini player mode', async () => {
      setPlayerType('mini');
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      await setupShortcuts();

      fireKey('q', { altKey: true, code: 'KeyQ' });

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
