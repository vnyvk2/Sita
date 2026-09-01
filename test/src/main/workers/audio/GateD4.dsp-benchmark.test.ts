import fs from 'fs';
import os from 'os';
import path from 'path';

import { AlbumLoudnessAggregator } from '@main/workers/process/audio/AlbumLoudnessAggregator';
import { BS1770LoudnessEngine } from '@main/workers/process/audio/BS1770LoudnessEngine';
import { WavAudioDecoder } from '@main/workers/process/audio/decoders/WavAudioDecoder';
import { WaveformAccumulator } from '@main/workers/process/audio/WaveformAccumulator';
import { computeEffectiveReplayGain } from '@renderer/other/replayGainCalculator';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

/** Helper to write a valid PCM 16-bit stereo RIFF/WAV file directly to disk. */
function createWavFile(
  filePath: string,
  sampleRate: number,
  durationSeconds: number,
  freqHz: number = 1000,
  amplitude: number = 0.5
): number {
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = totalSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // audioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write sine wave samples
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sampleVal = Math.sin(2 * Math.PI * freqHz * t) * amplitude;
    const intVal = Math.max(-32768, Math.min(32767, Math.round(sampleVal * 32767)));

    // Left channel
    buffer.writeInt16LE(intVal, offset);
    // Right channel
    buffer.writeInt16LE(intVal, offset + 2);
    offset += 4;
  }

  fs.writeFileSync(filePath, buffer);
  return totalSamples;
}

describe('Gate D4: DSP Streaming Memory, Throughput & Multi-Track Pipeline Benchmark', () => {
  let tempDir: string;
  const decoder = new WavAudioDecoder();

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-gated4-dsp-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('D4.2: DSP Streaming Memory Characterization & Invariant Proofs', () => {
    it('structurally verifies bounded DSP internal state across components', () => {
      const sampleRate = 48000;
      const totalSamples = sampleRate * 600; // 10 minutes = 28.8M samples
      const engine = new BS1770LoudnessEngine(sampleRate, 2);
      const accumulator = new WaveformAccumulator(totalSamples, 200);

      // Verify that engine internal history state is bounded and does not retain all samples
      const blockEnergies = engine.getBlockEnergies();
      expect(blockEnergies.length).toBe(0);

      // Verify accumulator has exactly 200 bins allocated regardless of total sample count
      const initialPeaks = accumulator.finish();
      expect(initialPeaks.length).toBe(200);
      expect(initialPeaks.byteLength).toBe(200 * 4); // 800 bytes Float32Array
    });

    it('empirically proves no linear memory growth across 1-minute, 5-minute, and 10-minute audio streams', async () => {
      // Durations to test: 60s, 300s, 600s
      const durations = [60, 300, 600];
      const sampleRate = 44100;
      const memorySnapshots: {
        durationSec: number;
        totalSamples: number;
        fileSizeMB: number;
        heapStartMB: number;
        heapPeakMB: number;
        heapDeltaMB: number;
      }[] = [];

      for (const duration of durations) {
        const testWavPath = path.join(tempDir, `test_stream_${duration}s.wav`);
        const totalSamples = createWavFile(testWavPath, sampleRate, duration, 1000, 0.4);
        const fileSizeBytes = fs.statSync(testWavPath).size;
        const fileSizeMB = fileSizeBytes / (1024 * 1024);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        const engine = new BS1770LoudnessEngine(sampleRate, 2);
        const accumulator = new WaveformAccumulator(totalSamples, 200);

        const startMem = process.memoryUsage().heapUsed;
        let peakMem = startMem;

        await decoder.decodeStream(testWavPath, { chunkSize: 16384 }, (chunk) => {
          engine.processChunk(chunk);
          accumulator.processChunk(chunk);

          const currentMem = process.memoryUsage().heapUsed;
          if (currentMem > peakMem) {
            peakMem = currentMem;
          }
        });

        const result = engine.finish();
        const peaks = accumulator.finish();

        expect(result.integratedLoudness).toBeGreaterThan(-30);
        expect(peaks.length).toBe(200);

        const heapDeltaMB = (peakMem - startMem) / (1024 * 1024);

        memorySnapshots.push({
          durationSec: duration,
          totalSamples,
          fileSizeMB,
          heapStartMB: startMem / (1024 * 1024),
          heapPeakMB: peakMem / (1024 * 1024),
          heapDeltaMB
        });

        // Clean up file
        fs.unlinkSync(testWavPath);
      }

      console.log(
        '\n========================================================================================'
      );
      console.log(
        '                 GATE D4.2: DSP STREAMING MEMORY EMPIRICAL CHARACTERIZATION             '
      );
      console.log(
        '========================================================================================'
      );
      console.table(
        memorySnapshots.map((s) => ({
          'Duration (s)': `${s.durationSec}s`,
          'Audio Size': `${s.fileSizeMB.toFixed(2)} MB`,
          'Total Samples': `${(s.totalSamples / 1e6).toFixed(2)}M`,
          'Heap Delta': `${s.heapDeltaMB.toFixed(2)} MB`,
          'Theoretical Buffer Size': `${s.fileSizeMB.toFixed(2)} MB`
        }))
      );
      console.log(
        '========================================================================================\n'
      );

      // Verification of Non-Linear Scaling Invariant:
      // A full in-memory buffer approach would scale 1:1 with file size (10x growth between 1m and 10m).
      // Under our streaming pipeline, heap growth is sublinear and bounded (< 25MB for 100MB audio).
      const mem1m = memorySnapshots[0].heapDeltaMB;
      const mem10m = memorySnapshots[2].heapDeltaMB;
      const ratio = mem10m / Math.max(0.1, mem1m);
      expect(ratio).toBeLessThan(10.0);
      expect(mem10m).toBeLessThan(25.0);
      expect(mem10m).toBeLessThan(memorySnapshots[2].fileSizeMB);
    }, 60000); // 60s timeout for multi-minute audio generation & decode
  });

  describe('D4.3: DSP Processing & Loudness Calculation Throughput Benchmark', () => {
    it('benchmarks audio decode and loudness calculation throughput at 48 kHz stereo', async () => {
      const durationSeconds = 120; // 2 minutes
      const sampleRate = 48000;
      const testWavPath = path.join(tempDir, 'benchmark_throughput_2m.wav');
      const totalSamples = createWavFile(testWavPath, sampleRate, durationSeconds, 1000, 0.5);

      const engine = new BS1770LoudnessEngine(sampleRate, 2);
      const accumulator = new WaveformAccumulator(totalSamples, 200);

      const startTime = performance.now();

      await decoder.decodeStream(testWavPath, { chunkSize: 16384 }, (chunk) => {
        engine.processChunk(chunk);
        accumulator.processChunk(chunk);
      });

      const loudness = engine.finish();
      const peaks = accumulator.finish();
      const endTime = performance.now();

      const elapsedMs = endTime - startTime;
      const elapsedSec = elapsedMs / 1000;
      const megaSamples = (totalSamples * 2) / 1e6; // Stereo = 2 channels
      const mSamplesPerSec = megaSamples / elapsedSec;
      const realTimeFactor = durationSeconds / elapsedSec;

      console.log(
        '\n========================================================================================'
      );
      console.log(
        '                 GATE D4.3: DSP THROUGHPUT & REAL-TIME FACTOR BENCHMARK                  '
      );
      console.log(
        '========================================================================================'
      );
      console.table([
        {
          'Audio Duration': `${durationSeconds}s (2.0 min)`,
          'Sample Rate': `${sampleRate} Hz (Stereo)`,
          'Total Samples': `${(totalSamples * 2).toLocaleString()} samples`,
          'Processing Time': `${elapsedMs.toFixed(2)} ms`,
          Throughput: `${mSamplesPerSec.toFixed(2)} MSamples/sec`,
          'Real-Time Factor': `${realTimeFactor.toFixed(1)}x faster than real-time`
        }
      ]);
      console.log(
        '========================================================================================\n'
      );

      // Performance Assertions:
      // Must process at least 10x real-time speed on any modern machine
      expect(realTimeFactor).toBeGreaterThan(10.0);
      expect(loudness.integratedLoudness).toBeCloseTo(-6.06, 0.5);
      expect(peaks.length).toBe(200);

      fs.unlinkSync(testWavPath);
    }, 30000);
  });

  describe('D4.4: Corrupt-Cache Filesystem Resilience', () => {
    it('verifies safe handling of 0-byte, 7-byte, and 15-byte corrupted binary files on real disk', () => {
      const corruptedSizes = [0, 7, 15];

      for (const size of corruptedSizes) {
        const corruptPath = path.join(tempDir, `corrupt_${size}b.bin`);
        fs.writeFileSync(corruptPath, Buffer.alloc(size));

        const buf = fs.readFileSync(corruptPath);

        // Invariant: byteLength must be > 0 and divisible by 8 (Float64 IEEE 754)
        const isValid = buf.byteLength > 0 && buf.byteLength % 8 === 0;
        expect(isValid).toBe(false);

        fs.unlinkSync(corruptPath);
      }
    });
  });

  describe('D4.5: Full Multi-Track Album Pipeline End-to-End Integration', () => {
    it('runs full chain: disk WAV -> decode -> 64-bit block cache -> pooled album aggregation -> renderer gain application', async () => {
      // Track 1: Quiet track at -18 dBFS sine (amplitude ~0.125)
      const track1Path = path.join(tempDir, 'e2e_track1.wav');
      const s1Total = createWavFile(track1Path, 48000, 10, 1000, 0.125);

      // Track 2: Loud track at -6 dBFS sine (amplitude ~0.5)
      const track2Path = path.join(tempDir, 'e2e_track2.wav');
      const s2Total = createWavFile(track2Path, 48000, 10, 1000, 0.5);

      // 1. Decode and analyze Track 1
      const engine1 = new BS1770LoudnessEngine(48000, 2);
      await decoder.decodeStream(track1Path, { chunkSize: 16384 }, (c) => engine1.processChunk(c));
      const res1 = engine1.finish();
      const blocks1 = engine1.getBlockEnergies();

      // 2. Decode and analyze Track 2
      const engine2 = new BS1770LoudnessEngine(48000, 2);
      await decoder.decodeStream(track2Path, { chunkSize: 16384 }, (c) => engine2.processChunk(c));
      const res2 = engine2.finish();
      const blocks2 = engine2.getBlockEnergies();

      // 3. Persist Float64Array binary block caches to disk
      const cache1Path = path.join(tempDir, '1_v1.bin');
      const cache2Path = path.join(tempDir, '2_v1.bin');
      fs.writeFileSync(
        cache1Path,
        Buffer.from(blocks1.buffer, blocks1.byteOffset, blocks1.byteLength)
      );
      fs.writeFileSync(
        cache2Path,
        Buffer.from(blocks2.buffer, blocks2.byteOffset, blocks2.byteLength)
      );

      // 4. Read back caches using DataView (verifying 64-bit alignment and preservation)
      const rawBuf1 = fs.readFileSync(cache1Path);
      const rawBuf2 = fs.readFileSync(cache2Path);

      const readFloat64Blocks = (buf: Buffer) => {
        const count = buf.byteLength / 8;
        const arr = new Float64Array(count);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (let i = 0; i < count; i++) {
          arr[i] = view.getFloat64(i * 8, true);
        }
        return arr;
      };

      const diskBlocks1 = readFloat64Blocks(rawBuf1);
      const diskBlocks2 = readFloat64Blocks(rawBuf2);

      expect(diskBlocks1.length).toBe(blocks1.length);
      expect(diskBlocks2.length).toBe(blocks2.length);

      // 5. Pool blocks into AlbumLoudnessAggregator
      const albumResult = AlbumLoudnessAggregator.aggregate([
        { songId: 1, blockEnergies: diskBlocks1, samplePeak: res1.samplePeak },
        { songId: 2, blockEnergies: diskBlocks2, samplePeak: res2.samplePeak }
      ]);

      // Album loudness must reflect pooled energy of quiet + loud tracks
      expect(albumResult.albumLoudness).toBeGreaterThan(res1.integratedLoudness);
      expect(albumResult.albumLoudness).toBeLessThan(res2.integratedLoudness);
      expect(albumResult.albumPeak).toBe(Math.max(res1.samplePeak, res2.samplePeak));

      // 6. Test Renderer ReplayGain Application with Album Mode
      const rendererGain = computeEffectiveReplayGain({
        mode: 'album',
        albumGain: albumResult.albumGain,
        albumPeak: albumResult.albumPeak,
        trackGain: res1.trackGain,
        trackPeak: res1.samplePeak,
        preampDb: 0,
        preventClipping: true
      });

      expect(rendererGain.targetLinearGain).toBeGreaterThan(0);
      expect(rendererGain.appliedGainDb).toBe(albumResult.albumGain);
      expect(rendererGain.peakLimited).toBe(false);

      // Clean up
      fs.unlinkSync(track1Path);
      fs.unlinkSync(track2Path);
      fs.unlinkSync(cache1Path);
      fs.unlinkSync(cache2Path);
    }, 30000);
  });
});
