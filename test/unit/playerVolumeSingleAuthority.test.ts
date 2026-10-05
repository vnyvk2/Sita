// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockAudioContext {
  currentTime = 0;
  destination = {};

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: { value: 1000, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      gain: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      Q: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }

  createConvolver() {
    return {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createDynamicsCompressor() {
    return {
      threshold: { value: -6, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      knee: { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      ratio: { value: 20, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      attack: { value: 0.003, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      release: { value: 0.15, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
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

  close() {
    return Promise.resolve();
  }
}

window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '@renderer/other/player';

describe('Player Volume Single Authority (V^2 Regression Test)', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;

  beforeEach(() => {
    mockQueuesManager = {
      getActiveQueue: () => ({
        on: vi.fn().mockReturnValue(() => {}),
        currentSongId: 1,
        hasNext: true,
        hasPrevious: false,
        length: 5,
        position: 0,
        moveToNext: vi.fn(),
        moveToPrevious: vi.fn(),
        moveToPosition: vi.fn(),
        moveToStart: vi.fn(),
        isEmpty: false
      }),
      on: vi.fn().mockReturnValue(() => {})
    };

    player = new AudioPlayer(mockQueuesManager);
    player.audio.load = vi.fn();
    player.audio.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    player?.destroy();
    vi.clearAllMocks();
  });

  it('pins media elements to volume 1.0 and delegates volume exclusively to gainNode', () => {
    // Initial construction state: elements pinned to 1.0, master volume 1.0
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.gainNode.gain.value).toBe(1.0);

    // Set 50% volume (0.5)
    player.volume = 0.5;
    expect(player.volume).toBe(0.5);
    // Elements MUST remain pinned to 1.0 so MediaElementAudioSourceNode does not square the attenuation
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    // gainNode is the sole volume authority
    expect(player.gainNode.gain.value).toBe(0.5);

    // Set 10% volume (0.1)
    player.volume = 0.1;
    expect(player.volume).toBe(0.1);
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.gainNode.gain.value).toBe(0.1);

    // Bounds clamping: above 1.0 clamped to 1.0
    player.volume = 1.5;
    expect(player.volume).toBe(1.0);
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.gainNode.gain.value).toBe(1.0);

    // Bounds clamping: below 0.0 clamped to 0.0
    player.volume = -0.2;
    expect(player.volume).toBe(0.0);
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.gainNode.gain.value).toBe(0.0);
  });
});
