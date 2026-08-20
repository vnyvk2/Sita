// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@renderer/store/store';

import i18n from '../../i18n';
import storage from '../../utils/localStorage';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

const mockHistoryBack = vi.fn();
const mockHistoryForward = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/main-player/home' }),
  useRouter: () => ({ history: { back: mockHistoryBack, forward: mockHistoryForward } })
}));

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

  beforeEach(() => {
    mockResyncSongsLibrary.mockClear();

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
  });

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

  it('should trigger resyncSongsLibrary when Insert key is pressed', () => {
    renderHook(() => useKeyboardShortcuts(defaultProps));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Insert', bubbles: true });
      window.dispatchEvent(event);
    });

    expect(mockResyncSongsLibrary).toHaveBeenCalledTimes(1);
  });

  it('should ignore Insert key when active element is an INPUT', () => {
    renderHook(() => useKeyboardShortcuts(defaultProps));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Insert', bubbles: true });
      window.dispatchEvent(event);
    });

    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should ignore Insert key when active element is a TEXTAREA', () => {
    renderHook(() => useKeyboardShortcuts(defaultProps));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Insert', bubbles: true });
      window.dispatchEvent(event);
    });

    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('should ignore keydown when event is repeated (e.repeat is true)', () => {
    renderHook(() => useKeyboardShortcuts(defaultProps));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Insert', repeat: true, bubbles: true });
      window.dispatchEvent(event);
    });

    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();
  });

  it('should respect custom shortcut rebinding for resyncLibrary', () => {
    renderHook(() => useKeyboardShortcuts(defaultProps));

    // Rebind resyncLibrary shortcut to Ctrl+Shift+R
    const label = i18n.t('appShortcutsPrompt.resyncLibrary');
    storage.keyboardShortcuts.setKeyboardShortcuts(label, ['Ctrl', 'Shift', 'R']);

    // Press Insert -> should NOT trigger resync
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Insert', bubbles: true });
      window.dispatchEvent(event);
    });
    expect(mockResyncSongsLibrary).not.toHaveBeenCalled();

    // Press Ctrl+Shift+R -> SHOULD trigger resync
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'R',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true
      });
      window.dispatchEvent(event);
    });
    expect(mockResyncSongsLibrary).toHaveBeenCalledTimes(1);
  });

  it('should trigger history.back when goBack shortcut is pressed (Alt+ArrowLeft)', () => {
    mockHistoryBack.mockClear();
    renderHook(() => useKeyboardShortcuts(defaultProps));

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        altKey: true,
        bubbles: true
      });
      window.dispatchEvent(event);
    });

    expect(mockHistoryBack).toHaveBeenCalledTimes(1);
  });

  it('should trigger history.forward when goForward shortcut is pressed (Alt+ArrowRight)', () => {
    mockHistoryForward.mockClear();
    renderHook(() => useKeyboardShortcuts(defaultProps));

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        altKey: true,
        bubbles: true
      });
      window.dispatchEvent(event);
    });

    expect(mockHistoryForward).toHaveBeenCalledTimes(1);
  });
});
