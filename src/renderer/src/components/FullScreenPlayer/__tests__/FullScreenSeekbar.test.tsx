import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { store } from '@renderer/store/store';
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FullScreenSeekbar from '../components/FullScreenSeekbar';

describe('FullScreenSeekbar', () => {
  const mockUpdateSongPosition = vi.fn();
  const mockContext: Partial<AppUpdateContextType> = {
    updateSongPosition: mockUpdateSongPosition
  };

  const renderWithContext = (ui: ReactNode) => {
    return render(
      <AppUpdateContext.Provider value={mockContext as AppUpdateContextType}>
        {ui}
      </AppUpdateContext.Provider>
    );
  };

  const initialSongData = store.state.currentSongData;

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 42,
        title: 'Seekbar Test Song',
        duration: 200,
        isAFavorite: false,
        isArtworkAvailable: false,
        path: '/music/test.mp3',
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '',
          optimizedArtworkPath: '',
          isDefaultArtwork: true
        }
      }
    }));
  });

  afterEach(() => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: initialSongData
    }));
  });

  it('renders seekbar with initial 00:00 elapsed and total/remaining time', () => {
    renderWithContext(<FullScreenSeekbar />);

    expect(screen.getByTestId('fullscreen-seekbar')).toBeDefined();
    expect(screen.getByTestId('fullscreen-elapsed-time').textContent).toBe('00:00');
    expect(screen.getByTestId('fullscreen-remaining-time')).toBeDefined();
  });

  it('updates elapsed time and progress bar on player/positionChange event', () => {
    renderWithContext(<FullScreenSeekbar />);

    const positionEvent = new CustomEvent('player/positionChange', {
      detail: 50
    });
    document.dispatchEvent(positionEvent);

    expect(screen.getByTestId('fullscreen-elapsed-time').textContent).toBe('00:50');
    const progressBar = screen.getByTestId('fullscreen-seekbar-progress');
    // 50s out of 200s is 25%
    expect(progressBar.style.width).toBe('25%');
  });

  it('shows hover scrub preview tooltip when hovering over track', () => {
    renderWithContext(<FullScreenSeekbar />);

    const track = screen.getByRole('slider');
    // Mock track geometry
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 400,
      height: 24,
      right: 500,
      bottom: 224,
      x: 100,
      y: 200,
      toJSON: () => {}
    });

    // Hover at clientX = 300 (middle, which is 50% = 100 seconds = 01:40)
    fireEvent.mouseMove(track, { clientX: 300 });

    const tooltip = screen.getByTestId('fullscreen-seekbar-tooltip');
    expect(tooltip).toBeDefined();
    expect(tooltip.textContent).toBe('01:40');

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(track);
    expect(screen.queryByTestId('fullscreen-seekbar-tooltip')).toBeNull();
  });

  it('calls updateSongPosition on mouse drag and release', () => {
    const onSeekMock = vi.fn();
    renderWithContext(<FullScreenSeekbar onSeek={onSeekMock} />);

    const track = screen.getByRole('slider');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 24,
      right: 200,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Mousedown at 50px (25% of 200s duration = 50s)
    fireEvent.mouseDown(track, { clientX: 50 });
    // Mouse up to commit
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(mockUpdateSongPosition).toHaveBeenCalledWith(50);
    expect(onSeekMock).toHaveBeenCalledWith(50);
  });

  it('cleans up window listeners on unmount during active drag', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithContext(<FullScreenSeekbar />);

    const track = screen.getByRole('slider');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 24,
      right: 200,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Start dragging
    fireEvent.mouseDown(track, { clientX: 50 });

    // Unmount while dragging
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('updates position relative to current playback on wheel scrub without jumping to 0', () => {
    vi.useFakeTimers();
    const onSeekMock = vi.fn();
    renderWithContext(<FullScreenSeekbar onSeek={onSeekMock} />);

    // Position updates to 80s during playback
    const positionEvent = new CustomEvent('player/positionChange', {
      detail: 80
    });
    document.dispatchEvent(positionEvent);

    const track = screen.getByRole('slider');

    // Scroll up (deltaY < 0 means forward by step 5s -> 85s)
    fireEvent.wheel(track, { deltaY: -100 });

    expect(screen.getByTestId('fullscreen-elapsed-time').textContent).toBe('01:25');

    // Fast forward timer by 200ms
    vi.advanceTimersByTime(200);

    expect(mockUpdateSongPosition).toHaveBeenCalledWith(85);
    expect(onSeekMock).toHaveBeenCalledWith(85);
    vi.useRealTimers();
  });
});
