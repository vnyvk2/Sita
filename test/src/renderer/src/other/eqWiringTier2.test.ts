// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-1: EQ preset reaches both DSP chains without a track reload, and the DB
// source wins over stale legacy storage.

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

describe('T2-1 EQ wiring and DB source', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) },
      settingsHelpers: { getUserEqualizerPreset: vi.fn().mockResolvedValue({ frequencyBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }) }
    };
    player = new AudioPlayer(makeQM() as any);
  });
  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('direct preset reaches WebAudio bands with no track load', () => {
    player.applyEqualizerPreset({
      thirtyTwoHertzFilter: 0,
      sixtyFourHertzFilter: 0,
      hundredTwentyFiveHertzFilter: 0,
      twoHundredFiftyHertzFilter: 0,
      fiveHundredHertzFilter: 0,
      thousandHertzFilter: 6,
      twoThousandHertzFilter: 0,
      fourThousandHertzFilter: 0,
      eightThousandHertzFilter: 0,
      sixteenThousandHertzFilter: -3
    } as any);
    expect(player.equalizerBands.get('thousandHertzFilter' as any)!.gain.value).toBe(6);
    expect(player.equalizerBands.get('sixteenThousandHertzFilter' as any)!.gain.value).toBe(-3);
    expect(player.equalizerBands.get('sixtyFourHertzFilter' as any)!.gain.value).toBe(0);
  });

  it('DB refresh drives WebAudio bands and the native tuple', async () => {
    const setEqualizer = vi.fn().mockResolvedValue(undefined);
    (player as any).nativeBackend = { setEqualizer, destroy: vi.fn() };
    (player as any).isNativeEngineActive = true;
    (window.api as any).settingsHelpers.getUserEqualizerPreset.mockResolvedValue({
      frequencyBands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => v - 5)
    });
    const bands = await player.refreshEqualizerFromDatabase();
    expect(bands).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    expect(setEqualizer).toHaveBeenCalledTimes(1);
    expect(setEqualizer.mock.calls[0][0]).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    // thousandHertzFilter is index 5 -> +1 dB on the WebAudio band.
    expect(player.equalizerBands.get('thousandHertzFilter' as any)!.gain.value).toBe(1);
    expect(player.equalizerBands.get('thirtyTwoHertzFilter' as any)!.gain.value).toBe(-4);
  });

  it('DB wins over stale legacy storage', async () => {
    const setEqualizer = vi.fn().mockResolvedValue(undefined);
    (player as any).nativeBackend = { setEqualizer, destroy: vi.fn() };
    (player as any).isNativeEngineActive = true;
    (window.api as any).settingsHelpers.getUserEqualizerPreset.mockResolvedValue({
      frequencyBands: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    });
    await player.refreshEqualizerFromDatabase();
    // Legacy storage defaults to flat; DB +5 dB must win on both engines.
    expect(player.equalizerBands.get('fiveHundredHertzFilter' as any)!.gain.value).toBe(5);
    expect(setEqualizer.mock.calls[0][0]).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  });
});
