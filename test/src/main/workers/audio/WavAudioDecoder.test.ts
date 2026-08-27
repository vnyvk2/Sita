import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { WavAudioDecoder, deriveChannelLayout } from '../../../../../src/main/workers/process/audio/decoders/WavAudioDecoder';
import { createWavBuffer } from './wavHelper';

describe('Gate D2-R2: WavAudioDecoder (RIFF Scanning & Extensible GUID Validation)', () => {
  let tempDir: string;
  let decoder: WavAudioDecoder;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-wav-hardened-'));
    decoder = new WavAudioDecoder();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('scans arbitrary RIFF metadata chunks located before data chunk (>8KB JUNK chunk)', async () => {
    const filePath = path.join(tempDir, 'large_header.wav');
    // 12KB JUNK chunk before data chunk
    const wavBuf = createWavBuffer({
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16,
      durationSeconds: 1,
      extraPaddedBytesBeforeData: 12288
    });
    await fs.writeFile(filePath, wavBuf);

    const info = await decoder.probe(filePath);
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(2);
    expect(info.totalSamples).toBe(44100);

    let decodedFrames = 0;
    await decoder.decodeStream(filePath, {}, (chunk) => {
      decodedFrames += chunk.frameCount;
    });
    expect(decodedFrames).toBe(44100);
  });

  it('distinguishes 32-bit PCM integer from 32-bit IEEE Float', async () => {
    // 32-bit Integer PCM
    const intFile = path.join(tempDir, 'int32.wav');
    const intBuf = createWavBuffer({ sampleRate: 44100, channels: 2, bitDepth: 32, isFloat: false, amplitude: 0.5 });
    await fs.writeFile(intFile, intBuf);

    const intInfo = await decoder.probe(intFile);
    expect(intInfo.codec).toContain('PCM 32-bit');

    let intMaxPeak = 0;
    await decoder.decodeStream(intFile, {}, (chunk) => {
      for (let i = 0; i < chunk.frameCount; i++) {
        intMaxPeak = Math.max(intMaxPeak, Math.abs(chunk.channelData[0][i]));
      }
    });
    expect(intMaxPeak).toBeCloseTo(0.5, 1);

    // 32-bit Float PCM
    const floatFile = path.join(tempDir, 'float32.wav');
    const floatBuf = createWavBuffer({ sampleRate: 44100, channels: 2, bitDepth: 32, isFloat: true, amplitude: 0.75 });
    await fs.writeFile(floatFile, floatBuf);

    const floatInfo = await decoder.probe(floatFile);
    expect(floatInfo.codec).toContain('IEEE Float 32-bit');

    let floatMaxPeak = 0;
    await decoder.decodeStream(floatFile, {}, (chunk) => {
      for (let i = 0; i < chunk.frameCount; i++) {
        floatMaxPeak = Math.max(floatMaxPeak, Math.abs(chunk.channelData[0][i]));
      }
    });
    expect(floatMaxPeak).toBeCloseTo(0.75, 1);
  });

  it('decodes 8-bit unsigned PCM audio correctly', async () => {
    const filePath = path.join(tempDir, 'pcm8.wav');
    const wavBuf = createWavBuffer({ sampleRate: 22050, channels: 1, bitDepth: 8, durationSeconds: 0.5, amplitude: 0.6 });
    await fs.writeFile(filePath, wavBuf);

    const info = await decoder.probe(filePath);
    expect(info.sampleRate).toBe(22050);
    expect(info.channels).toBe(1);
    expect(info.bitDepth).toBe(8);

    let maxPeak = 0;
    await decoder.decodeStream(filePath, {}, (chunk) => {
      for (let i = 0; i < chunk.frameCount; i++) {
        maxPeak = Math.max(maxPeak, Math.abs(chunk.channelData[0][i]));
      }
    });
    expect(maxPeak).toBeCloseTo(0.6, 1);
  });

  it('decodes 24-bit PCM integer audio correctly', async () => {
    const filePath = path.join(tempDir, 'pcm24.wav');
    const wavBuf = createWavBuffer({ sampleRate: 48000, channels: 2, bitDepth: 24, durationSeconds: 0.5, amplitude: 0.9 });
    await fs.writeFile(filePath, wavBuf);

    const info = await decoder.probe(filePath);
    expect(info.sampleRate).toBe(48000);
    expect(info.bitDepth).toBe(24);

    let maxPeak = 0;
    await decoder.decodeStream(filePath, {}, (chunk) => {
      for (let i = 0; i < chunk.frameCount; i++) {
        maxPeak = Math.max(maxPeak, Math.abs(chunk.channelData[0][i]));
      }
    });
    expect(maxPeak).toBeCloseTo(0.9, 1);
  });

  describe('WAVE_FORMAT_EXTENSIBLE & Semantic Channel Mask Validation', () => {
    it('decodes multi-channel (6-channel 5.1 surround) WAVE_FORMAT_EXTENSIBLE with exact 16-byte GUID', async () => {
      const filePath = path.join(tempDir, 'surround_5_1.wav');
      const wavBuf = createWavBuffer({
        sampleRate: 48000,
        channels: 6,
        bitDepth: 24,
        isExtensible: true,
        durationSeconds: 0.5
      });
      await fs.writeFile(filePath, wavBuf);

      const info = await decoder.probe(filePath);
      expect(info.channels).toBe(6);
      expect(info.sampleRate).toBe(48000);
      expect(info.channelLayout).toEqual(['L', 'R', 'C', 'LFE', 'Ls', 'Rs']);

      let channelCountObserved = 0;
      await decoder.decodeStream(filePath, {}, (chunk) => {
        channelCountObserved = chunk.channelData.length;
      });
      expect(channelCountObserved).toBe(6);
    });

    it('throws when WAVE_FORMAT_EXTENSIBLE contains an invalid or non-matching SubFormat GUID', async () => {
      const filePath = path.join(tempDir, 'invalid_guid.wav');
      const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, isExtensible: true });
      // Corrupt the 12-byte GUID postfix (offset 48 in file)
      wavBuf[48] = 0xff;
      wavBuf[49] = 0xee;
      await fs.writeFile(filePath, wavBuf);

      await expect(decoder.probe(filePath)).rejects.toThrow(/Unsupported WAVE_FORMAT_EXTENSIBLE SubFormat GUID/i);
    });

    it('throws when WAVE_FORMAT_EXTENSIBLE header is truncated (< 40 bytes)', async () => {
      const filePath = path.join(tempDir, 'truncated_ext.wav');
      const wavBuf = createWavBuffer({ sampleRate: 44100, channels: 2, isExtensible: false });
      // Set format tag to 0xFFFE but keep fmt size 16
      wavBuf.writeUInt16LE(0xfffe, 20);
      await fs.writeFile(filePath, wavBuf);

      await expect(decoder.probe(filePath)).rejects.toThrow(/Invalid WAVE_FORMAT_EXTENSIBLE header size/i);
    });

    it('assigns Unknown to multichannel audio (>2ch) lacking an explicit channel mask', () => {
      const layout3 = deriveChannelLayout(3, 0);
      expect(layout3).toEqual(['Unknown', 'Unknown', 'Unknown']);

      const layout6 = deriveChannelLayout(6, 0);
      expect(layout6).toEqual(['Unknown', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'Unknown']);
    });

    it('rejects inconsistent channel masks where bit count does not equal channel count', () => {
      // 6 channels with only 2 mask bits set (0x3) -> inconsistent, must return 6 Unknowns
      const layoutInconsistent = deriveChannelLayout(6, 0x3);
      expect(layoutInconsistent).toHaveLength(6);
      expect(layoutInconsistent).toEqual(['Unknown', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'Unknown']);

      // 2 channels with only 1 mask bit set (0x1) -> inconsistent, must return 2 Unknowns
      const layoutInconsistentStereo = deriveChannelLayout(2, 0x1);
      expect(layoutInconsistentStereo).toHaveLength(2);
      expect(layoutInconsistentStereo).toEqual(['Unknown', 'Unknown']);
    });
  });

  it('throws descriptive error on malformed or truncated WAV file', async () => {
    const filePath = path.join(tempDir, 'truncated.wav');
    await fs.writeFile(filePath, Buffer.from('RIFF\x20\x00\x00\x00WAVEfmt ')); // Truncated fmt

    await expect(decoder.probe(filePath)).rejects.toThrow(/data|fmt|invalid/i);
    await expect(decoder.decodeStream(filePath, {}, () => {})).rejects.toThrow(/data|fmt|invalid/i);
  });

  it('halts streaming decode immediately on AbortSignal cancellation', async () => {
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
    ).rejects.toThrow(/cancelled by abort signal/i);
  });
});
