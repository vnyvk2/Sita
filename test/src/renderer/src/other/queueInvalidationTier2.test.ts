// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-7a: structural queue mutation invalidates armed crossfade standby.
// No generation bump (active playback continues); scheduler cancel + standby
// refresh only. Deferred/barrier style, no sleeps.

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
  currentTime = 0;
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
      Q: new MockAudioParam(1),
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
  return { songId: id, title: `Song ${id}`, duration: 200, path: `nora://music/song_${id}.flac`, artists: [], replayGain: {} };
}

function makeQueueHarness() {
  const handlers: Record<string, Function[]> = {};
  const queue: any = {
    on: vi.fn().mockImplementation((evt: string, cb: Function) => {
      (handlers[evt] ||= []).push(cb);
      return () => {};
    }),
    currentSongId: 1,
    hasNext: true,
    hasPrevious: false,
    length: 5,
    position: 0,
    songIds: [1, 2, 3, 4, 5],
    moveToNext: vi.fn(),
    moveToPrevious: vi.fn(),
    moveToPosition: vi.fn(),
    moveToStart: vi.fn(),
    isEmpty: false
  };
  const qm = { getActiveQueue: () => queue, on: vi.fn().mockReturnValue(() => {}) };
  return { qm, queue, handlers, fire: (evt: string, data?: any) => (handlers[evt] || []).forEach((cb) => cb(data)) };
}

describe('T2-7a queue READY invalidation', () => {
  let player: AudioPlayer;
  let harness: ReturnType<typeof makeQueueHarness>;

  beforeEach(() => {
    harness = makeQueueHarness();
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn().mockResolvedValue(makeSong(9)) },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) }
    };
    player = new AudioPlayer(harness.qm as any);
  });

  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('diverged next cancels armed READY standby without bumping generation', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    const genBefore = (player as any).playbackGeneration;
    // Arm: preloaded 2 while true next is 3 (queue edited after READY).
    (player as any).preloadedSongData = makeSong(2);
    (scheduler as any).state = 'READY';
    (scheduler as any).preloadedTrackId = 2;
    harness.queue.songIds = [1, 3, 4, 5];
    harness.fire('queueChange', { queue: [1, 3, 4, 5] });
    expect(scheduler.getState()).toBe('IDLE');
    expect((player as any).preloadedSongData).toBeNull();
    // Active playback untouched: no generation bump for standby-only change.
    expect((player as any).playbackGeneration).toBe(genBefore);
  });

  it('matching next leaves armed READY standby intact', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    const genBefore = (player as any).playbackGeneration;
    (player as any).preloadedSongData = makeSong(2);
    (scheduler as any).state = 'READY';
    (scheduler as any).preloadedTrackId = 2;
    harness.queue.songIds = [1, 2, 3, 4, 5];
    harness.fire('queueChange', { queue: [1, 2, 3, 4, 5] });
    expect(scheduler.getState()).toBe('READY');
    expect((player as any).preloadedSongData?.songId).toBe(2);
    expect((player as any).playbackGeneration).toBe(genBefore);
  });

  it('mutation during FADING does not cancel the owned fade', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    (player as any).preloadedSongData = makeSong(2);
    (scheduler as any).state = 'FADING';
    (scheduler as any).preloadedTrackId = 2;
    harness.queue.songIds = [1, 3, 4, 5];
    harness.fire('queueChange', { queue: [1, 3, 4, 5] });
    expect(scheduler.getState()).toBe('FADING');
  });
});
