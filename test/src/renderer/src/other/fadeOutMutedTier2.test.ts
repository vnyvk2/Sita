// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Muted-pause barrier: exponential ramps cannot start from 0 in real Chromium
// (W3C RangeError). Since gainNode is 0 while muted, fadeOut must anchor from
// a clamped value so audio.pause() is reached and the promise settles.

function mockW3CGain(v = 1) {
  const gain: any = { value: v };
  gain.setValueAtTime = vi.fn((nv: number) => {
    gain.value = nv;
  });
  gain.setTargetAtTime = vi.fn((nv: number) => {
    gain.value = nv;
  });
  gain.cancelScheduledValues = vi.fn();
  // W3C-faithful: an exponential ramp starting from exactly 0 throws.
  gain.exponentialRampToValueAtTime = vi.fn(() => {
    if (gain.value === 0) {
      throw new RangeError(
        "Failed to execute 'exponentialRampToValueAtTime' on 'AudioParam': The value at the start of the ramp cannot be zero."
      );
    }
  });
  gain.setValueCurveAtTime = vi.fn();
  gain.cancelAndHoldAtTime = vi.fn();
  return { gain, connect: vi.fn(), disconnect: vi.fn() };
}

class MockAudioContext {
  currentTime = 10;
  state = 'running';
  destination = {};
  createGain() {
    return mockW3CGain(1);
  }
  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: { value: 1000, setTargetAtTime: vi.fn() },
      gain: { value: 0, setTargetAtTime: vi.fn() },
      Q: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }
  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createConvolver() {
    return { buffer: null, connect: vi.fn(), disconnect: vi.fn() };
  }
  createDynamicsCompressor() {
    return {
      threshold: { value: -6 },
      knee: { value: 0 },
      ratio: { value: 20 },
      attack: { value: 0.003 },
      release: { value: 0.15 },
      reduction: 0,
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }
  createChannelSplitter() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createChannelMerger() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}
window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '@renderer/other/player';

function makeQM() {
  return {
    getActiveQueue: () => ({
      on: vi.fn().mockReturnValue(() => {}),
      currentSongId: 1,
      hasNext: false,
      hasPrevious: false,
      length: 1,
      position: 0,
      songIds: [1],
      moveToNext: vi.fn(),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn(),
      moveToStart: vi.fn(),
      isEmpty: false
    }),
    on: vi.fn().mockReturnValue(() => {})
  };
}

describe('muted fadeOut anchor', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) },
      settingsHelpers: { getUserEqualizerPreset: vi.fn().mockResolvedValue({ frequencyBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }) }
    };
    vi.useFakeTimers();
    player = new AudioPlayer(makeQM() as any);
    player.audioA.pause = vi.fn() as any;
    player.audioB.pause = vi.fn() as any;
  });
  afterEach(() => {
    vi.useRealTimers();
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('pause while muted (real zero-gain state) fades out and pauses audio', async () => {
    player.volume = 0.5;
    player.muted = true;
    expect(player.gainNode.gain.value).toBe(0);
    const pauseSpy = vi.fn();
    Object.defineProperty(player, 'audio', { value: { pause: pauseSpy }, configurable: true });
    const p = (player as any).fadeOutAudio();
    const done = p.then(() => 'settled');
    await vi.advanceTimersByTimeAsync(300);
    await expect(done).resolves.toBe('settled');
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    // Ramp scheduled from the clamped anchor, never from 0.
    const ramp = player.gainNode.gain.exponentialRampToValueAtTime as any;
    expect(ramp).toHaveBeenCalledTimes(1);
  });

  it('unmuted fade-out still ramps from the live gain value', async () => {
    player.volume = 0.5;
    const anchor = player.gainNode.gain.setValueAtTime as any;
    anchor.mockClear();
    const pauseSpy = vi.fn();
    Object.defineProperty(player, 'audio', { value: { pause: pauseSpy }, configurable: true });
    const p = (player as any).fadeOutAudio();
    const done = p.then(() => 'settled');
    await vi.advanceTimersByTimeAsync(300);
    await expect(done).resolves.toBe('settled');
    expect(anchor.mock.calls[0][0]).toBeCloseTo(0.5, 5);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });
});
