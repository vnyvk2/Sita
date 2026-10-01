// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-7c: standby ReplayGain uses smoothed setTargetAtTime like the active path.

class MockAudioParam {
  value: number;
  setValueAtTime = vi.fn();
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  cancelScheduledValues = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setValueCurveAtTime = vi.fn();
  cancelAndHoldAtTime = vi.fn();
  constructor(v: number) {
    this.value = v;
  }
}
function mockGainNode(v = 1) {
  return { gain: new MockAudioParam(v), connect: vi.fn(), disconnect: vi.fn() };
}
class MockAudioContext {
  currentTime = 10;
  state = 'running';
  destination = {};
  createGain() {
    return mockGainNode(1);
  }
  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: new MockAudioParam(1000),
      gain: new MockAudioParam(0),
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
      threshold: new MockAudioParam(-6),
      knee: new MockAudioParam(0),
      ratio: new MockAudioParam(20),
      attack: new MockAudioParam(0.003),
      release: new MockAudioParam(0.15),
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

function makeSong(id: number) {
  return {
    songId: id,
    title: `Song ${id}`,
    duration: 200,
    path: `nora://music/song_${id}.flac`,
    artists: [],
    replayGain: { trackGain: -6, trackPeak: 0.9 }
  };
}
function makeQM() {
  return {
    getActiveQueue: () => ({
      on: vi.fn().mockReturnValue(() => {}),
      currentSongId: 1,
      hasNext: true,
      hasPrevious: false,
      length: 5,
      position: 0,
      songIds: [1, 2, 3],
      moveToNext: vi.fn(),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn(),
      moveToStart: vi.fn(),
      isEmpty: false
    }),
    on: vi.fn().mockReturnValue(() => {})
  };
}

describe('T2-7c standby ReplayGain smoothing', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn().mockResolvedValue(makeSong(2)) },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) }
    };
    player = new AudioPlayer(makeQM() as any);
    player.audioA.load = vi.fn() as any;
    player.audioB.load = vi.fn() as any;
    Object.defineProperty(player.audioA, 'readyState', { value: 3, configurable: true });
    Object.defineProperty(player.audioB, 'readyState', { value: 3, configurable: true });
  });
  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('preload standby gain ramps via setTargetAtTime instead of snapping', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    const delegate = (scheduler as any).delegate;
    const sessionId = scheduler.getSessionId();
    const ok = await delegate.preloadTrack(2, sessionId);
    expect(ok).toBe(true);
    // Active slot is A, so standby is B.
    const standbyGain = (player as any).replayGainB.gain;
    expect(standbyGain.setTargetAtTime).toHaveBeenCalledTimes(1);
    expect(standbyGain.setTargetAtTime.mock.calls[0][2]).toBe(0.05);
  });
});
