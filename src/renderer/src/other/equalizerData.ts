import { LOCAL_STORAGE_DEFAULT_TEMPLATE } from './appReducer';

export const equalizerBandHertzData: Record<EqualizerBandFilters, number> = {
  thirtyTwoHertzFilter: 32,
  sixtyFourHertzFilter: 64,
  hundredTwentyFiveHertzFilter: 125,
  twoHundredFiftyHertzFilter: 250,
  fiveHundredHertzFilter: 500,
  thousandHertzFilter: 1000,
  twoThousandHertzFilter: 2000,
  fourThousandHertzFilter: 4000,
  eightThousandHertzFilter: 8000,
  sixteenThousandHertzFilter: 16000
};

export const equalizerPresetsData: EqualizerPresetsData = [
  {
    title: 'flat',
    preset: LOCAL_STORAGE_DEFAULT_TEMPLATE.equalizerPreset
  },
  {
    title: 'acoustic',
    preset: {
      thirtyTwoHertzFilter: 4.8,
      sixtyFourHertzFilter: 4.5,
      hundredTwentyFiveHertzFilter: 3.5,
      twoHundredFiftyHertzFilter: 0.4,
      fiveHundredHertzFilter: 1.8,
      thousandHertzFilter: 1.6,
      twoThousandHertzFilter: 3.3,
      fourThousandHertzFilter: 3.8,
      eightThousandHertzFilter: 3.3,
      sixteenThousandHertzFilter: 1.3
    }
  },
  {
    title: 'bassBooster',
    preset: {
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
    }
  },
  {
    title: 'bassReducer',
    preset: {
      thirtyTwoHertzFilter: -6.2,
      sixtyFourHertzFilter: -4.5,
      hundredTwentyFiveHertzFilter: -3.8,
      twoHundredFiftyHertzFilter: -3,
      fiveHundredHertzFilter: -1.6,
      thousandHertzFilter: -0.4,
      twoThousandHertzFilter: -0.4,
      fourThousandHertzFilter: -0.4,
      eightThousandHertzFilter: -0.4,
      sixteenThousandHertzFilter: -0.4
    }
  },
  {
    title: 'classical',
    preset: {
      thirtyTwoHertzFilter: 0,
      sixtyFourHertzFilter: 0,
      hundredTwentyFiveHertzFilter: 0,
      twoHundredFiftyHertzFilter: 0,
      fiveHundredHertzFilter: 0,
      thousandHertzFilter: 0,
      twoThousandHertzFilter: 0,
      fourThousandHertzFilter: -1.5,
      eightThousandHertzFilter: -3.7,
      sixteenThousandHertzFilter: -5.3
    }
  },
  {
    title: 'club',
    preset: {
      thirtyTwoHertzFilter: 0.1,
      sixtyFourHertzFilter: 0.1,
      hundredTwentyFiveHertzFilter: 2.3,
      twoHundredFiftyHertzFilter: 3.5,
      fiveHundredHertzFilter: 3.5,
      thousandHertzFilter: 3.5,
      twoThousandHertzFilter: 2.6,
      fourThousandHertzFilter: 0.1,
      eightThousandHertzFilter: 0.1,
      sixteenThousandHertzFilter: 0.2
    }
  },
  {
    title: 'dance',
    preset: {
      thirtyTwoHertzFilter: 6.8,
      sixtyFourHertzFilter: 5.3,
      hundredTwentyFiveHertzFilter: 4,
      twoHundredFiftyHertzFilter: 2,
      fiveHundredHertzFilter: 0,
      thousandHertzFilter: 0,
      twoThousandHertzFilter: 0,
      fourThousandHertzFilter: -3.1,
      eightThousandHertzFilter: -3.1,
      sixteenThousandHertzFilter: 0
    }
  },
  {
    title: 'deep',
    preset: {
      thirtyTwoHertzFilter: 4.5,
      sixtyFourHertzFilter: 3,
      hundredTwentyFiveHertzFilter: 1.3,
      twoHundredFiftyHertzFilter: 0.4,
      fiveHundredHertzFilter: 2.3,
      thousandHertzFilter: 1.8,
      twoThousandHertzFilter: 1.1,
      fourThousandHertzFilter: -2.8,
      eightThousandHertzFilter: -4,
      sixteenThousandHertzFilter: -5
    }
  },
  {
    title: 'electronic',
    preset: {
      thirtyTwoHertzFilter: 4,
      sixtyFourHertzFilter: 3.5,
      hundredTwentyFiveHertzFilter: 0.9,
      twoHundredFiftyHertzFilter: -0.6,
      fiveHundredHertzFilter: -2.6,
      thousandHertzFilter: 1.8,
      twoThousandHertzFilter: 0.4,
      fourThousandHertzFilter: 0.9,
      eightThousandHertzFilter: 3.5,
      sixteenThousandHertzFilter: 4.3
    }
  },
  {
    title: 'hipHop',
    preset: {
      thirtyTwoHertzFilter: 4.5,
      sixtyFourHertzFilter: 3.8,
      hundredTwentyFiveHertzFilter: 0.9,
      twoHundredFiftyHertzFilter: 2.3,
      fiveHundredHertzFilter: -1.3,
      thousandHertzFilter: -1.3,
      twoThousandHertzFilter: 1.1,
      fourThousandHertzFilter: -1.3,
      eightThousandHertzFilter: 1.8,
      sixteenThousandHertzFilter: 2.3
    }
  },
  {
    title: 'jazz',
    preset: {
      thirtyTwoHertzFilter: 3.8,
      sixtyFourHertzFilter: 2.3,
      hundredTwentyFiveHertzFilter: 0.9,
      twoHundredFiftyHertzFilter: 1.8,
      fiveHundredHertzFilter: -1.8,
      thousandHertzFilter: -1.8,
      twoThousandHertzFilter: -0.6,
      fourThousandHertzFilter: 1.1,
      eightThousandHertzFilter: 2.6,
      sixteenThousandHertzFilter: 3.5
    }
  },
  {
    title: 'latin',
    preset: {
      thirtyTwoHertzFilter: 4,
      sixtyFourHertzFilter: 2.3,
      hundredTwentyFiveHertzFilter: -0.6,
      twoHundredFiftyHertzFilter: -0.6,
      fiveHundredHertzFilter: -1.8,
      thousandHertzFilter: -1.8,
      twoThousandHertzFilter: -1.8,
      fourThousandHertzFilter: -0.4,
      eightThousandHertzFilter: 2.6,
      sixteenThousandHertzFilter: 4
    }
  },
  {
    title: 'live',
    preset: {
      thirtyTwoHertzFilter: -4.6,
      sixtyFourHertzFilter: -2.9,
      hundredTwentyFiveHertzFilter: -0.4,
      twoHundredFiftyHertzFilter: 1.8,
      fiveHundredHertzFilter: 3.1,
      thousandHertzFilter: 3.7,
      twoThousandHertzFilter: 3.7,
      fourThousandHertzFilter: 2.6,
      eightThousandHertzFilter: 1.3,
      sixteenThousandHertzFilter: 0.4
    }
  },
  {
    title: 'loudness',
    preset: {
      thirtyTwoHertzFilter: 5.2,
      sixtyFourHertzFilter: 3.5,
      hundredTwentyFiveHertzFilter: -0.6,
      twoHundredFiftyHertzFilter: -0.6,
      fiveHundredHertzFilter: -2.6,
      thousandHertzFilter: -0.4,
      twoThousandHertzFilter: -1.6,
      fourThousandHertzFilter: -5.5,
      eightThousandHertzFilter: 4.5,
      sixteenThousandHertzFilter: 0.4
    }
  },
  {
    title: 'lounge',
    preset: {
      thirtyTwoHertzFilter: -3.5,
      sixtyFourHertzFilter: -1.8,
      hundredTwentyFiveHertzFilter: -1.1,
      twoHundredFiftyHertzFilter: 0.9,
      fiveHundredHertzFilter: 3.5,
      thousandHertzFilter: 1.8,
      twoThousandHertzFilter: -0.4,
      fourThousandHertzFilter: -1.8,
      eightThousandHertzFilter: 1.8,
      sixteenThousandHertzFilter: 0.4
    }
  },
  {
    title: 'metal',
    preset: {
      thirtyTwoHertzFilter: -0.3,
      sixtyFourHertzFilter: 2.9,
      hundredTwentyFiveHertzFilter: 2.7,
      twoHundredFiftyHertzFilter: -0.7,
      fiveHundredHertzFilter: -2.7,
      thousandHertzFilter: -3.1,
      twoThousandHertzFilter: 0,
      fourThousandHertzFilter: 3.1,
      eightThousandHertzFilter: 5.7,
      sixteenThousandHertzFilter: 2.9
    }
  },
  {
    title: 'piano',
    preset: {
      thirtyTwoHertzFilter: 2.6,
      sixtyFourHertzFilter: 1.6,
      hundredTwentyFiveHertzFilter: -0.6,
      twoHundredFiftyHertzFilter: 2.1,
      fiveHundredHertzFilter: 2.6,
      thousandHertzFilter: 0.6,
      twoThousandHertzFilter: 3.3,
      fourThousandHertzFilter: 4,
      eightThousandHertzFilter: 2.3,
      sixteenThousandHertzFilter: 3
    }
  },
  {
    title: 'pop',
    preset: {
      thirtyTwoHertzFilter: -2.4,
      sixtyFourHertzFilter: -0.9,
      hundredTwentyFiveHertzFilter: 1.8,
      twoHundredFiftyHertzFilter: 3.5,
      fiveHundredHertzFilter: 4.6,
      thousandHertzFilter: 3.3,
      twoThousandHertzFilter: 1.5,
      fourThousandHertzFilter: 0,
      eightThousandHertzFilter: -0.9,
      sixteenThousandHertzFilter: -1.1
    }
  },
  {
    title: 'reggae',
    preset: {
      thirtyTwoHertzFilter: 0,
      sixtyFourHertzFilter: 0,
      hundredTwentyFiveHertzFilter: 0,
      twoHundredFiftyHertzFilter: -1.3,
      fiveHundredHertzFilter: -3.7,
      thousandHertzFilter: -0.7,
      twoThousandHertzFilter: 2,
      fourThousandHertzFilter: 3.3,
      eightThousandHertzFilter: 1.8,
      sixteenThousandHertzFilter: 0
    }
  },
  {
    title: 'rnb',
    preset: {
      thirtyTwoHertzFilter: 2.1,
      sixtyFourHertzFilter: 6.2,
      hundredTwentyFiveHertzFilter: 5.5,
      twoHundredFiftyHertzFilter: 1.1,
      fiveHundredHertzFilter: -2.8,
      thousandHertzFilter: -1.8,
      twoThousandHertzFilter: 2.1,
      fourThousandHertzFilter: 2.6,
      eightThousandHertzFilter: 2.3,
      sixteenThousandHertzFilter: 3.5
    }
  },
  {
    title: 'rock',
    preset: {
      thirtyTwoHertzFilter: 5.9,
      sixtyFourHertzFilter: 4.8,
      hundredTwentyFiveHertzFilter: 1.5,
      twoHundredFiftyHertzFilter: -1.8,
      fiveHundredHertzFilter: -4.6,
      thousandHertzFilter: -1.1,
      twoThousandHertzFilter: 2.6,
      fourThousandHertzFilter: 5.5,
      eightThousandHertzFilter: 6.6,
      sixteenThousandHertzFilter: 7
    }
  },
  {
    title: 'ska',
    preset: {
      thirtyTwoHertzFilter: -1.8,
      sixtyFourHertzFilter: -3,
      hundredTwentyFiveHertzFilter: -2.8,
      twoHundredFiftyHertzFilter: -0.4,
      fiveHundredHertzFilter: 2.6,
      thousandHertzFilter: 3.5,
      twoThousandHertzFilter: 5.5,
      fourThousandHertzFilter: 6,
      eightThousandHertzFilter: 6.5,
      sixteenThousandHertzFilter: 6
    }
  },
  {
    title: 'smallSpeakers',
    preset: {
      thirtyTwoHertzFilter: 4.8,
      sixtyFourHertzFilter: 3.5,
      hundredTwentyFiveHertzFilter: 3,
      twoHundredFiftyHertzFilter: 1.8,
      fiveHundredHertzFilter: 0.4,
      thousandHertzFilter: -0.6,
      twoThousandHertzFilter: -1.6,
      fourThousandHertzFilter: -3,
      eightThousandHertzFilter: -4,
      sixteenThousandHertzFilter: -4.5
    }
  },
  {
    title: 'soft',
    preset: {
      thirtyTwoHertzFilter: 3,
      sixtyFourHertzFilter: 0.9,
      hundredTwentyFiveHertzFilter: -0.9,
      twoHundredFiftyHertzFilter: -1.8,
      fiveHundredHertzFilter: -1.1,
      thousandHertzFilter: 2.8,
      twoThousandHertzFilter: 5.2,
      fourThousandHertzFilter: 6,
      eightThousandHertzFilter: 6.5,
      sixteenThousandHertzFilter: 7.2
    }
  },
  {
    title: 'softRock',
    preset: {
      thirtyTwoHertzFilter: 2.6,
      sixtyFourHertzFilter: 2.6,
      hundredTwentyFiveHertzFilter: 1.3,
      twoHundredFiftyHertzFilter: -0.4,
      fiveHundredHertzFilter: -2.8,
      thousandHertzFilter: -3.5,
      twoThousandHertzFilter: -2.6,
      fourThousandHertzFilter: -0.4,
      eightThousandHertzFilter: 1.8,
      sixteenThousandHertzFilter: 2.6
    }
  },
  {
    title: 'spokenWord',
    preset: {
      thirtyTwoHertzFilter: -4.3,
      sixtyFourHertzFilter: -1.1,
      hundredTwentyFiveHertzFilter: -0.4,
      twoHundredFiftyHertzFilter: 0.1,
      fiveHundredHertzFilter: 3,
      thousandHertzFilter: 4.3,
      twoThousandHertzFilter: 4.8,
      fourThousandHertzFilter: 3.8,
      eightThousandHertzFilter: 1.8,
      sixteenThousandHertzFilter: -0.6
    }
  },
  {
    title: 'techno',
    preset: {
      thirtyTwoHertzFilter: 4.8,
      sixtyFourHertzFilter: 3.5,
      hundredTwentyFiveHertzFilter: 0.1,
      twoHundredFiftyHertzFilter: -3.5,
      fiveHundredHertzFilter: -3,
      thousandHertzFilter: 0.1,
      twoThousandHertzFilter: 4.8,
      fourThousandHertzFilter: 6,
      eightThousandHertzFilter: 6,
      sixteenThousandHertzFilter: 5.7
    }
  },
  {
    title: 'trebleBooster',
    preset: {
      thirtyTwoHertzFilter: -0.4,
      sixtyFourHertzFilter: -0.4,
      hundredTwentyFiveHertzFilter: -0.4,
      twoHundredFiftyHertzFilter: -0.4,
      fiveHundredHertzFilter: -0.4,
      thousandHertzFilter: 0.6,
      twoThousandHertzFilter: 2.1,
      fourThousandHertzFilter: 3.3,
      eightThousandHertzFilter: 3.8,
      sixteenThousandHertzFilter: 5.2
    }
  },
  {
    title: 'trebleReducer',
    preset: {
      thirtyTwoHertzFilter: -0.4,
      sixtyFourHertzFilter: -0.4,
      hundredTwentyFiveHertzFilter: -0.4,
      twoHundredFiftyHertzFilter: -0.4,
      fiveHundredHertzFilter: -0.4,
      thousandHertzFilter: -1.6,
      twoThousandHertzFilter: -3,
      fourThousandHertzFilter: -4,
      eightThousandHertzFilter: -4.8,
      sixteenThousandHertzFilter: -5.5
    }
  },
  {
    title: 'vocalBooster',
    preset: {
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
    }
  }
];


interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Builds normalized RBJ peaking coefficients for the active (non-flat) bands.
 * Shared by computeCompositeEqPeak and test verification so both evaluate the
 * identical filter set. Exported for tests; no production behavior change.
 */
export function buildCompositeBiquadCoeffs(
  gains: number[],
  sampleRate = 48000,
  q = 1.0,
  centers: number[] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
): { coeffs: BiquadCoeffs[]; boostedCenters: number[] } {
  const activeCoeffs: BiquadCoeffs[] = [];
  const boostedCenters: number[] = [];
  for (let i = 0; i < gains.length && i < centers.length; i++) {
    const g = gains[i];
    if (Math.abs(g) < 1e-4) continue;
    const f0 = centers[i];
    if (g > 1e-4) {
      boostedCenters.push(f0);
    }
    const a = Math.pow(10, g / 40);
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);

    const b0 = 1 + alpha * a;
    const b1 = -2 * Math.cos(w0);
    const b2 = 1 - alpha * a;
    const a0 = 1 + alpha / a;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha / a;

    activeCoeffs.push({
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0
    });
  }
  return { coeffs: activeCoeffs, boostedCenters };
}

/**
 * Evaluates the composite gain in dB of cascaded biquads at frequency f.
 * Exported for test verification of per-frequency bounds (no production use).
 */
export function evaluateCompositeGainDb(f: number, coeffs: BiquadCoeffs[], sampleRate: number): number {
  const w = (2 * Math.PI * f) / sampleRate;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);

  let compositeDb = 0.0;
  for (let k = 0; k < coeffs.length; k++) {
    const c = coeffs[k];
    const numR = c.b0 + c.b1 * c1 + c.b2 * c2;
    const numI = -(c.b1 * s1 + c.b2 * s2);
    const denR = 1.0 + c.a1 * c1 + c.a2 * c2;
    const denI = -(c.a1 * s1 + c.a2 * s2);

    const magSq = (numR * numR + numI * numI) / (denR * denR + denI * denI);
    compositeDb += 10.0 * Math.log10(magSq);
  }
  return compositeDb;
}

/**
 * Golden Section Search to find the local maximum of evaluateCompositeGainDb
 * in the continuous frequency bracket [low, high].
 */
function goldenSectionMaximize(
  low: number,
  high: number,
  coeffs: BiquadCoeffs[],
  sampleRate: number,
  iterations = 30
): { peakDb: number; peakFreqHz: number } {
  const phi = (Math.sqrt(5) - 1) / 2; // ~0.6180339887
  let a = Math.min(low, high);
  let b = Math.max(low, high);
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = evaluateCompositeGainDb(c, coeffs, sampleRate);
  let fd = evaluateCompositeGainDb(d, coeffs, sampleRate);

  for (let iter = 0; iter < iterations; iter++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - phi * (b - a);
      fc = evaluateCompositeGainDb(c, coeffs, sampleRate);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + phi * (b - a);
      fd = evaluateCompositeGainDb(d, coeffs, sampleRate);
    }
  }

  const mid = (a + b) / 2;
  const fMid = evaluateCompositeGainDb(mid, coeffs, sampleRate);
  let bestDb = fMid;
  let bestFreq = mid;
  if (fc > bestDb) {
    bestDb = fc;
    bestFreq = c;
  }
  if (fd > bestDb) {
    bestDb = fd;
    bestFreq = d;
  }
  return { peakDb: bestDb, peakFreqHz: bestFreq };
}

/**
 * Gate 3.2: Compute the maximum composite gain G_composite in dB across the continuous frequency spectrum
 * for 10 cascaded peaking biquads with Robert Bristow-Johnson (RBJ) coefficient design.
 *
 * SCOPE (read before relying on this value): the returned peak is the H-infinity
 * (steady-state sinusoidal) norm of the cascade. Attenuating by 1/H_inf bounds
 * sinusoidal steady-state outputs and all empirically tested fixtures to <= 0 dBFS,
 * but it is NOT a universal L_inf sample-peak bound: the worst-case peak gain over
 * arbitrary bounded inputs is the l1 norm of the impulse response, which exceeds
 * H_inf for ringing cascades (documented adversarial case: rock preset, +7.13 dB
 * above the H_inf bound for a sign-matched input). Do not restate this value as
 * "output <= 1 for all inputs".
 *
 * Architecture:
 * 1. Fast-path check: returns 0.0 dB if no bands have positive boost.
 * 2. 1000-point logarithmic coarse frequency grid + explicit center and geometric midpoint evaluation.
 * 3. Local extrema detection identifying all candidate peak brackets [f_{i-1}, f_{i+1}].
 * 4. Golden Section local refinement (30 iterations per bracket) providing a conservative
 *    numerical peak estimate validated against fine-grid probes and explicit critical-frequency candidates.
 *
 * Used for dynamic headroom gain staging: A_headroom = min(1.0, 10^(-G_composite / 20)).
 */
export function computeCompositeEqPeak(
  gains: number[],
  sampleRate = 48000,
  q = 1.0,
  centers: number[] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
): number {
  let hasBoost = false;
  for (let i = 0; i < gains.length; i++) {
    if (gains[i] > 1e-4) {
      hasBoost = true;
      break;
    }
  }
  if (!hasBoost) {
    return 0.0;
  }

  const { coeffs: activeCoeffs, boostedCenters } = buildCompositeBiquadCoeffs(
    gains,
    sampleRate,
    q,
    centers
  );

  if (activeCoeffs.length === 0) return 0.0;

  const numGridPoints = 1000;
  const minFreq = 10.0;
  const maxFreq = Math.min(22000.0, sampleRate * 0.48);

  const freqGrid: number[] = [];
  const gainGrid: number[] = [];

  for (let i = 0; i < numGridPoints; i++) {
    const f = minFreq * Math.pow(maxFreq / minFreq, i / (numGridPoints - 1));
    freqGrid.push(f);
    gainGrid.push(evaluateCompositeGainDb(f, activeCoeffs, sampleRate));
  }

  // Also include explicit center frequencies and geometric midpoints between active bands
  for (let i = 0; i < boostedCenters.length; i++) {
    const fc = boostedCenters[i];
    freqGrid.push(fc);
    gainGrid.push(evaluateCompositeGainDb(fc, activeCoeffs, sampleRate));
    if (i < boostedCenters.length - 1) {
      const fMid = Math.sqrt(fc * boostedCenters[i + 1]);
      freqGrid.push(fMid);
      gainGrid.push(evaluateCompositeGainDb(fMid, activeCoeffs, sampleRate));
    }
  }

  let maxCompositeDb = 0.0;

  // 1. Check all discrete sampled points
  for (let i = 0; i < gainGrid.length; i++) {
    if (gainGrid[i] > maxCompositeDb) {
      maxCompositeDb = gainGrid[i];
    }
  }

  // 2. Identify local maxima on the coarse grid and perform continuous Golden Section Search
  for (let i = 1; i < numGridPoints - 1; i++) {
    if (gainGrid[i] >= gainGrid[i - 1] && gainGrid[i] >= gainGrid[i + 1]) {
      const low = freqGrid[i - 1];
      const high = freqGrid[i + 1];
      const refined = goldenSectionMaximize(low, high, activeCoeffs, sampleRate, 30);
      if (refined.peakDb > maxCompositeDb) {
        maxCompositeDb = refined.peakDb;
      }
    }
  }

  // 3. Search continuous neighborhood around each boosted center frequency
  for (const fc of boostedCenters) {
    const low = Math.max(minFreq, fc * 0.7);
    const high = Math.min(maxFreq, fc * 1.4);
    const refined = goldenSectionMaximize(low, high, activeCoeffs, sampleRate, 30);
    if (refined.peakDb > maxCompositeDb) {
      maxCompositeDb = refined.peakDb;
    }
  }

  return Math.max(0.0, maxCompositeDb);
}
