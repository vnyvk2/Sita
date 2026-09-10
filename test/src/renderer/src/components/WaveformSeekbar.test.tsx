// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WaveformSeekbar from '../../../../../src/renderer/src/components/WaveformSeekbar';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../src/renderer/src/contexts/AppUpdateContext';
import { dispatch } from '../../../../../src/renderer/src/store/store';

const createFake2d = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  setLineDash: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1
});

describe('WaveformSeekbar Component', () => {
  let fakeCtx: ReturnType<typeof createFake2d>;

  beforeEach(() => {
    fakeCtx = createFake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D
    );

    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    HTMLDivElement.prototype.setPointerCapture = vi.fn();
    HTMLDivElement.prototype.releasePointerCapture = vi.fn();

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }
    );

    (window as unknown as { api: { getSongWaveform: (songId: number) => Promise<Float32Array> } }).api = {
      getSongWaveform: vi.fn().mockResolvedValue(new Float32Array(200).fill(0.5))
    };

    dispatch({
      type: 'CURRENT_SONG_DATA_CHANGE',
      data: {
        songId: 101,
        title: 'Waveform Track',
        duration: 200
      } as unknown as AudioPlayerData
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders waveform container and canvas', async () => {
    await act(async () => {
      render(<WaveformSeekbar id="test-waveform" name="test-waveform" />);
    });

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeDefined();
    expect(canvas).not.toBeNull();
  });

  it('calculates seek accurately and calls updateSongPosition and onSeek on pointerUp', async () => {
    const updateSongPosition = vi.fn();
    const onSeek = vi.fn();

    await act(async () => {
      render(
        <AppUpdateContext.Provider
          value={{ updateSongPosition } as unknown as AppUpdateContextType}
        >
          <WaveformSeekbar id="test-waveform" name="test-waveform" onSeek={onSeek} />
        </AppUpdateContext.Provider>
      );
    });

    const container = document.querySelector('.relative.w-full.cursor-pointer') as HTMLDivElement;
    expect(container).not.toBeNull();

    // Container width is 200px, duration is 200s (so 1px = 1s)
    // Pointer down at x = 50px (25% = 50s)
    fireEvent.pointerDown(container, { clientX: 50, pointerId: 1 });

    // Pointer move to x = 150px (75% = 150s)
    fireEvent.pointerMove(container, { clientX: 150, pointerId: 1 });

    // Pointer up at x = 150px
    fireEvent.pointerUp(container, { clientX: 150, pointerId: 1 });

    expect(updateSongPosition).toHaveBeenCalledWith(150);
    expect(onSeek).toHaveBeenCalledWith(150);
  });

  it('immediately syncs progress and draws playhead without waiting for scheduler', async () => {
    const updateSongPosition = vi.fn();

    await act(async () => {
      render(
        <AppUpdateContext.Provider
          value={{ updateSongPosition } as unknown as AppUpdateContextType}
        >
          <WaveformSeekbar id="test-waveform" name="test-waveform" />
        </AppUpdateContext.Provider>
      );
    });

    const container = document.querySelector('.relative.w-full.cursor-pointer') as HTMLDivElement;

    fakeCtx.stroke.mockClear();

    // Seek to 50% (100px)
    fireEvent.pointerDown(container, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(container, { clientX: 100, pointerId: 1 });

    // Verify stroke was called to draw the playhead
    expect(fakeCtx.stroke).toHaveBeenCalled();
  });

  it('draws dashed hover guide line when hovering at distinct position from playhead', async () => {
    await act(async () => {
      render(<WaveformSeekbar id="test-waveform" name="test-waveform" />);
    });

    const container = document.querySelector('.relative.w-full.cursor-pointer') as HTMLDivElement;

    // Playhead starts at 0. Hover at 100px (50%)
    fakeCtx.setLineDash.mockClear();

    fireEvent.pointerMove(container, { clientX: 100 });

    // Hover guide line should set dashed line [2, 2] and reset []
    expect(fakeCtx.setLineDash).toHaveBeenCalledWith([2, 2]);
    expect(fakeCtx.setLineDash).toHaveBeenCalledWith([]);
  });

  it('updates position when receiving player/positionChange event while not dragging', async () => {
    await act(async () => {
      render(<WaveformSeekbar id="test-waveform" name="test-waveform" />);
    });

    fakeCtx.stroke.mockClear();

    // Position change event at 60s (30% of 200s)
    const event = new CustomEvent('player/positionChange', { detail: 60 });
    document.dispatchEvent(event);

    expect(fakeCtx.stroke).toHaveBeenCalled();
  });

  it('preserves dragging position when player/positionChange event arrives during drag', async () => {
    const updateSongPosition = vi.fn();

    await act(async () => {
      render(
        <AppUpdateContext.Provider
          value={{ updateSongPosition } as unknown as AppUpdateContextType}
        >
          <WaveformSeekbar id="test-waveform" name="test-waveform" />
        </AppUpdateContext.Provider>
      );
    });

    const container = document.querySelector('.relative.w-full.cursor-pointer') as HTMLDivElement;

    // Start drag at x = 160px (80% = 160s)
    fireEvent.pointerDown(container, { clientX: 160, pointerId: 1 });

    // Background playback ticks at 20s
    const event = new CustomEvent('player/positionChange', { detail: 20 });
    document.dispatchEvent(event);

    // Release drag at x = 160px
    fireEvent.pointerUp(container, { clientX: 160, pointerId: 1 });

    // It should seek to 160s, NOT the background 20s
    expect(updateSongPosition).toHaveBeenCalledWith(160);
  });
});
