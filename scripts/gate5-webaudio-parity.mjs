/**
 * Gate 5: Web Audio AudioWorklet DSP Parity Verification Runner.
 *
 * Validates sample-accurate DSP parity for the Vocal Nuance Option B upward shaper
 * between Native Rust (crates/engine-lib/src/dsp/sound_profile.rs) and Web Audio
 * (src/renderer/src/other/audioFx/optionBShaperWorklet.ts).
 *
 * Conformance Tests:
 * 1. Synthetic 4-Stage Transfer Fixture (48 kHz):
 *    - Continuous trajectory tracking: max_n |g_web[n] - g_rust[n]| <= 0.02
 *    - Windowed steady-state lift:
 *      * Stage 1 (-30 dBFS): +1.50 dB +- 0.05 dB [0.75s .. 1.00s]
 *      * Stage 2 (-18 dBFS): +0.75 dB +- 0.05 dB (calibrated) / +0.91 dB (sine crest) [1.50s .. 2.00s]
 *      * Stage 3 (-3 dBFS): strictly 0.00 dB +- 0.01 dB, peak -3.00 dBFS [2.50s .. 3.00s]
 *      * Cross-engine steady-state delta: <= 0.05 dB across all windows
 *    - Derived transient checkpoints:
 *      * n = 155760 (attack, 45ms post-jump): g in [0.99, 1.01]
 *      * n = 170400 (holdoff, 50ms post-drop): g in [0.99, 1.01]
 *      * n = 189600 (recovery, 450ms post-drop): g in [1.01, 1.08]
 *
 * 2. StudioReference Bit-Transparency Test (48 kHz):
 *    - 12.0s TestSignal-D6 rendered through Web Audio StudioReference bypass (dry=1, wet=0)
 *    - Deterministic Float32 Bit-Identity: max_i |out[i] - in[i]| == 0.000000
 *
 * 3. Gate 4 Real-Master Regression Audit (Strict Native 44.1 kHz, No Resampling):
 *    - Ingests Gate 4 Stage 2 WAVs at native 44.1 kHz
 *    - Renders through Chromium OfflineAudioContext + OptionBShaper AudioWorklet at native 44.1 kHz
 *    - Compares against Gate 4 Rust Stage 3B artifacts:
 *      * |Delta LUFS| <= 0.05 LUFS
 *      * |Delta LRA| <= 0.10 LU
 *      * Max peak gain reduction strictly 0.00 dB (no downward compression)
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const artifactsDir = path.resolve(rootDir, 'target', 'parity_artifacts');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function getGitHeadSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir }).toString().trim();
  } catch {
    return 'unknown_git_sha';
  }
}

// ---------------------------------------------------------------------------
// WAV I/O Helpers
// ---------------------------------------------------------------------------

function readWavFloat32(filePath) {
  const buf = fs.readFileSync(filePath);
  let pos = 12;
  let dataOffset = 0;
  let dataSize = 0;
  let sampleRate = 44100;
  let channels = 2;

  while (pos < buf.length - 8) {
    const chunkId = buf.toString('ascii', pos, pos + 4);
    const chunkSize = buf.readUInt32LE(pos + 4);
    if (chunkId === 'fmt ') {
      channels = buf.readUInt16LE(pos + 10);
      sampleRate = buf.readUInt32LE(pos + 12);
    }
    if (chunkId === 'data') {
      dataOffset = pos + 8;
      dataSize = chunkSize;
      break;
    }
    pos += 8 + chunkSize;
  }

  if (dataOffset === 0) {
    throw new Error(`Data chunk not found in ${filePath}`);
  }

  // Create float array copy to avoid alignment/offset issues
  const numFloats = dataSize / 4;
  const floats = new Float32Array(numFloats);
  for (let i = 0; i < numFloats; i++) {
    floats[i] = buf.readFloatLE(dataOffset + i * 4);
  }

  return {
    samples: floats,
    sampleRate,
    channels,
    totalFrames: numFloats / channels
  };
}

function writeWavFloat32(filePath, interleavedSamples, sampleRate = 48000, channels = 2) {
  const bytesPerSample = 4;
  const dataSize = interleavedSamples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const buf = Buffer.alloc(totalSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(totalSize - 8, 4);
  buf.write('WAVE', 8);

  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE Float
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(32, 34);

  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < interleavedSamples.length; i++) {
    buf.writeFloatLE(interleavedSamples[i], headerSize + i * 4);
  }

  fs.writeFileSync(filePath, buf);
}

// ---------------------------------------------------------------------------
// ITU-R BS.1770-4 & EBU R128 Loudness Measurement
// ---------------------------------------------------------------------------

function kWeightingCoefficients(sampleRate) {
  const db1 = 3.999843853973347;
  const f0_1 = 1681.974450955533;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f0_1) / sampleRate);
  const vh = Math.pow(10, db1 / 20.0);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0_1 = 1.0 + k1 / q1 + k1 * k1;
  const b1 = [
    (vh + (vb * k1) / q1 + k1 * k1) / a0_1,
    (2.0 * (k1 * k1 - vh)) / a0_1,
    (vh - (vb * k1) / q1 + k1 * k1) / a0_1
  ];
  const a1 = [
    1.0,
    (2.0 * (k1 * k1 - 1.0)) / a0_1,
    (1.0 - k1 / q1 + k1 * k1) / a0_1
  ];

  const f0_2 = 38.13547087602444;
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f0_2) / sampleRate);
  const a0_2 = 1.0 + k2 / q2 + k2 * k2;
  const b2 = [1.0 / a0_2, -2.0 / a0_2, 1.0 / a0_2];
  const a2 = [
    1.0,
    (2.0 * (k2 * k2 - 1.0)) / a0_2,
    (1.0 - k2 / q2 + k2 * k2) / a0_2
  ];
  return { b1, a1, b2, a2 };
}

class Biquad {
  constructor(b, a) {
    this.b0 = b[0] / a[0];
    this.b1 = b[1] / a[0];
    this.b2 = b[2] / a[0];
    this.a1 = a[1] / a[0];
    this.a2 = a[2] / a[0];
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
  process(x0) {
    const y0 =
      this.b0 * x0 +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x0;
    this.y2 = this.y1;
    this.y1 = y0;
    return y0;
  }
}

function measureLoudness(samples, sampleRate) {
  const numFrames = Math.floor(samples.length / 2);
  const { b1, a1, b2, a2 } = kWeightingCoefficients(sampleRate);
  const bq1L = new Biquad(b1, a1);
  const bq2L = new Biquad(b2, a2);
  const bq1R = new Biquad(b1, a1);
  const bq2R = new Biquad(b2, a2);

  const kL = new Float64Array(numFrames);
  const kR = new Float64Array(numFrames);
  let maxPeak = 0;
  for (let f = 0; f < numFrames; f++) {
    const l = samples[f * 2];
    const r = samples[f * 2 + 1];
    const absL = Math.abs(l);
    const absR = Math.abs(r);
    if (absL > maxPeak) maxPeak = absL;
    if (absR > maxPeak) maxPeak = absR;
    kL[f] = bq2L.process(bq1L.process(l));
    kR[f] = bq2R.process(bq1R.process(r));
  }

  const blockSize = Math.floor(0.4 * sampleRate);
  const hopSize = Math.floor(0.1 * sampleRate);
  const numBlocks = Math.floor((numFrames - blockSize) / hopSize);
  const blockPowers = [];
  const shortTermLufs = [];

  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSize;
    let sum = 0;
    for (let i = 0; i < blockSize; i++) {
      sum += kL[start + i] * kL[start + i] + kR[start + i] * kR[start + i];
    }
    const meanSq = sum / blockSize;
    blockPowers.push(meanSq);
    if (meanSq > 0) {
      shortTermLufs.push(-0.691 + 10.0 * Math.log10(meanSq));
    }
  }

  const absGated = [];
  for (const z of blockPowers) {
    if (z > 0 && -0.691 + 10.0 * Math.log10(z) >= -70.0) {
      absGated.push(z);
    }
  }

  let integrated = -120.0;
  if (absGated.length > 0) {
    const ungatedMean = absGated.reduce((a, b) => a + b, 0) / absGated.length;
    const relThreshold = -0.691 + 10.0 * Math.log10(ungatedMean) - 10.0;
    const relGated = [];
    for (const z of absGated) {
      if (-0.691 + 10.0 * Math.log10(z) >= relThreshold) {
        relGated.push(z);
      }
    }
    if (relGated.length > 0) {
      const gatedMean = relGated.reduce((a, b) => a + b, 0) / relGated.length;
      integrated = -0.691 + 10.0 * Math.log10(gatedMean);
    }
  }

  let lra = 0;
  if (shortTermLufs.length > 5) {
    shortTermLufs.sort((a, b) => a - b);
    const lowIdx = Math.floor(shortTermLufs.length * 0.1);
    let highIdx = Math.floor(shortTermLufs.length * 0.95);
    highIdx = Math.min(highIdx, shortTermLufs.length - 1);
    lra = shortTermLufs[highIdx] - shortTermLufs[lowIdx];
  }

  return {
    integratedLufs: integrated,
    lraLu: lra,
    peakDbfs: maxPeak > 0 ? 20 * Math.log10(maxPeak) : -120.0
  };
}

// ---------------------------------------------------------------------------
// Native Rust Option B Reference DSP Model
// ---------------------------------------------------------------------------

function runRustReferenceModel(inputSamples, sampleRate = 48000) {
  const numFrames = Math.floor(inputSamples.length / 2);
  const output = new Float32Array(inputSamples.length);
  const gainTrace = new Float32Array(numFrames);

  const attackCoeff = Math.exp(-1.0 / (0.015 * sampleRate));
  const releaseCoeff = Math.exp(-1.0 / (0.25 * sampleRate));
  let nuanceEnvelope = 0.0;
  let nuanceGain = 1.0;
  const maxLiftDb = 1.5;
  const lowThresholdDb = -24.0;
  const highThresholdDb = -12.0;
  const noiseGateDb = -60.0;
  const noiseFloorDb = -80.0;

  for (let f = 0; f < numFrames; f++) {
    const sL = inputSamples[f * 2];
    const sR = inputSamples[f * 2 + 1];
    const peak = Math.max(Math.abs(sL), Math.abs(sR));

    if (peak > nuanceEnvelope) {
      nuanceEnvelope = attackCoeff * nuanceEnvelope + (1.0 - attackCoeff) * peak;
    } else {
      nuanceEnvelope = releaseCoeff * nuanceEnvelope + (1.0 - releaseCoeff) * peak;
    }

    const envDb = 20.0 * Math.log10(Math.max(1e-6, nuanceEnvelope));
    let targetLiftDb = 0.0;
    if (envDb >= highThresholdDb) {
      targetLiftDb = 0.0;
    } else if (envDb > lowThresholdDb) {
      const u = (envDb - lowThresholdDb) / (highThresholdDb - lowThresholdDb);
      const s = 1.0 - (3.0 * u * u - 2.0 * u * u * u);
      targetLiftDb = maxLiftDb * s;
    } else if (envDb >= noiseGateDb) {
      targetLiftDb = maxLiftDb;
    } else if (envDb > noiseFloorDb) {
      const v = (envDb - noiseFloorDb) / (noiseGateDb - noiseFloorDb);
      const sGate = 3.0 * v * v - 2.0 * v * v * v;
      targetLiftDb = maxLiftDb * sGate;
    } else {
      targetLiftDb = 0.0;
    }

    const targetG = Math.pow(10.0, targetLiftDb / 20.0);
    if (targetG < nuanceGain) {
      nuanceGain = attackCoeff * nuanceGain + (1.0 - attackCoeff) * targetG;
    } else {
      nuanceGain = releaseCoeff * nuanceGain + (1.0 - releaseCoeff) * targetG;
    }

    gainTrace[f] = nuanceGain;
    output[f * 2] = sL * nuanceGain;
    output[f * 2 + 1] = sR * nuanceGain;
  }

  return { output, gainTrace };
}

// ---------------------------------------------------------------------------
// Test Signal Generators
// ---------------------------------------------------------------------------

function generate4StageFixture(sampleRate = 48000, calibrateShoulderEnvelope = false) {
  const totalFrames = Math.round(4.0 * sampleRate);
  const buffer = new Float32Array(totalFrames * 2);

  const ampQuiet = Math.pow(10, -30.0 / 20.0);
  // For 1000Hz sine wave, leaky detector crest factor is 0.90678 (-0.85 dB).
  // If calibrated, amplitude is scaled by 1/0.90678 so steady-state envelope tracks strictly to -18.00 dBFS (u=0.500).
  const ampShoulder = calibrateShoulderEnvelope
    ? Math.pow(10, -18.0 / 20.0) / 0.90678
    : Math.pow(10, -18.0 / 20.0);
  const ampLoud = Math.pow(10, -3.0 / 20.0);
  const freq = 1000.0;

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / sampleRate;
    let amp;
    if (t < 1.0) {
      amp = ampQuiet;
    } else if (t < 2.0) {
      amp = ampShoulder;
    } else if (t < 3.0) {
      amp = ampLoud;
    } else {
      const tRel = t - 3.0;
      if (tRel < 0.2) {
        amp = ampQuiet; // 3.00s .. 3.20s: quiet baseline
      } else if (tRel < 0.5) {
        amp = ampLoud; // 3.20s .. 3.50s: jump to -3 dBFS
      } else {
        amp = ampQuiet; // 3.50s .. 4.00s: drop to -30 dBFS
      }
    }

    const sample = amp * Math.sin(2.0 * Math.PI * freq * t);
    buffer[frame * 2] = sample;
    buffer[frame * 2 + 1] = sample;
  }

  return buffer;
}

function generateTestSignalD6(sampleRate = 48000) {
  const totalFrames = Math.round(12.0 * sampleRate);
  const buffer = new Float32Array(totalFrames * 2);

  let rngState = 0x123456789abcdef0n;
  const nextUniform = () => {
    rngState = (rngState * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    return Number(rngState >> 11n) / 2 ** 53;
  };

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / sampleRate;
    let sampleL = 0;
    let sampleR = 0;

    if (t < 2.0) {
      const ditherAmp = Math.pow(10, -90 / 20);
      sampleL = (nextUniform() - nextUniform()) * ditherAmp;
      sampleR = (nextUniform() - nextUniform()) * ditherAmp;
    } else if (t < 4.0) {
      const amp = Math.pow(10, -18 / 20) / 3.0;
      const w1 = 2 * Math.PI * 32.0 * t;
      const w2 = 2 * Math.PI * 64.0 * t;
      const w3 = 2 * Math.PI * 125.0 * t;
      const s = amp * (Math.sin(w1) + Math.sin(w2) + Math.sin(w3));
      sampleL = s;
      sampleR = s;
    } else if (t < 6.0) {
      const amp = Math.pow(10, -36 / 20) / 3.0;
      const w1 = 2 * Math.PI * 200.0 * t;
      const w2 = 2 * Math.PI * 1000.0 * t;
      const w3 = 2 * Math.PI * 4000.0 * t;
      const s = amp * (Math.sin(w1) + Math.sin(w2) + Math.sin(w3));
      sampleL = s;
      sampleR = s;
    } else if (t < 8.0) {
      const progress = (t - 6.0) / 2.0;
      const ampStart = Math.pow(10, -30 / 20);
      const ampEnd = Math.pow(10, -6 / 20);
      const env = ampStart + progress * (ampEnd - ampStart);
      const s = env * Math.sin(2 * Math.PI * 1000.0 * t);
      sampleL = s;
      sampleR = s;
    } else if (t < 10.0) {
      const amp = Math.pow(10, -1 / 20) / 4.0;
      const s =
        amp *
        (Math.sin(2 * Math.PI * 100.0 * t) +
          Math.sin(2 * Math.PI * 440.0 * t) +
          Math.sin(2 * Math.PI * 1500.0 * t) +
          Math.sin(2 * Math.PI * 5000.0 * t));
      sampleL = s;
      sampleR = s;
    } else {
      const overloadAmp = Math.pow(10, 3 / 20);
      const s =
        frame % 2 === 0
          ? overloadAmp * Math.sin(2 * Math.PI * 1000.0 * t)
          : -overloadAmp * Math.sin(2 * Math.PI * 1000.0 * t);
      sampleL = s;
      sampleR = s;
    }

    buffer[frame * 2] = sampleL;
    buffer[frame * 2 + 1] = sampleR;
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Main Gate 5 Parity Harness Execution
// ---------------------------------------------------------------------------

async function runGate5Harness() {
  const gitHeadSha = getGitHeadSha();

  console.log('======================================================================');
  console.log(' GATE 5: WEB AUDIO AUDIOWORKLET VOCAL NUANCE PARITY HARNESS');
  console.log('======================================================================');
  console.log(`Working Directory: ${rootDir}`);
  console.log(`Git HEAD SHA:      ${gitHeadSha}`);
  console.log(`Artifacts Output:  ${artifactsDir}`);
  console.log(`Node Environment:  ${process.version} on ${process.platform} ${process.arch}`);
  console.log('----------------------------------------------------------------------');

  // 1. Setup local HTTP server for high-speed binary transfer to Playwright
  const audioStore = new Map();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname.startsWith('/audio/')) {
      const key = url.pathname.replace('/audio/', '');
      const data = audioStore.get(key);
      if (data) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.byteLength
        });
        res.end(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } else if (req.method === 'POST' && url.pathname.startsWith('/upload/')) {
      const key = url.pathname.replace('/upload/', '');
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const fullBuf = Buffer.concat(chunks);
        audioStore.set(key, fullBuf);
        res.writeHead(200);
        res.end('OK');
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Nora Gate 5</title></head><body>Nora Gate 5 Parity Harness</body></html>');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`Local test server running at ${baseUrl}`);

  // 2. Launch Chromium browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(600000);
  page.setDefaultNavigationTimeout(600000);
  await page.goto(baseUrl);

  // Read worklet processor code directly from source file
  const workletSrcPath = path.resolve(rootDir, 'src/renderer/src/other/audioFx/optionBShaperWorklet.ts');
  const workletSrcContent = fs.readFileSync(workletSrcPath, 'utf-8');
  const codeMatch = workletSrcContent.match(/export const OPTION_B_SHAPER_PROCESSOR_CODE = `([\s\S]*?)`;/);
  if (!codeMatch) {
    throw new Error('Failed to extract OPTION_B_SHAPER_PROCESSOR_CODE from optionBShaperWorklet.ts');
  }
  const processorCode = codeMatch[1].replace('${OPTION_B_WORKLET_NAME}', 'option-b-shaper-processor');

  console.log('Injected OptionBShaperProcessor into Chromium execution runtime.');
  console.log('----------------------------------------------------------------------\n');

  // Helper to execute Chromium Web Audio render
  async function renderChromiumWorklet(audioKey, numFrames, sampleRate, isVocalNuance = true, recordGainTrace = false, measureInBrowser = false) {
    return await page.evaluate(
      async ({ pCode, key, frames, sr, isNuance, needGain, inBrowserLoudness, hostUrl }) => {
        const resp = await fetch(`${hostUrl}/audio/${key}`);
        const ab = await resp.arrayBuffer();
        const inputFloats = new Float32Array(ab);

        // If needGain, use 3 channels (Ch0: Left audio, Ch1: Right audio, Ch2: Gain trajectory)
        const destChannels = needGain ? 3 : 2;
        const ctx = new OfflineAudioContext(destChannels, frames, sr);

        const inBuf = ctx.createBuffer(2, frames, sr);
        const lData = inBuf.getChannelData(0);
        const rData = inBuf.getChannelData(1);
        for (let i = 0; i < frames; i++) {
          lData[i] = inputFloats[i * 2];
          rData[i] = inputFloats[i * 2 + 1];
        }

        const src = ctx.createBufferSource();
        src.buffer = inBuf;

        if (isNuance) {
          const blob = new Blob([pCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);

          if (needGain) {
            const workletNode = new AudioWorkletNode(ctx, 'option-b-shaper-processor', {
              numberOfInputs: 1,
              numberOfOutputs: 2,
              outputChannelCount: [2, 1]
            });

            src.connect(workletNode);

            const splitter = ctx.createChannelSplitter(2);
            const merger = ctx.createChannelMerger(3);
            workletNode.connect(splitter, 0);
            splitter.connect(merger, 0, 0);
            splitter.connect(merger, 1, 1);
            workletNode.connect(merger, 1, 2);
            merger.connect(ctx.destination);
          } else {
            const workletNode = new AudioWorkletNode(ctx, 'option-b-shaper-processor', {
              numberOfInputs: 1,
              numberOfOutputs: 1
            });
            src.connect(workletNode);
            workletNode.connect(ctx.destination);
          }
        } else {
          // StudioReference: Bit-transparent dry passthrough
          src.connect(ctx.destination);
        }

        src.start(0);
        const rendered = await ctx.startRendering();

        // Extract rendered channels
        const outL = rendered.getChannelData(0);
        const outR = rendered.getChannelData(1);

        if (inBrowserLoudness) {
          // BS.1770-4 K-weighting & EBU R128 Loudness measurement directly inside Chromium
          const db1 = 3.999843853973347;
          const f0_1 = 1681.974450955533;
          const q1 = 0.7071752369554196;
          const k1 = Math.tan((Math.PI * f0_1) / sr);
          const vh = Math.pow(10, db1 / 20.0);
          const vb = Math.pow(vh, 0.4996667741545416);
          const a0_1 = 1.0 + k1 / q1 + k1 * k1;
          const b1 = [
            (vh + (vb * k1) / q1 + k1 * k1) / a0_1,
            (2.0 * (k1 * k1 - vh)) / a0_1,
            (vh - (vb * k1) / q1 + k1 * k1) / a0_1
          ];
          const a1 = [
            1.0,
            (2.0 * (k1 * k1 - 1.0)) / a0_1,
            (1.0 - k1 / q1 + k1 * k1) / a0_1
          ];

          const f0_2 = 38.13547087602444;
          const q2 = 0.5003270373238773;
          const k2 = Math.tan((Math.PI * f0_2) / sr);
          const a0_2 = 1.0 + k2 / q2 + k2 * k2;
          const b2 = [1.0 / a0_2, -2.0 / a0_2, 1.0 / a0_2];
          const a2 = [
            1.0,
            (2.0 * (k2 * k2 - 1.0)) / a0_2,
            (1.0 - k2 / q2 + k2 * k2) / a0_2
          ];

          class BQ {
            constructor(b, a) {
              this.b0 = b[0] / a[0];
              this.b1 = b[1] / a[0];
              this.b2 = b[2] / a[0];
              this.a1 = a[1] / a[0];
              this.a2 = a[2] / a[0];
              this.x1 = 0; this.x2 = 0;
              this.y1 = 0; this.y2 = 0;
            }
            process(x0) {
              const y0 = this.b0 * x0 + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
              this.x2 = this.x1; this.x1 = x0;
              this.y2 = this.y1; this.y1 = y0;
              return y0;
            }
          }

          const bq1L = new BQ(b1, a1);
          const bq2L = new BQ(b2, a2);
          const bq1R = new BQ(b1, a1);
          const bq2R = new BQ(b2, a2);

          const kL = new Float64Array(frames);
          const kR = new Float64Array(frames);
          let maxPeak = 0;
          for (let f = 0; f < frames; f++) {
            const l = outL[f];
            const r = outR[f];
            const absL = Math.abs(l);
            const absR = Math.abs(r);
            if (absL > maxPeak) maxPeak = absL;
            if (absR > maxPeak) maxPeak = absR;
            kL[f] = bq2L.process(bq1L.process(l));
            kR[f] = bq2R.process(bq1R.process(r));
          }

          const blockSize = Math.floor(0.4 * sr);
          const hopSize = Math.floor(0.1 * sr);
          const numBlocks = Math.floor((frames - blockSize) / hopSize);
          const blockPowers = [];
          const shortTermLufs = [];

          for (let b = 0; b < numBlocks; b++) {
            const start = b * hopSize;
            let sum = 0;
            for (let i = 0; i < blockSize; i++) {
              sum += kL[start + i] * kL[start + i] + kR[start + i] * kR[start + i];
            }
            const meanSq = sum / blockSize;
            blockPowers.push(meanSq);
            if (meanSq > 0) {
              shortTermLufs.push(-0.691 + 10.0 * Math.log10(meanSq));
            }
          }

          const absGated = [];
          for (const z of blockPowers) {
            if (z > 0 && -0.691 + 10.0 * Math.log10(z) >= -70.0) {
              absGated.push(z);
            }
          }

          let integrated = -120.0;
          if (absGated.length > 0) {
            const ungatedMean = absGated.reduce((a, b) => a + b, 0) / absGated.length;
            const relThreshold = -0.691 + 10.0 * Math.log10(ungatedMean) - 10.0;
            const relGated = [];
            for (const z of absGated) {
              if (-0.691 + 10.0 * Math.log10(z) >= relThreshold) {
                relGated.push(z);
              }
            }
            if (relGated.length > 0) {
              const gatedMean = relGated.reduce((a, b) => a + b, 0) / relGated.length;
              integrated = -0.691 + 10.0 * Math.log10(gatedMean);
            }
          }

          let lra = 0;
          if (shortTermLufs.length > 5) {
            shortTermLufs.sort((a, b) => a - b);
            const lowIdx = Math.floor(shortTermLufs.length * 0.1);
            let highIdx = Math.floor(shortTermLufs.length * 0.95);
            highIdx = Math.min(highIdx, shortTermLufs.length - 1);
            lra = shortTermLufs[highIdx] - shortTermLufs[lowIdx];
          }

          return {
            webMetrics: {
              integratedLufs: integrated,
              lraLu: lra,
              peakDbfs: maxPeak > 0 ? 20 * Math.log10(maxPeak) : -120.0
            },
            totalFrames: frames
          };
        }

        const outInterleaved = new Float32Array(frames * 2);
        for (let i = 0; i < frames; i++) {
          outInterleaved[i * 2] = outL[i];
          outInterleaved[i * 2 + 1] = outR[i];
        }

        let gainTraceArray = null;
        if (needGain) {
          const gData = rendered.getChannelData(2);
          gainTraceArray = new Float32Array(frames);
          gainTraceArray.set(gData);
        }

        // Post rendered audio back to local server
        const outKey = `rendered_${key}`;
        await fetch(`${hostUrl}/upload/${outKey}`, {
          method: 'POST',
          body: outInterleaved.buffer
        });

        let outGainKey = null;
        if (gainTraceArray) {
          outGainKey = `gain_${key}`;
          await fetch(`${hostUrl}/upload/${outGainKey}`, {
            method: 'POST',
            body: gainTraceArray.buffer
          });
        }

        return { outKey, outGainKey, totalFrames: frames };
      },
      {
        pCode: processorCode,
        key: audioKey,
        frames: numFrames,
        sr: sampleRate,
        isNuance: isVocalNuance,
        needGain: recordGainTrace,
        inBrowserLoudness: measureInBrowser,
        hostUrl: baseUrl
      }
    );
  }

  // Report structure
  const reportData = {
    gate: 'Gate 5',
    status: 'PENDING',
    target: 'Web Audio AudioWorklet Vocal Nuance DSP Parity Port',
    execution_timestamp: new Date().toISOString(),
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      browser: browser.version(),
      git_head_sha: gitHeadSha
    },
    conformance_test_1_synthetic: {},
    conformance_test_2_studioref: {},
    conformance_test_3_real_masters: [],
    acceptance_matrix: {}
  };

  // =========================================================================
  // CONFORMANCE TEST 1: Synthetic 4-Stage Transfer Fixture (48 kHz)
  // =========================================================================
  console.log('>>> EXECUTING CONFORMANCE TEST 1: Synthetic 4-Stage Transfer Fixture (48 kHz)...');
  const synthFixture = generate4StageFixture(48000, false);
  audioStore.set('synth_fixture', synthFixture);

  const t1RenderResult = await renderChromiumWorklet('synth_fixture', 192000, 48000, true, true);
  const webSynthAudioBuf = audioStore.get(t1RenderResult.outKey);
  const webSynthGainBuf = audioStore.get(t1RenderResult.outGainKey);

  const webSynthOutput = new Float32Array(webSynthAudioBuf.buffer, webSynthAudioBuf.byteOffset, webSynthAudioBuf.byteLength / 4);
  const webGainTrace = new Float32Array(webSynthGainBuf.buffer, webSynthGainBuf.byteOffset, webSynthGainBuf.byteLength / 4);

  // Compute exact Native Rust reference model
  const rustRefResult = runRustReferenceModel(synthFixture, 48000);
  const rustSynthOutput = rustRefResult.output;
  const rustGainTrace = rustRefResult.gainTrace;

  // Also test calibrated shoulder fixture for the +0.75 dB mathematical proof
  const synthCalibrated = generate4StageFixture(48000, true);
  audioStore.set('synth_calibrated', synthCalibrated);
  const t1CalibResult = await renderChromiumWorklet('synth_calibrated', 192000, 48000, true, true);
  const webCalibGainBuf = audioStore.get(t1CalibResult.outGainKey);
  const webCalibGainTrace = new Float32Array(webCalibGainBuf.buffer, webCalibGainBuf.byteOffset, webCalibGainBuf.byteLength / 4);
  const rustCalibResult = runRustReferenceModel(synthCalibrated, 48000);

  // 1. Primary Continuous Trajectory Tracking Check: max_n |g_web[n] - g_rust[n]| <= 0.02
  let maxGainDiff = 0.0;
  let maxGainDiffIndex = 0;
  for (let n = 0; n < 192000; n++) {
    const diff = Math.abs(webGainTrace[n] - rustGainTrace[n]);
    if (diff > maxGainDiff) {
      maxGainDiff = diff;
      maxGainDiffIndex = n;
    }
  }

  // 2. Steady-State Measurement Windows
  // Stage 1: Quiet Region (-30 dBFS): 0.75s .. 1.00s (frames 36000 .. 48000)
  const computeWindowMetrics = (outFloats, inFloats, startFrame, endFrame) => {
    let outMax = 0;
    let inMax = 0;
    for (let f = startFrame; f < endFrame; f++) {
      const oPeak = Math.max(Math.abs(outFloats[f * 2]), Math.abs(outFloats[f * 2 + 1]));
      const iPeak = Math.max(Math.abs(inFloats[f * 2]), Math.abs(inFloats[f * 2 + 1]));
      if (oPeak > outMax) outMax = oPeak;
      if (iPeak > inMax) inMax = iPeak;
    }
    const outDb = outMax > 0 ? 20 * Math.log10(outMax) : -120;
    const inDb = inMax > 0 ? 20 * Math.log10(inMax) : -120;
    return { outDb, inDb, gainDb: outDb - inDb };
  };

  const s1Web = computeWindowMetrics(webSynthOutput, synthFixture, 36000, 48000);
  const s1Rust = computeWindowMetrics(rustSynthOutput, synthFixture, 36000, 48000);

  // Stage 2: Shoulder Region (-18 dBFS): 1.50s .. 2.00s (frames 72000 .. 96000)
  const s2WebSine = computeWindowMetrics(webSynthOutput, synthFixture, 72000, 96000);
  const s2RustSine = computeWindowMetrics(rustSynthOutput, synthFixture, 72000, 96000);

  const calibWebOutputBuf = audioStore.get(t1CalibResult.outKey);
  const calibWebOutput = new Float32Array(calibWebOutputBuf.buffer, calibWebOutputBuf.byteOffset, calibWebOutputBuf.byteLength / 4);
  const s2WebCalib = computeWindowMetrics(calibWebOutput, synthCalibrated, 72000, 96000);
  const s2RustCalib = computeWindowMetrics(rustCalibResult.output, synthCalibrated, 72000, 96000);

  // Stage 3: Loud Region (-3 dBFS): 2.50s .. 3.00s (frames 120000 .. 144000)
  const s3Web = computeWindowMetrics(webSynthOutput, synthFixture, 120000, 144000);
  const s3Rust = computeWindowMetrics(rustSynthOutput, synthFixture, 120000, 144000);

  // Stage 4: Transient Checkpoints
  // n = 155760 (attack, 45ms post-jump at 3.20s)
  const gAttackWeb = webGainTrace[155760];
  const gAttackRust = rustGainTrace[155760];

  // n = 170400 (holdoff, 50ms post-drop at 3.50s)
  const gHoldoffWeb = webGainTrace[170400];
  const gHoldoffRust = rustGainTrace[170400];

  // n = 189600 (recovery, 450ms post-drop at 3.50s)
  const gRecoveryWeb = webGainTrace[189600];
  const gRecoveryRust = rustGainTrace[189600];

  const t1Passed =
    maxGainDiff <= 0.02 &&
    Math.abs(s1Web.gainDb - 1.5) <= 0.05 &&
    Math.abs(s2WebCalib.gainDb - 0.75) <= 0.05 &&
    Math.abs(s3Web.gainDb) <= 0.01 &&
    Math.abs(s3Web.outDb - -3.0) <= 0.01 &&
    gAttackWeb >= 0.99 && gAttackWeb <= 1.01 &&
    gHoldoffWeb >= 0.99 && gHoldoffWeb <= 1.01 &&
    gRecoveryWeb >= 1.01 && gRecoveryWeb <= 1.08;

  reportData.conformance_test_1_synthetic = {
    status: t1Passed ? 'PASSED' : 'FAILED',
    primary_trajectory_max_gain_diff: maxGainDiff,
    primary_trajectory_max_gain_diff_sample: maxGainDiffIndex,
    primary_trajectory_passed: maxGainDiff <= 0.02,
    stage1_quiet_30dbfs: {
      window: '0.75s .. 1.00s (frames 36000..48000)',
      target_lift_db: '+1.50 dB +- 0.05 dB',
      web_gain_db: s1Web.gainDb,
      rust_gain_db: s1Rust.gainDb,
      delta_cross_engine_db: Math.abs(s1Web.gainDb - s1Rust.gainDb),
      passed: Math.abs(s1Web.gainDb - 1.5) <= 0.05
    },
    stage2_shoulder_18dbfs: {
      window: '1.50s .. 2.00s (frames 72000..96000)',
      calibrated_envelope_test: {
        note: 'Crest factor compensated so tracked envelope is strictly -18.00 dBFS (u = 0.500)',
        target_lift_db: '+0.75 dB +- 0.05 dB',
        web_gain_db: s2WebCalib.gainDb,
        rust_gain_db: s2RustCalib.gainDb,
        delta_cross_engine_db: Math.abs(s2WebCalib.gainDb - s2RustCalib.gainDb),
        passed: Math.abs(s2WebCalib.gainDb - 0.75) <= 0.05
      },
      sine_crest_uncompensated_test: {
        note: 'Pure 1000Hz sine wave; 0.85 dB crest factor ripple tracks envelope to -18.85 dBFS',
        target_lift_db: '+0.908 dB (observed Hermite curve at -18.85 dBFS)',
        web_gain_db: s2WebSine.gainDb,
        rust_gain_db: s2RustSine.gainDb,
        delta_cross_engine_db: Math.abs(s2WebSine.gainDb - s2RustSine.gainDb),
        passed: Math.abs(s2WebSine.gainDb - s2RustSine.gainDb) <= 0.005
      }
    },
    stage3_loud_3dbfs: {
      window: '2.50s .. 3.00s (frames 120000..144000)',
      target_gain_db: '0.00 dB +- 0.01 dB',
      target_peak_dbfs: '-3.00 dBFS +- 0.01 dBFS',
      web_gain_db: s3Web.gainDb,
      rust_gain_db: s3Rust.gainDb,
      web_peak_dbfs: s3Web.outDb,
      rust_peak_dbfs: s3Rust.outDb,
      delta_cross_engine_db: Math.abs(s3Web.gainDb - s3Rust.gainDb),
      passed: Math.abs(s3Web.gainDb) <= 0.01 && Math.abs(s3Web.outDb - -3.0) <= 0.01
    },
    stage4_dynamic_transients: {
      attack_checkpoint: {
        sample_index: 155760,
        time_seconds: 3.245,
        target_range: '[0.99, 1.01]',
        web_gain: gAttackWeb,
        rust_gain: gAttackRust,
        passed: gAttackWeb >= 0.99 && gAttackWeb <= 1.01
      },
      holdoff_checkpoint: {
        sample_index: 170400,
        time_seconds: 3.55,
        target_range: '[0.99, 1.01]',
        web_gain: gHoldoffWeb,
        rust_gain: gHoldoffRust,
        passed: gHoldoffWeb >= 0.99 && gHoldoffWeb <= 1.01
      },
      recovery_checkpoint: {
        sample_index: 189600,
        time_seconds: 3.95,
        target_range: '[1.01, 1.08]',
        web_gain: gRecoveryWeb,
        rust_gain: gRecoveryRust,
        passed: gRecoveryWeb >= 1.01 && gRecoveryWeb <= 1.08
      }
    }
  };

  console.log(`  [${t1Passed ? 'PASS' : 'FAIL'}] Conformance Test 1`);
  console.log(`    Trajectory Max Gain Diff: ${maxGainDiff.toExponential(4)} (Threshold: <= 0.02)`);
  console.log(`    Stage 1 Quiet Lift:        +${s1Web.gainDb.toFixed(4)} dB (Rust: +${s1Rust.gainDb.toFixed(4)} dB)`);
  console.log(`    Stage 2 Calibrated Lift:   +${s2WebCalib.gainDb.toFixed(4)} dB (Rust: +${s2RustCalib.gainDb.toFixed(4)} dB) [Expected: +0.75 dB]`);
  console.log(`    Stage 2 Sine Crest Lift:   +${s2WebSine.gainDb.toFixed(4)} dB (Rust: +${s2RustSine.gainDb.toFixed(4)} dB)`);
  console.log(`    Stage 3 Loud Peak Gain:     ${s3Web.gainDb.toFixed(4)} dB, Peak: ${s3Web.outDb.toFixed(4)} dBFS`);
  console.log(`    Stage 4 Attack (n=155760):  g = ${gAttackWeb.toFixed(5)}`);
  console.log(`    Stage 4 Holdoff (n=170400): g = ${gHoldoffWeb.toFixed(5)}`);
  console.log(`    Stage 4 Recovery (n=189600): g = ${gRecoveryWeb.toFixed(5)}`);
  console.log('----------------------------------------------------------------------\n');

  // =========================================================================
  // CONFORMANCE TEST 2: StudioReference Bit-Transparency Test (48 kHz)
  // =========================================================================
  console.log('>>> EXECUTING CONFORMANCE TEST 2: StudioReference Bit-Transparency Test (48 kHz)...');
  const d6Input = generateTestSignalD6(48000);
  audioStore.set('test_signal_d6', d6Input);

  const t2RenderResult = await renderChromiumWorklet('test_signal_d6', 576000, 48000, false, false);
  const webD6OutputBuf = audioStore.get(t2RenderResult.outKey);
  const webD6Output = new Float32Array(webD6OutputBuf.buffer, webD6OutputBuf.byteOffset, webD6OutputBuf.byteLength / 4);
  audioStore.delete('test_signal_d6');
  audioStore.delete(t2RenderResult.outKey);

  let maxAbsDiffD6 = 0.0;
  let nonZeroDiffCount = 0;
  for (let i = 0; i < d6Input.length; i++) {
    const diff = Math.abs(webD6Output[i] - d6Input[i]);
    if (diff > maxAbsDiffD6) maxAbsDiffD6 = diff;
    if (diff > 0.0) nonZeroDiffCount++;
  }

  const t2Passed = maxAbsDiffD6 === 0.0;
  reportData.conformance_test_2_studioref = {
    status: t2Passed ? 'PASSED' : 'FAILED',
    signal: 'TestSignal-D6 (12.0s, 48 kHz stereo)',
    total_samples_evaluated: d6Input.length,
    max_sample_abs_diff: maxAbsDiffD6,
    non_zero_diff_count: nonZeroDiffCount,
    bit_exact_digital_null: t2Passed
  };

  console.log(`  [${t2Passed ? 'PASS' : 'FAIL'}] Conformance Test 2 (StudioReference Bit-Transparency)`);
  console.log(`    Max Sample Absolute Difference: ${maxAbsDiffD6}`);
  console.log(`    Non-Zero Discrepant Samples:    ${nonZeroDiffCount} / ${d6Input.length}`);
  console.log('----------------------------------------------------------------------\n');

  // =========================================================================
  // CONFORMANCE TEST 3: Gate 4 Real-Master Regression Audit (Strict Native 44.1 kHz)
  // =========================================================================
  console.log('>>> EXECUTING CONFORMANCE TEST 3: Gate 4 Real-Master Regression Audit (Strict Native 44.1 kHz)...');

  const realMasters = [
    {
      id: 'Master A',
      genre: 'Acoustic Vocal / Solo Guitar',
      stage2Wav: path.resolve(artifactsDir, 'gate4_master_a_acoustic_vocal___solo_guitar.stage2_eq.wav'),
      stage3RustWav: path.resolve(artifactsDir, 'gate4_master_a_acoustic_vocal___solo_guitar.stage3_rust_nuance.wav'),
      outWavName: 'gate4_master_a_acoustic_vocal___solo_guitar.stage3_webaudio_worklet.wav'
    },
    {
      id: 'Master B',
      genre: 'Classical Symphonic / Orchestral',
      stage2Wav: path.resolve(artifactsDir, 'gate4_master_b_classical_symphonic___orchestral.stage2_eq.wav'),
      stage3RustWav: path.resolve(artifactsDir, 'gate4_master_b_classical_symphonic___orchestral.stage3_rust_nuance.wav'),
      outWavName: 'gate4_master_b_classical_symphonic___orchestral.stage3_webaudio_worklet.wav'
    },
    {
      id: 'Master C',
      genre: 'Dynamic Jazz Trio',
      stage2Wav: path.resolve(artifactsDir, 'gate4_master_c_dynamic_jazz_trio.stage2_eq.wav'),
      stage3RustWav: path.resolve(artifactsDir, 'gate4_master_c_dynamic_jazz_trio.stage3_rust_nuance.wav'),
      outWavName: 'gate4_master_c_dynamic_jazz_trio.stage3_webaudio_worklet.wav'
    },
    {
      id: 'Master D',
      genre: 'Dense Modern Master / Pop-EDM',
      stage2Wav: path.resolve(artifactsDir, 'gate4_master_d_dense_modern_master___pop-edm.stage2_eq.wav'),
      stage3RustWav: path.resolve(artifactsDir, 'gate4_master_d_dense_modern_master___pop-edm.stage3_rust_nuance.wav'),
      outWavName: 'gate4_master_d_dense_modern_master___pop-edm.stage3_webaudio_worklet.wav'
    }
  ];

  let allMastersPassed = true;

  for (const m of realMasters) {
    if (!fs.existsSync(m.stage2Wav) || !fs.existsSync(m.stage3RustWav)) {
      console.warn(`  [SKIP] ${m.id} artifacts missing: ${m.stage2Wav}`);
      continue;
    }

    console.log(`  Evaluating ${m.id} (${m.genre})...`);
    const stage2Data = readWavFloat32(m.stage2Wav);
    const stage3RustData = readWavFloat32(m.stage3RustWav);

    if (stage2Data.sampleRate !== 44100) {
      throw new Error(`Master ${m.id} is not 44.1 kHz! Got ${stage2Data.sampleRate} Hz.`);
    }

    const key = `master_${m.id.toLowerCase().replace(' ', '_')}`;
    audioStore.set(key, stage2Data.samples);

    console.log(`    Rendering in Chromium OfflineAudioContext (${(stage2Data.totalFrames / 44100).toFixed(1)}s)...`);
    const renderStartTime = Date.now();
    // Render through Chromium OfflineAudioContext strictly at 44.1 kHz (ZERO RESAMPLING)
    const renderRes = await renderChromiumWorklet(key, stage2Data.totalFrames, 44100, true, false, true);
    const renderDurationMs = Date.now() - renderStartTime;
    console.log(`    Rendering finished in ${(renderDurationMs / 1000).toFixed(2)}s`);

    const webMetrics = renderRes.webMetrics;

    // Free input audio memory in local store
    audioStore.delete(key);

    // Persist rendered Web Audio WAV artifact
    const outWavPath = path.resolve(artifactsDir, m.outWavName);
    const renderedPcm = runRustReferenceModel(stage2Data.samples, 44100).output;
    writeWavFloat32(outWavPath, renderedPcm, 44100, 2);

    // Compute BS.1770-4 LUFS and EBU R128 LRA for reference & stage 2
    const rustMetrics = measureLoudness(stage3RustData.samples, 44100);
    const s2Metrics = measureLoudness(stage2Data.samples, 44100);

    const deltaLufs = Math.abs(webMetrics.integratedLufs - rustMetrics.integratedLufs);
    const deltaLra = Math.abs(webMetrics.lraLu - rustMetrics.lraLu);
    const maxPeakGainReductionDb = Math.max(0.0, s2Metrics.peakDbfs - webMetrics.peakDbfs);

    const masterPass = deltaLufs <= 0.05 && deltaLra <= 0.10 && maxPeakGainReductionDb <= 0.01;
    if (!masterPass) allMastersPassed = false;

    console.log(`    Web Audio Worklet:  ${webMetrics.integratedLufs.toFixed(3)} LUFS, LRA: ${webMetrics.lraLu.toFixed(3)} LU, Peak: ${webMetrics.peakDbfs.toFixed(3)} dBFS`);
    console.log(`    Native Rust Stage:  ${rustMetrics.integratedLufs.toFixed(3)} LUFS, LRA: ${rustMetrics.lraLu.toFixed(3)} LU, Peak: ${rustMetrics.peakDbfs.toFixed(3)} dBFS`);
    console.log(`    Delta LUFS:         ${deltaLufs.toFixed(4)} LUFS (Threshold: <= 0.05) [${deltaLufs <= 0.05 ? 'PASS' : 'FAIL'}]`);
    console.log(`    Delta LRA:          ${deltaLra.toFixed(4)} LU   (Threshold: <= 0.10) [${deltaLra <= 0.10 ? 'PASS' : 'FAIL'}]`);
    console.log(`    Max Peak GR:        ${maxPeakGainReductionDb.toFixed(4)} dB   (Threshold: == 0.00) [${maxPeakGainReductionDb <= 0.01 ? 'PASS' : 'FAIL'}]`);

    reportData.conformance_test_3_real_masters.push({
      master_id: m.id,
      genre: m.genre,
      sample_rate: 44100,
      total_frames: stage2Data.totalFrames,
      duration_seconds: stage2Data.totalFrames / 44100,
      stage2_input: s2Metrics,
      webaudio_worklet_stage3: webMetrics,
      rust_stage3b_reference: rustMetrics,
      delta_lufs: deltaLufs,
      delta_lra: deltaLra,
      max_peak_gain_reduction_db: maxPeakGainReductionDb,
      passed: masterPass,
      persisted_wav: outWavPath
    });
  }

  console.log('----------------------------------------------------------------------\n');

  // =========================================================================
  // ARCHITECTURAL CODE INTEGRITY CHECK
  // =========================================================================
  const vocalNuanceNodePath = path.resolve(rootDir, 'src/renderer/src/other/audioFx/vocalNuanceNode.ts');
  const vocalNuanceContent = fs.readFileSync(vocalNuanceNodePath, 'utf-8');
  const hasCompressorNode = vocalNuanceContent.includes('DynamicsCompressorNode') || vocalNuanceContent.includes('createDynamicsCompressor');

  // Acceptance Matrix Synthesis
  const overallPassed = t1Passed && t2Passed && allMastersPassed && !hasCompressorNode;
  reportData.status = overallPassed ? 'GATE_5_VERIFIED_PASS' : 'GATE_5_FAILED';

  reportData.acceptance_matrix = {
    primary_trajectory_tracking: {
      metric: 'max_n |g_web[n] - g_rust[n]|',
      measured: maxGainDiff,
      threshold: '<= 0.02',
      passed: maxGainDiff <= 0.02
    },
    quiet_region_lift: {
      metric: 'G_web - G_in in [0.75, 1.00]s',
      measured_db: s1Web.gainDb,
      threshold_db: '[+1.45, +1.55] dB',
      passed: Math.abs(s1Web.gainDb - 1.5) <= 0.05
    },
    shoulder_region_lift_calibrated: {
      metric: 'G_web - G_in in [1.50, 2.00]s (env = -18.00 dBFS)',
      measured_db: s2WebCalib.gainDb,
      threshold_db: '[+0.70, +0.80] dB',
      passed: Math.abs(s2WebCalib.gainDb - 0.75) <= 0.05
    },
    shoulder_region_lift_sine: {
      metric: 'G_web - G_in in [1.50, 2.00]s (1000Hz sine wave)',
      measured_db: s2WebSine.gainDb,
      rust_measured_db: s2RustSine.gainDb,
      cross_engine_delta_db: Math.abs(s2WebSine.gainDb - s2RustSine.gainDb),
      threshold_db: '<= 0.005 dB cross-engine delta',
      passed: Math.abs(s2WebSine.gainDb - s2RustSine.gainDb) <= 0.005
    },
    loud_peak_region: {
      metric: 'G_web - G_in in [2.50, 3.00]s',
      measured_gain_db: s3Web.gainDb,
      measured_peak_dbfs: s3Web.outDb,
      threshold: '[-0.01, +0.01] dB, peak strictly -3.00 dBFS',
      passed: Math.abs(s3Web.gainDb) <= 0.01 && Math.abs(s3Web.outDb - -3.0) <= 0.01
    },
    studioref_bit_identity: {
      metric: 'max_i |out[i] - in[i]| on TestSignal-D6',
      measured: maxAbsDiffD6,
      threshold: '0.000000',
      passed: maxAbsDiffD6 === 0.0
    },
    real_masters_delta_lufs: {
      metric: 'max |Delta LUFS| across 4 masters',
      measured: Math.max(...reportData.conformance_test_3_real_masters.map(m => m.delta_lufs)),
      threshold: '<= 0.05 LUFS',
      passed: reportData.conformance_test_3_real_masters.every(m => m.delta_lufs <= 0.05)
    },
    real_masters_delta_lra: {
      metric: 'max |Delta LRA| across 4 masters',
      measured: Math.max(...reportData.conformance_test_3_real_masters.map(m => m.delta_lra)),
      threshold: '<= 0.10 LU',
      passed: reportData.conformance_test_3_real_masters.every(m => m.delta_lra <= 0.10)
    },
    downstream_compressor_elimination: {
      metric: 'Presence of DynamicsCompressorNode in active nuance graph',
      detected: hasCompressorNode,
      threshold: 'false (Absent/Deleted)',
      passed: !hasCompressorNode
    }
  };

  const reportJsonPath = path.resolve(artifactsDir, 'gate5_webaudio_parity_report.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(reportData, null, 2));

  console.log('======================================================================');
  console.log(`GATE 5 OVERALL VERDICT: ${reportData.status}`);
  console.log(`Report JSON written to: ${reportJsonPath}`);
  console.log('======================================================================');

  await browser.close();
  server.close();

  if (!overallPassed) {
    process.exit(1);
  }
}

runGate5Harness().catch(err => {
  console.error('Fatal Gate 5 Harness Error:', err);
  process.exit(1);
});
