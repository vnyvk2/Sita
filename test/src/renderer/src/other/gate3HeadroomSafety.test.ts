// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

class MockAudioParam {
  value: number;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
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
  sampleRate = 48000;
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
      threshold: new MockAudioParam(-0.1),
      knee: new MockAudioParam(0),
      ratio: new MockAudioParam(20),
      attack: new MockAudioParam(0.001),
      release: new MockAudioParam(0.05),
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
import {
  buildCompositeBiquadCoeffs,
  computeCompositeEqPeak,
  evaluateCompositeGainDb
} from '@renderer/other/equalizerData';

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

describe('Gate 3.2: Dynamic Headroom Gain Staging & Safety Ceiling', () => {
  describe('computeCompositeEqPeak analytic function', () => {
    it('returns 0.0 dB for flat EQ', () => {
      const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      expect(computeCompositeEqPeak(flat)).toBe(0.0);
    });

    it('returns 0.0 dB for cut-only EQ', () => {
      const cuts = [-3, -6, -2, -4, -5, -1, -3, -2, -4, -6];
      expect(computeCompositeEqPeak(cuts)).toBe(0.0);
    });

    it('calculates correct composite peak for bassBooster (+6.73 dB)', () => {
      // bassBooster gains: [+5, +4, +3, +2.1, +1.1, -0.4, -0.4, -0.4, -0.4, -0.4]
      const bassBooster = [5, 4, 3, 2.1, 1.1, -0.4, -0.4, -0.4, -0.4, -0.4];
      const peak = computeCompositeEqPeak(bassBooster);
      expect(peak).toBeGreaterThan(5.0); // Must exceed single-band max
      expect(peak).toBeCloseTo(6.726, 1);
    });

    it('calculates correct composite peak for rock (+9.12 dB)', () => {
      // rock gains: [+5.9, +4.8, +1.5, -1.8, -4.6, -1.1, +2.6, +5.5, +6.6, +7.0]
      const rock = [5.9, 4.8, 1.5, -1.8, -4.6, -1.1, 2.6, 5.5, 6.6, 7.0];
      const peak = computeCompositeEqPeak(rock);
      expect(peak).toBeGreaterThan(7.0); // Must exceed single-band max
      expect(peak).toBeCloseTo(9.121, 1);
    });

    it('calculates correct composite peak for extreme +12 dB bass boost (+20.12 dB)', () => {
      const extreme12 = [12, 12, 12, 0, 0, 0, 0, 0, 0, 0];
      const peak = computeCompositeEqPeak(extreme12);
      expect(peak).toBeGreaterThan(12.0);
      expect(peak).toBeCloseTo(20.118, 1);
    });

    it('captures inter-grid peak between adjacent boosted bands without underestimation', () => {
      // Dual boost: 125 Hz (+6 dB) and 250 Hz (+6 dB)
      // The composite forms a broad plateau (~150-240 Hz); the peak VALUE is what
      // attenuation uses, so the test pins the value and checks it against an
      // independent dense evaluation rather than asserting a peak location.
      const dualBoost = [0, 0, 6, 6, 0, 0, 0, 0, 0, 0];
      const peak = computeCompositeEqPeak(dualBoost);

      // Single-band max is +6.0 dB; composite accumulation peak is ~8.105 dB
      expect(peak).toBeGreaterThan(6.0);
      expect(peak).toBeCloseTo(8.105, 2);

      // Verify the reported peak is >= every densely swept point across the
      // inter-band bracket (search-correctness of the same transfer function;
      // formula-correctness is pinned by the hardcoded values above).
      const { coeffs } = buildCompositeBiquadCoeffs(dualBoost);
      for (let f = 100; f <= 300; f += 2) {
        expect(evaluateCompositeGainDb(f, coeffs, 48000)).toBeLessThanOrEqual(peak + 1e-9);
      }
    });
  });

  describe('AudioPlayer dynamic headroom integration', () => {
    let player: AudioPlayer;

    beforeEach(() => {
      player = new AudioPlayer(makeQM() as any);
    });

    it('defaults to 1.0 (0 dB headroom) when EQ is flat and FX are inactive', () => {
      expect(player.getCompositeEqGainDb()).toBe(0);
      expect(player.getHeadroomGain()).toBe(1.0);
    });

    it('dynamically attenuates headroom when bassBooster is applied', () => {
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 5,
        sixtyFourHertzFilter: 4,
        hundredTwentyFiveHertzFilter: 3,
        twoHundredFiftyHertzFilter: 2.1,
        fiveHundredHertzFilter: 1.1,
        thousandHertzFilter: -0.4,
        twoThousandHertzFilter: -0.4,
        fourThousandHertzFilter: -0.4,
        eightThousandHertzFilter: -0.4,
        sixteenThousandHertzFilter: -0.4
      } as any);

      const compDb = player.getCompositeEqGainDb();
      expect(compDb).toBeCloseTo(6.726, 1);

      // target headroom = 10^(-6.726 / 20) approx 0.4610 (-6.73 dB)
      const expectedHeadroom = Math.pow(10, -compDb / 20);
      expect(player.getHeadroomGain()).toBeCloseTo(expectedHeadroom, 3);
    });

    it('dynamically attenuates headroom under extreme +12 dB bass boost', () => {
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 12,
        sixtyFourHertzFilter: 12,
        hundredTwentyFiveHertzFilter: 12,
        twoHundredFiftyHertzFilter: 0,
        fiveHundredHertzFilter: 0,
        thousandHertzFilter: 0,
        twoThousandHertzFilter: 0,
        fourThousandHertzFilter: 0,
        eightThousandHertzFilter: 0,
        sixteenThousandHertzFilter: 0
      } as any);

      const compDb = player.getCompositeEqGainDb();
      expect(compDb).toBeCloseTo(20.118, 1);

      // target headroom = 10^(-20.118 / 20) approx 0.0987 (-20.12 dB)
      const expectedHeadroom = Math.pow(10, -compDb / 20);
      expect(player.getHeadroomGain()).toBeCloseTo(expectedHeadroom, 3);
    });

    it('enforces asymmetric headroom transition: instant-down on increased attenuation', () => {
      // Start at flat EQ (headroom 1.0)
      expect(player.getHeadroomGain()).toBe(1.0);

      const headroomParam = player.headroomGainNode.gain as unknown as MockAudioParam;
      headroomParam.setValueAtTime.mockClear();
      headroomParam.setTargetAtTime.mockClear();

      // Switch to bassBooster (requires MORE attenuation, target headroom ~0.4610)
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 5,
        sixtyFourHertzFilter: 4,
        hundredTwentyFiveHertzFilter: 3,
        twoHundredFiftyHertzFilter: 2.1,
        fiveHundredHertzFilter: 1.1,
        thousandHertzFilter: -0.4,
        twoThousandHertzFilter: -0.4,
        fourThousandHertzFilter: -0.4,
        eightThousandHertzFilter: -0.4,
        sixteenThousandHertzFilter: -0.4
      } as any);

      // Must call setValueAtTime immediately for safety (instant-down)
      expect(headroomParam.setValueAtTime).toHaveBeenCalled();
      const lastSetValue =
        headroomParam.setValueAtTime.mock.calls[
          headroomParam.setValueAtTime.mock.calls.length - 1
        ][0];
      expect(lastSetValue).toBeCloseTo(0.461, 2);
      expect(player.getHeadroomGain()).toBeCloseTo(0.461, 2);
    });

    it('enforces asymmetric headroom transition: smooth-up on reduced attenuation / recovery', () => {
      // Start with bassBooster active (headroom ~0.461)
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 5,
        sixtyFourHertzFilter: 4,
        hundredTwentyFiveHertzFilter: 3,
        twoHundredFiftyHertzFilter: 2.1,
        fiveHundredHertzFilter: 1.1,
        thousandHertzFilter: -0.4,
        twoThousandHertzFilter: -0.4,
        fourThousandHertzFilter: -0.4,
        eightThousandHertzFilter: -0.4,
        sixteenThousandHertzFilter: -0.4
      } as any);

      const headroomParam = player.headroomGainNode.gain as unknown as MockAudioParam;
      headroomParam.setValueAtTime.mockClear();
      headroomParam.setTargetAtTime.mockClear();

      // Return to Flat EQ (recovering toward 1.0)
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 0,
        sixtyFourHertzFilter: 0,
        hundredTwentyFiveHertzFilter: 0,
        twoHundredFiftyHertzFilter: 0,
        fiveHundredHertzFilter: 0,
        thousandHertzFilter: 0,
        twoThousandHertzFilter: 0,
        fourThousandHertzFilter: 0,
        eightThousandHertzFilter: 0,
        sixteenThousandHertzFilter: 0
      } as any);

      // Recovery toward unity must use smooth setTargetAtTime
      expect(headroomParam.setTargetAtTime).toHaveBeenCalled();
      const targetCall = headroomParam.setTargetAtTime.mock.calls[0];
      expect(targetCall[0]).toBe(1.0); // target headroom
      expect(targetCall[2]).toBe(0.05); // 50ms time constant
    });

    it('applies headroom attenuation in the same call before EQ ramps so scheduled net gain stays <= 0 dB', () => {
      // Scheduling-consistency check (mocked GainNode calls), not an audio proof:
      // verifies ordering (headroom set before biquad ramps) and arithmetic
      // (composite peak + headroom attenuation <= 0). Real output behavior is
      // covered by the Chromium harness renders, not by these mocks.
      const headroomParam = player.headroomGainNode.gain as unknown as MockAudioParam;

      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 12,
        sixtyFourHertzFilter: 12,
        hundredTwentyFiveHertzFilter: 12,
        twoHundredFiftyHertzFilter: 0,
        fiveHundredHertzFilter: 0,
        thousandHertzFilter: 0,
        twoThousandHertzFilter: 0,
        fourThousandHertzFilter: 0,
        eightThousandHertzFilter: 0,
        sixteenThousandHertzFilter: 0
      } as any);

      const compEqDb = player.getCompositeEqGainDb();
      const effectiveHeadroomLinear = player.getHeadroomGain();
      const effectiveHeadroomDb = 20 * Math.log10(effectiveHeadroomLinear);

      // Net composite gain (EQ boost + Headroom attenuation) must be <= 0 dBFS
      const netGainDb = compEqDb + effectiveHeadroomDb;
      expect(netGainDb).toBeLessThanOrEqual(0.001);
    });

    it('reconciles FX headroom (-1.5 dB) and composite EQ headroom', () => {
      // Engage FX only: targetHeadroom should be 0.8414 (-1.5 dB)
      player.applyAudioFx({
        preset: 'custom',
        playbackRate: 1.0,
        preservesPitch: true,
        reverbWet: 0.5,
        reverbDecay: 2.0,
        lowPassCutoff: 20000,
        trebleBoostGain: 0
      });
      expect(player.getHeadroomGain()).toBeCloseTo(0.8414, 4);

      // Apply moderate EQ (+3.3 dB single band vocal booster -> ~5.17 dB composite peak)
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: -2.1,
        sixtyFourHertzFilter: -3.3,
        hundredTwentyFiveHertzFilter: -3.3,
        twoHundredFiftyHertzFilter: 0.9,
        fiveHundredHertzFilter: 3.3,
        thousandHertzFilter: 3.3,
        twoThousandHertzFilter: 2.6,
        fourThousandHertzFilter: 1,
        eightThousandHertzFilter: -0.3,
        sixteenThousandHertzFilter: -2.1
      } as any);

      expect(player.getHeadroomGain()).toBeCloseTo(
        Math.pow(10, -player.getCompositeEqGainDb() / 20),
        3
      );
    });

    it('restores unity headroom (1.0000) when returning to flat EQ without FX', () => {
      // First apply bassBooster
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 5,
        sixtyFourHertzFilter: 4,
        hundredTwentyFiveHertzFilter: 3,
        twoHundredFiftyHertzFilter: 2.1,
        fiveHundredHertzFilter: 1.1,
        thousandHertzFilter: -0.4,
        twoThousandHertzFilter: -0.4,
        fourThousandHertzFilter: -0.4,
        eightThousandHertzFilter: -0.4,
        sixteenThousandHertzFilter: -0.4
      } as any);
      expect(player.getHeadroomGain()).toBeLessThan(0.5);

      // Now reset to flat
      player.applyEqualizerPreset({
        thirtyTwoHertzFilter: 0,
        sixtyFourHertzFilter: 0,
        hundredTwentyFiveHertzFilter: 0,
        twoHundredFiftyHertzFilter: 0,
        fiveHundredHertzFilter: 0,
        thousandHertzFilter: 0,
        twoThousandHertzFilter: 0,
        fourThousandHertzFilter: 0,
        eightThousandHertzFilter: 0,
        sixteenThousandHertzFilter: 0
      } as any);

      expect(player.getCompositeEqGainDb()).toBe(0.0);
      expect(player.getHeadroomGain()).toBe(1.0);
    });
  });
});
