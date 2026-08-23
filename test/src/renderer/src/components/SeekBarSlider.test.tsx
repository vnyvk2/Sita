// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import SeekBarSlider from '../../../../../src/renderer/src/components/SeekBarSlider';
import { AppUpdateContext } from '../../../../../src/renderer/src/contexts/AppUpdateContext';
import { dispatch } from '../../../../../src/renderer/src/store/store';

describe('SeekBarSlider', () => {
  it('updates visual style on positionChange when not dragging', () => {
    dispatch({
      type: 'CURRENT_SONG_DATA_CHANGE',
      data: {
        songId: 1,
        title: 'Test Song',
        duration: 100
      } as any
    });

    render(<SeekBarSlider id="test-slider" name="test-slider" />);

    const input = screen.getByRole('slider') as HTMLInputElement;

    // Simulate incoming positionChange event
    const event = new CustomEvent('player/positionChange', { detail: 45 });
    document.dispatchEvent(event);

    expect(input.style.getPropertyValue('--seek-before-width')).toBe('45%');
    expect(input.value).toBe('45');
  });

  it('preserves user drag position when positionChange events arrive during dragging', () => {
    const updateSongPosition = vi.fn();
    const onSeek = vi.fn();

    render(
      <AppUpdateContext.Provider value={{ updateSongPosition } as any}>
        <SeekBarSlider id="test-slider" name="test-slider" onSeek={onSeek} />
      </AppUpdateContext.Provider>
    );

    const input = screen.getByRole('slider') as HTMLInputElement;

    // User starts mousedown on seekbar
    fireEvent.mouseDown(input);

    // User changes slider value to 75
    fireEvent.change(input, { target: { value: 75, valueAsNumber: 75 } });
    expect(input.value).toBe('75');

    // While dragging, playback positionChange event arrives (say pos = 20)
    const event = new CustomEvent('player/positionChange', { detail: 20 });
    document.dispatchEvent(event);

    // Position MUST NOT be overridden by background position event during drag
    expect(input.value).toBe('75');

    // User releases mouse
    fireEvent.mouseUp(window);

    // Player position is updated on release
    expect(updateSongPosition).toHaveBeenCalledWith(75);
    expect(onSeek).toHaveBeenCalledWith(75);
  });
});
