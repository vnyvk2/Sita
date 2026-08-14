// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SeekBarSlider from '../../../../../src/renderer/src/components/SeekBarSlider';
import { AppUpdateContext } from '../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../src/renderer/src/store/store';

let registeredSeekedCallback: ((time?: number) => void) | null = null;

vi.mock('../../../../../src/renderer/src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn(() => ({
    currentTime: 0,
    duration: 200,
    paused: false,
    on: vi.fn((event, cb) => {
      if (event === 'seeked') registeredSeekedCallback = cb;
    }),
    off: vi.fn((event) => {
      if (event === 'seeked') registeredSeekedCallback = null;
    })
  }))
}));

describe('SeekBarSlider component', () => {
  const mockUpdateSongPosition = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    registeredSeekedCallback = null;

    // Polyfill for Element.prototype.setPointerCapture / releasePointerCapture in jsdom
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = vi.fn();
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = vi.fn();
    }
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
    }

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 101,
        title: 'Test Song',
        duration: 200
      },
      player: {
        ...prev.player,
        isCurrentSongPlaying: false
      }
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <AppUpdateContext.Provider
        value={{
          updateSongPosition: mockUpdateSongPosition
        } as any}
      >
        <SeekBarSlider id="test-seekbar" name="test-seekbar" {...props} />
      </AppUpdateContext.Provider>
    );
  };

  it('renders an uncontrolled range slider with min 0 and max matching duration', () => {
    renderComponent();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider).toBeDefined();
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('200');
  });

  it('handles pointer down by setting data-scrubbing attribute and capturing pointer', () => {
    renderComponent();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.pointerDown(slider, { pointerId: 1 });

    expect(slider.getAttribute('data-scrubbing')).toBe('true');
    expect(slider.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('handles pointer up by releasing scrubbing state and committing seek', () => {
    renderComponent();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.pointerDown(slider, { pointerId: 1 });
    slider.value = '75';
    fireEvent.pointerUp(slider, { pointerId: 1 });

    expect(slider.getAttribute('data-scrubbing')).toBeNull();
    expect(mockUpdateSongPosition).toHaveBeenCalledWith(75);
  });

  it('handles pointer cancel by restoring normal state without committing seek', () => {
    renderComponent();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.pointerDown(slider, { pointerId: 1 });
    slider.value = '120';
    fireEvent.pointerCancel(slider, { pointerId: 1 });

    expect(slider.getAttribute('data-scrubbing')).toBeNull();
    expect(mockUpdateSongPosition).not.toHaveBeenCalled();
  });

  it('handles wheel events by updating value and committing seek after debounce', () => {
    vi.useFakeTimers();
    renderComponent();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    slider.value = '50';

    fireEvent.wheel(slider, { deltaY: -100 }); // increment
    expect(Number(slider.value)).toBeGreaterThanOrEqual(50);

    vi.advanceTimersByTime(300);
    expect(mockUpdateSongPosition).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('handles seeked completion correlation and rejects stale seeked events', () => {
    renderComponent();

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.pointerDown(slider, { pointerId: 1 });
    slider.value = '150';
    fireEvent.input(slider);
    fireEvent.pointerUp(slider, { pointerId: 1 });

    expect(mockUpdateSongPosition).toHaveBeenCalledWith(150);

    // Simulate stale seeked event arriving for an older position (e.g. 30s)
    if (registeredSeekedCallback) {
      registeredSeekedCallback(30);
      // Stale completion is rejected: style should retain the latest target (150s = 75%)
      expect(slider.style.getPropertyValue('--seek-before-width')).toBe('75%');

      // Now emit seeked matching the target (150s = 75%)
      registeredSeekedCallback(150);
      expect(slider.style.getPropertyValue('--seek-before-width')).toBe('75%');
    }
  });
});
