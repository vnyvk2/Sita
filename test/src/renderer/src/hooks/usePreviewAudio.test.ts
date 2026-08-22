// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  usePreviewAudio,
  resetPreviewAudioForTesting
} from '../../../../../src/renderer/src/hooks/usePreviewAudio';

describe('usePreviewAudio Hook', () => {
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetPreviewAudioForTesting();
    playMock = vi.fn().mockImplementation(function (this: any) {
      this.paused = false;
      return Promise.resolve();
    });
    pauseMock = vi.fn().mockImplementation(function (this: any) {
      this.paused = true;
    });

    class MockAudio {
      src = '';
      volume = 0.8;
      paused = true;
      currentTime = 0;
      play = playMock;
      pause = pauseMock;
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }

    vi.stubGlobal('Audio', MockAudio);
  });

  it('initializes with no active preview and isPlaying false', () => {
    const { result } = renderHook(() => usePreviewAudio());
    expect(result.current.activePreviewId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('triggers playPreview on a track', () => {
    const { result } = renderHook(() => usePreviewAudio());

    act(() => {
      result.current.playPreview('track-101', 'https://preview.mp3');
    });

    expect(result.current.activePreviewId).toBe('track-101');
    expect(playMock).toHaveBeenCalled();
  });

  it('stops preview audio cleanly on stopPreview', () => {
    const { result } = renderHook(() => usePreviewAudio());

    act(() => {
      result.current.playPreview('track-101', 'https://preview.mp3');
    });

    act(() => {
      result.current.stopPreview();
    });

    expect(pauseMock).toHaveBeenCalled();
    expect(result.current.activePreviewId).toBeNull();
  });
});
