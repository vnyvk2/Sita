// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain() { return { gain: { value: 1, setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBiquadFilter() { return { type: 'peaking', frequency: { value: 1000, setTargetAtTime: vi.fn() }, gain: { value: 0, setTargetAtTime: vi.fn() }, Q: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaElementSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() { return { threshold: { value: -6, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, knee: { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, ratio: { value: 20, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, attack: { value: 0.003, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, release: { value: 0.15, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, reduction: 0, connect: vi.fn(), disconnect: vi.fn() }; }
  createChannelSplitter() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createChannelMerger() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
(window as any).AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '../../src/renderer/src/other/player';

describe('Native Audio Crossfade Scheduler', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;
  let sendMock: any;

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

    sendMock = vi.fn().mockResolvedValue({ id: 1, status: 'ok' });

    (globalThis as any).window.api = {
      audioLibraryControls: {
        getSong: vi.fn().mockResolvedValue({
          songId: 202,
          path: 'nora://songs/track202.flac'
        })
      },
      audioEngine: {
        send: sendMock,
        stop: vi.fn().mockResolvedValue(undefined),
        onEvent: vi.fn().mockReturnValue(() => {})
      }
    };

    player = new AudioPlayer(mockQueuesManager);
    player.audio.load = vi.fn();
    (player as any).isNativeEngineActive = true;
  });

  afterEach(() => {
    player?.destroy();
    vi.clearAllMocks();
  });

  it('delegates active crossfade to nativeBackend when native engine is active', async () => {
    const nextSong = { songId: 202, path: 'nora://songs/track202.flac' };
    const clampedDurationMs = 2500;
    
    // Ensure native backend is mocked and crossfade session is active
    const nativeBackendMock = {
      preload: vi.fn().mockResolvedValue(true),
      crossfade: vi.fn().mockResolvedValue(true),
      destroy: vi.fn(),
      setVolume: vi.fn().mockResolvedValue(true)
    };
    (player as any).nativeBackend = nativeBackendMock;
    (player as any).crossfadeScheduler = {
      getSessionId: () => 1,
      getState: () => 'FADING',
      cancel: () => {}
    };

    const delegate = (player as any).createCrossfadeDelegate();

    // Simulate preloading the standby slot
    await delegate.preloadTrack(nextSong.songId, 1);
    expect(nativeBackendMock.preload).toHaveBeenCalledWith('nora://songs/track202.flac');
    expect((player as any).preloadedSongData).toEqual(nextSong);

    // Simulate crossfade trigger
    await delegate.startFade({
      sessionId: 1,
      incomingTrackId: 202,
      clampedFadeDuration: 2.5,
      fadeOutCurve: new Float32Array(0),
      fadeInCurve: new Float32Array(0)
    });

    expect(nativeBackendMock.crossfade).toHaveBeenCalledWith(2500);

    // Expect track to be swapped and position reset immediately for UI
    expect((player as any).activeSlot).toBe('B');
    expect((player as any).nativeCurrentPosition).toBe(0);
    expect((player as any).preloadedSongData).toBeNull();
  });
});
