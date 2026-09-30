/**
 * Phase 0A — DynamicsCompressor isolation artifact (RUN IN CHROMIUM, not Node).
 *
 * Node/jsdom have no OfflineAudioContext, so this script is intentionally a
 * browser-console artifact: paste into the Electron renderer devtools console
 * or any Chromium console, or load via a test harness page.
 *
 * Synthetic signal (sample-rate agnostic):
 *   0.0-1.0s  -20 dBFS sine @ 440 Hz (sub-threshold, makeup probe)
 *   1.0-1.2s  -1 dBFS sine @ 440 Hz (burst, peak-containment + lookahead probe)
 *   1.2-2.2s  -20 dBFS sine @ 440 Hz (release-tail probe)
 *
 * Nora chain settings under test: threshold -6, knee 0, ratio 20,
 * attack 0.003, release 0.15.
 *
 * Static spec expectations (W3C Web Audio §1.19.4, makeup=(1/curve(1))^0.6):
 *   makeup ≈ +3.42 dB  → -20 dBFS segment ≈ -16.58 dBFS
 *   0 dBFS peak → -2.28 dBFS; -1 dBFS burst onset ≈ -2.3 dBFS (±lookahead)
 *   release tail returns to +3.42 dB lift over ~150 ms; reduction 0 → ≈-4.8 → 0
 *
 * Pass criteria: makeup within ±0.5 dB of +3.42 (implementation tolerance,
 * not ±0.1 — envelope/lookahead shape is UA-defined); burst overshoot ≤ 1 dB.
 */
async function measureCompressorIsolation() {
  const sr = 48000;
  const dur = 2.2;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * dur), sr);

  const buf = ctx.createBuffer(2, Math.floor(sr * dur), sr);
  const mkSine = (db, t0, t1) => {
    const amp = 10 ** (db / 20);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) {
        d[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sr);
      }
    }
  };
  mkSine(-20, 0.0, 1.0);
  mkSine(-1, 1.0, 1.2);
  mkSine(-20, 1.2, 2.2);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  src.connect(comp).connect(ctx.destination);
  src.start(0);

  const out = await ctx.startRendering();
  const rmsDb = (data, t0, t1) => {
    let s = 0;
    let n = 0;
    for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) {
      s += data[i] ** 2;
      n++;
    }
    return 20 * Math.log10(Math.sqrt(s / n) + 1e-12);
  };
  const peakDb = (data, t0, t1) => {
    let p = 0;
    for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) p = Math.max(p, Math.abs(data[i]));
    return 20 * Math.log10(p + 1e-12);
  };

  const ch = out.getChannelData(0);
  const quietIn = rmsDb(ch, 0.2, 0.8);
  const burstPeak = peakDb(ch, 1.0, 1.2);
  const tail = rmsDb(ch, 1.6, 2.1);
  // Input reference: -20 dBFS sine RMS ≈ -23.01 dB; -1 dBFS sine peak = -1 dB
  const makeupMeasured = quietIn - -23.01;
  console.table({ quietRmsDb: quietIn.toFixed(2), burstPeakDb: burstPeak.toFixed(2), tailRmsDb: tail.toFixed(2), makeupDb: makeupMeasured.toFixed(2) });
  const results = {
    makeupDb: makeupMeasured,
    makeupPass: Math.abs(makeupMeasured - 3.42) <= 0.5,
    burstPass: burstPeak <= -1.3, // contained well below input peak; overshoot ≤ ~1 dB over -2.3 static
    releasePass: Math.abs(tail - quietIn) <= 1.0
  };
  console.log(results.makeupPass && results.burstPass && results.releasePass ? '0A PASS' : '0A FAIL', results);
  return results;
}

if (typeof module !== 'undefined') module.exports = { measureCompressorIsolation };
else measureCompressorIsolation();
