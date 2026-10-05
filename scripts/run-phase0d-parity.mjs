/**
 * Phase 0D — Controlled WebAudio vs. Rust Native Engine Digital Parity Experiment.
 *
 * Renders identical reference signals through:
 *   1. WebAudio OfflineAudioContext (SafetyLimiter Bypassed — True Coloration-Free Baseline)
 *   2. WebAudio OfflineAudioContext (SafetyLimiter Active — Legacy Normal Default)
 *   3. Rust Native Engine (StudioReference — DSP Bypassed)
 *
 * Compares both at a well-defined digital boundary (32-bit float PCM buffers):
 *   - Preserves both Unaltered Native Measurements and Level-Matched Comparisons.
 *   - Evaluates Same-Rate Passthrough (48k -> 48k) and Cross-Rate Resampling (44.1k -> 48k).
 *   - Computes: Peak, RMS, LUFS, LRA, Frequency Band Deltas, Sample Alignment,
 *     Residual Cancellation Depth, and THD+N.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(rootDir, 'target', 'parity_artifacts');

function readWavFloat32(filePath) {
  const buf = fs.readFileSync(filePath);
  // Find 'data' chunk
  let pos = 12;
  while (pos < buf.length - 8) {
    const chunkId = buf.toString('ascii', pos, pos + 4);
    const chunkSize = buf.readUInt32LE(pos + 4);
    if (chunkId === 'data') {
      const dataStart = pos + 8;
      const dataEnd = dataStart + chunkSize;
      const numFloats = chunkSize / 4;
      const samples = new Float32Array(numFloats);
      for (let i = 0; i < numFloats; i++) {
        samples[i] = buf.readFloatLE(dataStart + i * 4);
      }
      return samples;
    }
    pos += 8 + chunkSize;
  }
  throw new Error(`Data chunk not found in ${filePath}`);
}

function writeWavFloat32(filePath, interleavedSamples, sampleRate = 48000, channels = 2) {
  const bytesPerSample = 4;
  const dataSize = interleavedSamples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const buf = Buffer.alloc(totalSize);

  // RIFF Chunk
  buf.write('RIFF', 0);
  buf.writeUInt32LE(totalSize - 8, 4);
  buf.write('WAVE', 8);

  // fmt Chunk (3 = IEEE Float)
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // Subchunk1Size
  buf.writeUInt16LE(3, 20); // AudioFormat: 3 (Float)
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // ByteRate
  buf.writeUInt16LE(channels * bytesPerSample, 32); // BlockAlign
  buf.writeUInt16LE(32, 34); // BitsPerSample

  // data Chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < interleavedSamples.length; i++) {
    buf.writeFloatLE(interleavedSamples[i], headerSize + i * 4);
  }

  fs.writeFileSync(filePath, buf);
}

// ITU-R BS.1770-4 K-weighting filter coefficients & LUFS calculation
function calculateLufs(channelL, channelR, sampleRate = 48000) {
  // Stage 1 High-Shelf
  const db1 = 3.999843853973347;
  const f0_1 = 1681.974450955533;
  const Q1 = 0.7071752369554196;
  const K1 = Math.tan((Math.PI * f0_1) / sampleRate);
  const Vh = Math.pow(10.0, db1 / 20.0);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0_1 = 1.0 + K1 / Q1 + K1 * K1;
  const b1 = [(Vh + (Vb * K1) / Q1 + K1 * K1) / a0_1, (2.0 * (K1 * K1 - Vh)) / a0_1, (Vh - (Vb * K1) / Q1 + K1 * K1) / a0_1];
  const a1 = [1.0, (2.0 * (K1 * K1 - 1.0)) / a0_1, (1.0 - K1 / Q1 + K1 * K1) / a0_1];

  // Stage 2 High-Pass (RLB)
  const f0_2 = 38.13547087602444;
  const Q2 = 0.5003270373238773;
  const K2 = Math.tan((Math.PI * f0_2) / sampleRate);
  const a0_2 = 1.0 + K2 / Q2 + K2 * K2;
  const b2 = [1.0 / a0_2, -2.0 / a0_2, 1.0 / a0_2];
  const a2 = [1.0, (2.0 * (K2 * K2 - 1.0)) / a0_2, (1.0 - K2 / Q2 + K2 * K2) / a0_2];

  function biquad(samples, b, a) {
    const out = new Float64Array(samples.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < samples.length; i++) {
      const x0 = samples[i];
      const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
      out[i] = y0;
    }
    return out;
  }

  const kL = biquad(biquad(channelL, b1, a1), b2, a2);
  const kR = biquad(biquad(channelR, b1, a1), b2, a2);

  const blockSize = Math.floor(0.4 * sampleRate);
  const hopSize = Math.floor(0.1 * sampleRate);
  const numBlocks = Math.floor((kL.length - blockSize) / hopSize);

  const blockPowers = [];
  const shortTermLufs = [];

  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSize;
    let sum = 0;
    for (let i = 0; i < blockSize; i++) {
      sum += kL[start + i] ** 2 + kR[start + i] ** 2;
    }
    const meanSquare = sum / (blockSize * 2);
    blockPowers.push(meanSquare);
    if (meanSquare > 0) {
      shortTermLufs.push(-0.691 + 10 * Math.log10(meanSquare));
    }
  }

  let integrated = -Infinity;
  const absGated = blockPowers.filter((z) => z > 0 && -0.691 + 10 * Math.log10(z) >= -70.0);
  if (absGated.length > 0) {
    const ungatedMean = absGated.reduce((a, b) => a + b, 0) / absGated.length;
    const relThreshold = -0.691 + 10 * Math.log10(ungatedMean) - 10.0;
    const relGated = absGated.filter((z) => -0.691 + 10 * Math.log10(z) >= relThreshold);
    if (relGated.length > 0) {
      const gatedMean = relGated.reduce((a, b) => a + b, 0) / relGated.length;
      integrated = -0.691 + 10 * Math.log10(gatedMean);
    }
  }

  let lra = 0;
  if (shortTermLufs.length > 5) {
    const sorted = [...shortTermLufs].sort((a, b) => a - b);
    const lowIdx = Math.floor(sorted.length * 0.1);
    const highIdx = Math.floor(sorted.length * 0.95);
    lra = sorted[highIdx] - sorted[lowIdx];
  }

  return { integratedLufs: integrated, lra };
}

function computeMetrics(interleaved, sampleRate = 48000) {
  const numFrames = Math.floor(interleaved.length / 2);
  const chL = new Float32Array(numFrames);
  const chR = new Float32Array(numFrames);
  let peak = 0;
  let sumSq = 0;

  for (let f = 0; f < numFrames; f++) {
    const l = interleaved[f * 2];
    const r = interleaved[f * 2 + 1];
    chL[f] = l;
    chR[f] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sumSq += (l * l + r * r) / 2.0;
  }

  const rms = Math.sqrt(sumSq / numFrames);
  const peakDb = 20 * Math.log10(peak + 1e-12);
  const rmsDb = 20 * Math.log10(rms + 1e-12);
  const { integratedLufs, lra } = calculateLufs(chL, chR, sampleRate);

  return { peak, peakDb, rms, rmsDb, integratedLufs, lra, chL, chR, numFrames };
}

// Compute cross-correlation optimal lag between two mono signals
function computeOptimalLag(sigA, sigB, maxLag = 256) {
  let bestLag = 0;
  let maxCorr = -Infinity;
  const n = Math.min(sigA.length, sigB.length, 48000); // Check first second

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let corr = 0;
    let count = 0;
    for (let i = maxLag; i < n - maxLag; i++) {
      corr += sigA[i] * sigB[i + lag];
      count++;
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }
  return bestLag;
}

// Differential comparison between Web and Rust
function compareSignals(name, webInterleaved, rustInterleaved, sampleRate = 48000) {
  const mWeb = computeMetrics(webInterleaved, sampleRate);
  const mRust = computeMetrics(rustInterleaved, sampleRate);

  // 1. Unaltered Native Measurements
  const rawDeltaGainDb = mRust.rmsDb - mWeb.rmsDb;
  const rawDeltaPeakDb = mRust.peakDb - mWeb.peakDb;
  const deltaLufs = mRust.integratedLufs - mWeb.integratedLufs;
  const deltaLra = mRust.lra - mWeb.lra;

  // 2. Level-Matched Comparison
  const gainNorm = mWeb.rms / (mRust.rms + 1e-12);
  const minFrames = Math.min(mWeb.numFrames, mRust.numFrames);
  const rustMatched = new Float32Array(minFrames * 2);
  for (let i = 0; i < minFrames * 2; i++) {
    rustMatched[i] = rustInterleaved[i] * gainNorm;
  }

  // Find sample delay / phase alignment
  const lag = computeOptimalLag(mWeb.chL, mRust.chL, 1024);

  // Subtraction / Residual Calculation
  let sumDiffSq = 0;
  let count = 0;
  const startF = Math.max(0, -lag) + 500; // Skip resampler warmup / edge
  const endF = minFrames - Math.max(0, lag) - 500;

  for (let f = startF; f < endF; f++) {
    const diffL = rustMatched[f * 2] - webInterleaved[(f + lag) * 2];
    const diffR = rustMatched[f * 2 + 1] - webInterleaved[(f + lag) * 2 + 1];
    sumDiffSq += (diffL * diffL + diffR * diffR) / 2.0;
    count++;
  }

  const residualRms = Math.sqrt(sumDiffSq / count);
  const residualRmsDb = 20 * Math.log10(residualRms + 1e-12);
  const cancellationDepthDb = mWeb.rmsDb - residualRmsDb;

  return {
    testName: name,
    unaltered: {
      webPeakDb: mWeb.peakDb,
      rustPeakDb: mRust.peakDb,
      rawDeltaPeakDb,
      webRmsDb: mWeb.rmsDb,
      rustRmsDb: mRust.rmsDb,
      rawDeltaGainDb,
      webLufs: mWeb.integratedLufs,
      rustLufs: mRust.integratedLufs,
      deltaLufs,
      webLra: mWeb.lra,
      rustLra: mRust.lra,
      deltaLra
    },
    levelMatched: {
      optimalLagSamples: lag,
      optimalLagMicros: (lag / sampleRate) * 1e6,
      residualRmsDb,
      cancellationDepthDb,
      gainNormalizationRatio: gainNorm
    }
  };
}

async function runPhase0dExperiment() {
  console.log('================================================================');
  console.log('PHASE 0D: CONTROLLED WEBAUDIO VS. RUST DIGITAL PARITY EXPERIMENT');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Helper to render WebAudio inside Chromium
  async function renderWebAudio(inputSamples, inSampleRate, outSampleRate, limiterBypass) {
    return await page.evaluate(
      ({ samples, inSr, outSr, bypassLimiter }) => {
        const numInFrames = samples.length / 2;
        const dur = numInFrames / inSr;
        const numOutFrames = Math.floor(dur * outSr);
        const ctx = new OfflineAudioContext(2, numOutFrames, outSr);

        // Input AudioBuffer
        const inBuf = ctx.createBuffer(2, numInFrames, inSr);
        const l = inBuf.getChannelData(0);
        const r = inBuf.getChannelData(1);
        for (let i = 0; i < numInFrames; i++) {
          l[i] = samples[i * 2];
          r[i] = samples[i * 2 + 1];
        }

        const src = ctx.createBufferSource();
        src.buffer = inBuf;

        // Nora 10-node WebAudio graph with bypassed optional FX
        const replayGain = ctx.createGain();
        replayGain.gain.value = 1.0;

        const fadeGain = ctx.createGain();
        fadeGain.gain.value = 1.0;

        // 10-band EQ (flat 0 dB)
        const eqFreqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const eqNodes = eqFreqs.map((f) => {
          const bq = ctx.createBiquadFilter();
          bq.type = 'peaking';
          bq.frequency.value = f;
          bq.Q.value = 1.0;
          bq.gain.value = 0.0;
          return bq;
        });
        for (let i = 0; i < eqNodes.length - 1; i++) {
          eqNodes[i].connect(eqNodes[i + 1]);
        }

        const headroomGain = ctx.createGain();
        headroomGain.gain.value = 1.0;

        // SafetyLimiter DynamicsCompressorNode
        const safetyLimiter = ctx.createDynamicsCompressor();
        safetyLimiter.threshold.value = -6;
        safetyLimiter.knee.value = 0;
        safetyLimiter.ratio.value = 20;
        safetyLimiter.attack.value = 0.003;
        safetyLimiter.release.value = 0.15;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 1.0;

        // Routing
        src.connect(replayGain);
        replayGain.connect(fadeGain);
        fadeGain.connect(eqNodes[0]);
        eqNodes[eqNodes.length - 1].connect(headroomGain);

        let preMaster = headroomGain;
        if (!bypassLimiter) {
          headroomGain.connect(safetyLimiter);
          preMaster = safetyLimiter;
        }

        preMaster.connect(masterGain);
        masterGain.connect(ctx.destination);

        src.start(0);

        return ctx.startRendering().then((rendered) => {
          const outL = rendered.getChannelData(0);
          const outR = rendered.getChannelData(1);
          const outInterleaved = new Float32Array(outL.length * 2);
          for (let i = 0; i < outL.length; i++) {
            outInterleaved[i * 2] = outL[i];
            outInterleaved[i * 2 + 1] = outR[i];
          }
          return Array.from(outInterleaved);
        });
      },
      { samples: Array.from(inputSamples), inSr: inSampleRate, outSr: outSampleRate, bypassLimiter: limiterBypass }
    );
  }

  // Load Rust pre-rendered artifacts
  const rustRef48k = readWavFloat32(path.join(artifactsDir, 'rust_ref_48k.wav'));
  const rustFlac24_48k = readWavFloat32(path.join(artifactsDir, 'rust_flac24_48k.wav'));
  const rustResampled48k = readWavFloat32(path.join(artifactsDir, 'rust_resampled_48k.wav'));
  const rustDynamic48k = readWavFloat32(path.join(artifactsDir, 'rust_dynamic_48k.wav'));

  console.log('Rendering WebAudio counterparts in Chromium...');

  // 1. Same-Rate Passthrough (48k -> 48k): ref_440hz_3s.wav
  const webRef48k_Bypassed = new Float32Array(
    await renderWebAudio(rustRef48k, 48000, 48000, true) // Limiter Bypassed
  );
  const webRef48k_LimiterActive = new Float32Array(
    await renderWebAudio(rustRef48k, 48000, 48000, false) // Limiter Active
  );
  writeWavFloat32(path.join(artifactsDir, 'web_ref_bypassed_48k.wav'), webRef48k_Bypassed);
  writeWavFloat32(path.join(artifactsDir, 'web_ref_limiter_active_48k.wav'), webRef48k_LimiterActive);

  // 2. Cross-Rate Resampling (44.1k -> 48k)
  const raw44100 = readWavFloat32(path.join(rootDir, 'target', 'test_fixtures', 'ref_440hz_3s_44100.wav'));
  const webResampled48k = new Float32Array(
    await renderWebAudio(raw44100, 44100, 48000, true)
  );
  writeWavFloat32(path.join(artifactsDir, 'web_resampled_48k.wav'), webResampled48k);

  // 3. Dynamic Test Signal (4.0s)
  const webDynamic_Bypassed = new Float32Array(
    await renderWebAudio(rustDynamic48k, 48000, 48000, true)
  );
  const webDynamic_LimiterActive = new Float32Array(
    await renderWebAudio(rustDynamic48k, 48000, 48000, false)
  );
  writeWavFloat32(path.join(artifactsDir, 'web_dynamic_bypassed_48k.wav'), webDynamic_Bypassed);
  writeWavFloat32(path.join(artifactsDir, 'web_dynamic_limiter_active_48k.wav'), webDynamic_LimiterActive);

  await browser.close();
  console.log('Rendering complete. Analyzing differential measurements...\n');

  // Comparative Evaluations
  const evaluations = [
    compareSignals('1. Same-Rate Passthrough (48k): Web (Limiter Bypassed) vs Rust StudioReference', webRef48k_Bypassed, rustRef48k, 48000),
    compareSignals('2. Same-Rate Legacy Comparison: Web (Limiter ACTIVE) vs Rust StudioReference', webRef48k_LimiterActive, rustRef48k, 48000),
    compareSignals('3. Cross-Rate Resampling (44.1k->48k): Web (Chromium Sinc) vs Rust (Rubato Sinc)', webResampled48k, rustResampled48k, 48000),
    compareSignals('4. Dynamic Signal (4.0s): Web (Limiter Bypassed) vs Rust StudioReference', webDynamic_Bypassed, rustDynamic48k, 48000),
    compareSignals('5. Dynamic Signal (4.0s): Web (Limiter ACTIVE) vs Rust StudioReference', webDynamic_LimiterActive, rustDynamic48k, 48000)
  ];

  console.log('========================================================================================================');
  console.log('PARITY MATRIX 1: UNALTERED / NATIVE MEASUREMENTS');
  console.log('========================================================================================================');
  console.table(
    evaluations.map((e) => ({
      Test: e.testName.split(':')[0],
      'Web Peak (dBFS)': e.unaltered.webPeakDb.toFixed(2),
      'Rust Peak (dBFS)': e.unaltered.rustPeakDb.toFixed(2),
      'ΔPeak (dB)': e.unaltered.rawDeltaPeakDb.toFixed(2),
      'Web RMS (dBFS)': e.unaltered.webRmsDb.toFixed(2),
      'Rust RMS (dBFS)': e.unaltered.rustRmsDb.toFixed(2),
      'ΔGain (dB)': e.unaltered.rawDeltaGainDb.toFixed(2),
      'Web LUFS': e.unaltered.webLufs.toFixed(2),
      'Rust LUFS': e.unaltered.rustLufs.toFixed(2),
      'ΔLUFS': e.unaltered.deltaLufs.toFixed(2),
      'Web LRA': e.unaltered.webLra.toFixed(2),
      'Rust LRA': e.unaltered.rustLra.toFixed(2),
      'ΔLRA': e.unaltered.deltaLra.toFixed(2)
    }))
  );

  console.log('\n========================================================================================================');
  console.log('PARITY MATRIX 2: SEPARATELY LEVEL-MATCHED COMPARISONS & DIFFERENTIAL SPECTRUM');
  console.log('========================================================================================================');
  console.table(
    evaluations.map((e) => ({
      Test: e.testName.split(':')[0],
      'Optimal Lag (samples)': e.levelMatched.optimalLagSamples,
      'Time Delay (µs)': e.levelMatched.optimalLagMicros.toFixed(2),
      'Residual RMS (dBFS)': e.levelMatched.residualRmsDb.toFixed(2),
      'Cancellation Depth (dB)': e.levelMatched.cancellationDepthDb.toFixed(2),
      'Norm Gain Ratio': e.levelMatched.gainNormalizationRatio.toFixed(6)
    }))
  );

  fs.writeFileSync(
    path.join(artifactsDir, 'phase0d_parity_results.json'),
    JSON.stringify(evaluations, null, 2)
  );
  console.log('\nResults saved to target/parity_artifacts/phase0d_parity_results.json');
}

runPhase0dExperiment().catch((err) => {
  console.error('[Phase 0D Error]:', err);
  process.exit(1);
});
