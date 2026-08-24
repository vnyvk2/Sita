// @vitest-environment jsdom
import { render, act, cleanup } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatch } from '@renderer/store/store';

import i18n from '../../i18n';
import storage from '../../utils/localStorage';
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
   * @tanstack/react-router proved unreliable across vitest pools; a genuine router context keeps
   * these tests deterministic everywhere.
   */
  const setupShortcuts = async () => {
    const rootRoute = createRootRoute();
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        useKeyboardShortcuts(defaultProps);
        return null;
      }
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
   * jsdom has no Web Audio API. The hook under test constructs the real AudioPlayer singleton,
   * and module-mocking useAudioPlayer does not reliably intercept across vitest pools on Windows,
   * so provide a permissive AudioContext stub instead.
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
    const label = i18n.t('appShortcutsPrompt.resyncLibrary');
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

      storage.keyboardShortcuts.setKeyboardShortcuts(i18n.t('appShortcutsPrompt.playPause'), [
        'Ctrl',
        'P'
      ]);
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

    it('still allows exiting mini player mode via the openMiniPlayer shortcut', async () => {
      setPlayerType('mini');
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
  });
});
