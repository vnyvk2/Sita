import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { store } from '@renderer/store/store';
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('shows hover scrub preview tooltip when hovering over track', async () => {
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

    // Tooltip is rAF-throttled: flush one frame inside act
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

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

  it('resumes position updates after touchcancel instead of freezing', () => {
    renderWithContext(<FullScreenSeekbar />);

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

    // Start touch drag, then OS cancels it (interruption / gesture takeover)
    fireEvent.touchStart(track, { touches: [{ clientX: 50 }] });
    window.dispatchEvent(new Event('touchcancel'));

    // Next playback tick must still update the bar (no stuck-drag freeze)
    document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 60 }));
    expect(screen.getByTestId('fullscreen-elapsed-time').textContent).toBe('01:00');
    expect(screen.getByTestId('fullscreen-seekbar-progress').style.width).toBe('30%');
  });

  it('ignores clicks when track has no layout box instead of seeking to end', () => {
    const onSeekMock = vi.fn();
    renderWithContext(<FullScreenSeekbar onSeek={onSeekMock} />);

    const track = screen.getByRole('slider');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 0,
      height: 24,
      right: 0,
      bottom: 24,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    fireEvent.mouseDown(track, { clientX: 100 });
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(mockUpdateSongPosition).not.toHaveBeenCalled();
    expect(onSeekMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('fullscreen-seekbar-progress').style.width).toBe('0%');
  });

  it('does not reset progress to 0 when duration resolves late mid-song', () => {
    renderWithContext(<FullScreenSeekbar />);

    document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 50 }));
    expect(screen.getByTestId('fullscreen-seekbar-progress').style.width).toBe('25%');

    // Late metadata: same songId, duration arrives (store update re-renders)
    store.setState((prev) => ({
      ...prev,
      currentSongData: { ...prev.currentSongData, duration: 200 }
    }));
    document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 60 }));

    expect(screen.getByTestId('fullscreen-elapsed-time').textContent).toBe('01:00');
    expect(screen.getByTestId('fullscreen-seekbar-progress').style.width).toBe('30%');
  });

  it('supports keyboard seeking on the slider with correct aria value', () => {
    const onSeekMock = vi.fn();
    renderWithContext(<FullScreenSeekbar onSeek={onSeekMock} />);

    document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 50 }));
    const track = screen.getByRole('slider');
    expect(track.getAttribute('aria-valuenow')).toBe('50');

    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(mockUpdateSongPosition).toHaveBeenCalledWith(55);
    expect(track.getAttribute('aria-valuenow')).toBe('55');

    fireEvent.keyDown(track, { key: 'Home' });
    expect(mockUpdateSongPosition).toHaveBeenCalledWith(0);
  });
});
