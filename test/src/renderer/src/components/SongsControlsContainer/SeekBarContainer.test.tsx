// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SeekBarContainer from '../../../../../../src/renderer/src/components/SongsControlsContainer/SeekBarContainer';
import { AppUpdateContext } from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../../src/renderer/src/store/store';

vi.mock('../../../../../../src/renderer/src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn(() => ({
    currentTime: 0,
    duration: 180,
    paused: false,
    on: vi.fn(),
    off: vi.fn()
  }))
}));

describe('SeekBarContainer component', () => {
  const mockUpdateSongPosition = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 102,
        title: 'Another Test Song',
        duration: 180
      },
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showSongRemainingTime: false
        }
      }
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    return render(
      <AppUpdateContext.Provider
        value={{
          updateSongPosition: mockUpdateSongPosition
        } as any}
      >
        <SeekBarContainer />
      </AppUpdateContext.Provider>
    );
  };

  it('renders initial 00:00 time label and formatted full duration', () => {
    renderComponent();

    expect(screen.getByText('00:00')).toBeDefined();
    expect(screen.getByText('03:00')).toBeDefined();
  });

  it('updates time label when whole second changes via player/positionChange', () => {
    renderComponent();

    act(() => {
      document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 65.4 }));
    });

    expect(screen.getByText('01:05')).toBeDefined();
  });

  it('renders negative remaining time when showSongRemainingTime preference is enabled', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showSongRemainingTime: true
        }
      }
    }));

    renderComponent();

    act(() => {
      document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 60 }));
    });

    expect(screen.getByText('01:00')).toBeDefined();
    expect(screen.getByText('-02:00')).toBeDefined();
  });
});
