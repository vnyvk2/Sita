import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { WavAudioDecoder } from '../../../../../src/main/workers/process/audio/decoders/WavAudioDecoder';
import { createWavBuffer } from './wavHelper';

describe('Gate D1: WavAudioDecoder (Streaming RIFF/PCM)', () => {
  let tempDir: string;
  let decoder: WavAudioDecoder;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-wav-test-'));
    decoder = new WavAudioDecoder();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('probes 16-bit stereo WAV format correctly', async () => {
    const filePath = path.join(tempDir, 'stereo16.wav');
    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, bitDepth: 16, durationSeconds: 2 });
    await fs.writeFile(filePath, wavBuf);

    const info = await decoder.probe(filePath);
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(2);
    expect(info.bitDepth).toBe(16);
    expect(info.duration).toBeCloseTo(2, 1);
    expect(info.totalSamples).toBe(88200);
  });

  it('decodes 16-bit stereo WAV incrementally in bounded chunks without buffer accumulation', async () => {
    const filePath = path.join(tempDir, 'stereo16_stream.wav');
    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, bitDepth: 16, durationSeconds: 1 });
    await fs.writeFile(filePath, wavBuf);

    let chunksReceived = 0;
    let totalFramesReceived = 0;
    const chunkSize = 4096;

    await decoder.decodeStream(
      filePath,
      { chunkSize },
      (chunk) => {
        chunksReceived++;
        totalFramesReceived += chunk.frameCount;
        expect(chunk.channelData.length).toBe(2);
        expect(chunk.frameCount).toBeLessThanOrEqual(chunkSize);
      }
    );

    expect(chunksReceived).toBeGreaterThan(1);
    expect(totalFramesReceived).toBe(44100);
  });

  it('decodes 24-bit mono WAV correctly', async () => {
    const filePath = path.join(tempDir, 'mono24.wav');
    const wavBuf = createWavBuffer({ sampleRate: 48000, channels: 1, bitDepth: 24, durationSeconds: 0.5 });
    await fs.writeFile(filePath, wavBuf);

    let totalFrames = 0;
    await decoder.decodeStream(
      filePath,
      { chunkSize: 2048 },
      (chunk) => {
        totalFrames += chunk.frameCount;
        expect(chunk.channelData.length).toBe(1);
      }
    );

    expect(totalFrames).toBe(24000);
  });

  it('decodes 32-bit float stereo WAV correctly', async () => {
    const filePath = path.join(tempDir, 'float32.wav');
    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, bitDepth: 32, durationSeconds: 0.5, isFloat: true });
    await fs.writeFile(filePath, wavBuf);

    let totalFrames = 0;
    await decoder.decodeStream(
      filePath,
      { chunkSize: 2048 },
      (chunk) => {
        totalFrames += chunk.frameCount;
        expect(chunk.channelData.length).toBe(2);
      }
    );

    expect(totalFrames).toBe(22050);
  });

  it('halts streaming decode promptly on AbortSignal cancellation', async () => {
    const filePath = path.join(tempDir, 'long_cancel.wav');
    const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, bitDepth: 16, durationSeconds: 10 });
    await fs.writeFile(filePath, wavBuf);

    const abortController = new AbortController();
    let chunksProcessed = 0;

    await expect(
      decoder.decodeStream(
        filePath,
        { chunkSize: 1024, abortSignal: abortController.signal },
        () => {
          chunksProcessed++;
          if (chunksProcessed === 3) {
            abortController.abort();
          }
        }
      )
    ).rejects.toThrow(/cancelled/i);

    expect(chunksProcessed).toBe(3);
  });
});
