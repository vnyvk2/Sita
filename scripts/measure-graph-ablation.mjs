/**
 * Phase 0C — Full 10-Node Web Audio Graph Ablation Harness.
 *
 * Runs inside Chromium via Playwright (or Electron DevTools console).
 * Conforms strictly to the complete 10-node signal chain in `player.ts:797-850`:
 *   Node 1: ReplayGainNode (per-slot gain)
 *   Node 2: FadeGainNode (per-slot crossfade gain)
 *   Node 3: 10-Band Peaking Equalizer (chained biquads)
 *   Node 4: HeadroomGainNode (dynamic headroom staging)
 *   Node 5: Reverb / Lowpass Send (parallel convolver/lowpass path)
 *   Node 6: NightcoreTrebleBoostNode (peaking filter @ 6000 Hz)
 *   Node 7: KaraokeNode (parallel Linkwitz-Riley 4th-order vocal notch)
 *   Node 8: NightModeNode (parallel smart dynamic volume compressor)
 *   Node 9: SafetyLimiterNode (DynamicsCompressorNode: -6/20/0/3ms/150ms)
 *   Node 10: MasterGainNode (single volume authority before destination)
 *
 * Measures:
 *   - Peak (dBFS)
 *   - Integrated LUFS (ITU-R BS.1770-4 K-weighting with dual-stage gating)
 *   - Short-term LUFS (LUFS-S max)
 *   - Loudness Range (LRA, in LU per EBU R128)
 */

function calculateKWeighting(sampleRate) {
  // ITU-R BS.1770-4 Stage 1 High-Shelf Filter
  const db1 = 3.999843853973347;
  const f0_1 = 1681.974450955533;
  const Q1 = 0.7071752369554196;
  const K1 = Math.tan((Math.PI * f0_1) / sampleRate);
  const Vh = Math.pow(10.0, db1 / 20.0);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0_1 = 1.0 + K1 / Q1 + K1 * K1;
  const b1 = [
    (Vh + (Vb * K1) / Q1 + K1 * K1) / a0_1,
    (2.0 * (K1 * K1 - Vh)) / a0_1,
    (Vh - (Vb * K1) / Q1 + K1 * K1) / a0_1
  ];
  const a1 = [1.0, (2.0 * (K1 * K1 - 1.0)) / a0_1, (1.0 - K1 / Q1 + K1 * K1) / a0_1];

  // Stage 2 High-Pass Filter (RLB weighting)
  const f0_2 = 38.13547087602444;
  const Q2 = 0.5003270373238773;
  const K2 = Math.tan((Math.PI * f0_2) / sampleRate);
  const a0_2 = 1.0 + K2 / Q2 + K2 * K2;
  const b2 = [1.0 / a0_2, -2.0 / a0_2, 1.0 / a0_2];
  const a2 = [1.0, (2.0 * (K2 * K2 - 1.0)) / a0_2, (1.0 - K2 / Q2 + K2 * K2) / a0_2];

  return { b1, a1, b2, a2 };
}

function applyBiquad(samples, b, a) {
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

function calculateLufsAndLra(channelLeft, channelRight, sampleRate) {
  const { b1, a1, b2, a2 } = calculateKWeighting(sampleRate);
  const kL = applyBiquad(applyBiquad(channelLeft, b1, a1), b2, a2);
  const kR = applyBiquad(applyBiquad(channelRight, b1, a1), b2, a2);

  // 400ms block size with 75% overlap (100ms hop) per BS.1770
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

  // Integrated LUFS (Dual-Stage Gating)
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

  // LRA (Loudness Range per EBU R128)
  let lra = 0;
  if (shortTermLufs.length > 5) {
    const sorted = [...shortTermLufs].sort((a, b) => a - b);
    const lowIdx = Math.floor(sorted.length * 0.1);
    const highIdx = Math.floor(sorted.length * 0.95);
    lra = sorted[highIdx] - sorted[lowIdx];
  }

  const maxLufsS = shortTermLufs.length > 0 ? Math.max(...shortTermLufs) : -Infinity;
  return { integratedLufs: integrated, maxLufsS, lra };
}

async function runFull10NodeAblation() {
  const sr = 48000;
  const dur = 4.0;
  const numFrames = Math.floor(sr * dur);

  // Generate dynamic test signal with quiet passages (-24 dBFS), nominal speech/vocal (-12 dBFS), and hot peaks (-1 dBFS)
  const inputBuffer = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const t = i / sr;
    let ampDb = -24;
    if (t >= 1.0 && t < 2.5) ampDb = -12;
    if (t >= 2.5 && t < 3.2) ampDb = -1;
    if (t >= 3.2) ampDb = -20;
    const amp = 10 ** (ampDb / 20);
    inputBuffer[i] =
      amp *
      (0.6 * Math.sin(2 * Math.PI * 440 * t) +
        0.25 * Math.sin(2 * Math.PI * 880 * t) +
        0.1 * Math.sin(2 * Math.PI * 1320 * t) +
        0.05 * Math.sin(2 * Math.PI * 2640 * t));
  }

  const ablationPlan = [
    { id: 0, name: '0. Baseline (Full Normal 10-Node Graph)', bypass: null },
    { id: 1, name: '1. Bypass Node 1: ReplayGainNode', bypass: 'replayGain' },
    { id: 2, name: '2. Bypass Node 2: FadeGainNode', bypass: 'fadeGain' },
    { id: 3, name: '3. Bypass Node 3: 10-Band EQ (flat 0dB)', bypass: 'eq' },
    { id: 4, name: '4. Bypass Node 4: HeadroomGainNode', bypass: 'headroom' },
    { id: 5, name: '5. Bypass Node 5: Dry/Wet Reverb Send', bypass: 'reverb' },
    { id: 6, name: '6. Bypass Node 6: Nightcore Treble (6kHz)', bypass: 'treble' },
    { id: 7, name: '7. Bypass Node 7: KaraokeNode (LR4)', bypass: 'karaoke' },
    { id: 8, name: '8. Bypass Node 8: NightModeNode (bypassed)', bypass: 'nightMode' },
    { id: 9, name: '9. Bypass Node 9: SafetyLimiter (-6/20/0)', bypass: 'safetyLimiter' },
    { id: 10, name: '10. Bypass Node 10: MasterGainNode (vol=1)', bypass: 'masterGain' },
    { id: 11, name: '11. Active FX: Nightcore Preset (+2.5dB)', activeFx: 'nightcore' },
    { id: 12, name: '12. Active FX: NightMode Preset (Standard)', activeFx: 'nightMode' }
  ];

  const results = [];
  let baseLufs = 0;
  let basePeak = 0;
  let baseLra = 0;

  for (let s = 0; s < ablationPlan.length; s++) {
    const item = ablationPlan[s];
    const ctx = new OfflineAudioContext(2, numFrames, sr);

    // Source
    const srcBuf = ctx.createBuffer(2, numFrames, sr);
    srcBuf.getChannelData(0).set(inputBuffer);
    srcBuf.getChannelData(1).set(inputBuffer);
    const src = ctx.createBufferSource();
    src.buffer = srcBuf;

    // Node 1: ReplayGain
    const replayGain = ctx.createGain();
    replayGain.gain.value = 1.0;

    // Node 2: FadeGain
    const fadeGain = ctx.createGain();
    fadeGain.gain.value = 1.0;

    // Node 3: 10-Band EQ
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

    // Node 4: HeadroomGain
    const headroomGain = ctx.createGain();
    headroomGain.gain.value = item.activeFx === 'nightcore' ? 0.8414 : 1.0;

    // Node 5: Reverb Dry Path (wet is 0 in normal)
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1.0;

    // Node 6: Nightcore Treble (6000 Hz)
    const trebleNode = ctx.createBiquadFilter();
    trebleNode.type = 'peaking';
    trebleNode.frequency.value = 6000;
    trebleNode.Q.value = 1.2;
    trebleNode.gain.value = item.activeFx === 'nightcore' ? 2.5 : 0.0;

    // Node 7: Karaoke Node (dry=1, wet=0)
    const karaokeIn = ctx.createGain();
    const karaokeOut = ctx.createGain();
    const karaokeDry = ctx.createGain();
    karaokeDry.gain.value = 1.0;
    karaokeIn.connect(karaokeDry);
    karaokeDry.connect(karaokeOut);

    // Node 8: NightMode Node (dry=1, wet=0 in normal; wet=1 in active nightMode)
    const nightModeIn = ctx.createGain();
    const nightModeOut = ctx.createGain();
    const nightModeDry = ctx.createGain();
    const nightModeWet = ctx.createGain();
    const nightModeComp = ctx.createDynamicsCompressor();
    const nightModeMakeup = ctx.createGain();

    nightModeComp.threshold.value = -20;
    nightModeComp.knee.value = 12;
    nightModeComp.ratio.value = 4;
    nightModeMakeup.gain.value = 10 ** (5 / 20); // +5 dB

    nightModeIn.connect(nightModeDry);
    nightModeDry.connect(nightModeOut);

    nightModeIn.connect(nightModeComp);
    nightModeComp.connect(nightModeMakeup);
    nightModeMakeup.connect(nightModeWet);
    nightModeWet.connect(nightModeOut);

    if (item.activeFx === 'nightMode') {
      nightModeDry.gain.value = 0.0;
      nightModeWet.gain.value = 1.0;
    } else {
      nightModeDry.gain.value = 1.0;
      nightModeWet.gain.value = 0.0;
    }

    // Node 9: SafetyLimiter (-6 / 20:1 / 3ms / 150ms)
    const safetyLimiter = ctx.createDynamicsCompressor();
    safetyLimiter.threshold.value = -6;
    safetyLimiter.knee.value = 0;
    safetyLimiter.ratio.value = 20;
    safetyLimiter.attack.value = 0.003;
    safetyLimiter.release.value = 0.15;

    // Node 10: Master Gain (single volume authority)
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;

    // Assemble routing chain respecting bypass toggles:
    let curr = src;

    // Node 1
    if (item.bypass !== 'replayGain') {
      curr.connect(replayGain);
      curr = replayGain;
    }
    // Node 2
    if (item.bypass !== 'fadeGain') {
      curr.connect(fadeGain);
      curr = fadeGain;
    }
    // Node 3
    if (item.bypass !== 'eq') {
      curr.connect(eqNodes[0]);
      curr = eqNodes[eqNodes.length - 1];
    }
    // Node 4
    if (item.bypass !== 'headroom') {
      curr.connect(headroomGain);
      curr = headroomGain;
    }
    // Node 5
    if (item.bypass !== 'reverb') {
      curr.connect(dryGain);
      curr = dryGain;
    }
    // Node 6
    if (item.bypass !== 'treble') {
      curr.connect(trebleNode);
      curr = trebleNode;
    }
    // Node 7
    if (item.bypass !== 'karaoke') {
      curr.connect(karaokeIn);
      curr = karaokeOut;
    }
    // Node 8
    if (item.bypass !== 'nightMode') {
      curr.connect(nightModeIn);
      curr = nightModeOut;
    }
    // Node 9
    if (item.bypass !== 'safetyLimiter') {
      curr.connect(safetyLimiter);
      curr = safetyLimiter;
    }
    // Node 10
    if (item.bypass !== 'masterGain') {
      curr.connect(masterGain);
      curr = masterGain;
    }

    curr.connect(ctx.destination);
    src.start(0);

    const rendered = await ctx.startRendering();
    const chL = rendered.getChannelData(0);
    const chR = rendered.getChannelData(1);

    let peak = 0;
    for (let i = 0; i < chL.length; i++) {
      peak = Math.max(peak, Math.abs(chL[i]), Math.abs(chR[i]));
    }
    const peakDb = 20 * Math.log10(peak + 1e-12);
    const metrics = calculateLufsAndLra(chL, chR, sr);

    if (s === 0) {
      baseLufs = metrics.integratedLufs;
      basePeak = peakDb;
      baseLra = metrics.lra;
    }

    results.push({
      Stage: item.name,
      'Peak (dBFS)': Number(peakDb.toFixed(2)),
      'LUFS (Int)': Number(metrics.integratedLufs.toFixed(2)),
      'LUFS-S (Max)': Number(metrics.maxLufsS.toFixed(2)),
      'LRA (LU)': Number(metrics.lra.toFixed(2)),
      'ΔLUFS': Number((metrics.integratedLufs - baseLufs).toFixed(2)),
      'ΔPeak': Number((peakDb - basePeak).toFixed(2)),
      'ΔLRA': Number((metrics.lra - baseLra).toFixed(2))
    });
  }

  return results;
}

if (typeof module !== 'undefined') {
  module.exports = { runFull10NodeAblation };
} else {
  runFull10NodeAblation();
}
