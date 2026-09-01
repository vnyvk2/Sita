import fs from 'fs';

import type {
  AudioDecoder,
  AudioFormatInfo,
  ChannelPosition,
  DecodeChunk,
  DecodeStreamOptions
} from '../types';

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

// SubFormat GUID prefix and standard 12-byte postfix for PCM and IEEE Float in WAVE_FORMAT_EXTENSIBLE
// Standard GUID: {XXXXXXXX-0000-0010-8000-00AA00389B71}
const KSDATAFORMAT_SUBTYPE_PCM_GUID_PREFIX = 0x00000001;
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_GUID_PREFIX = 0x00000003;
const KSDATAFORMAT_SUBTYPE_GUID_POSTFIX = Buffer.from([
  0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71
]);

interface ParsedWavHeader {
  audioFormat: number;
  isFloat: boolean;
  channels: number;
  channelLayout: ChannelPosition[];
  sampleRate: number;
  bitDepth: number;
  dataOffset: number;
  dataLength: number;
  totalSamples: number;
  codec: string;
}

export function deriveChannelLayout(channels: number, channelMask = 0): ChannelPosition[] {
  if (channelMask > 0) {
    const layout: ChannelPosition[] = [];
    if (channelMask & 0x1) layout.push('L');
    if (channelMask & 0x2) layout.push('R');
    if (channelMask & 0x4) layout.push('C');
    if (channelMask & 0x8) layout.push('LFE');
    if (channelMask & 0x10) layout.push('Ls');
    if (channelMask & 0x20) layout.push('Rs');

    if (layout.length === channels) {
      return layout;
    }
    // Inconsistent or incomplete channelMask: number of mask bits does not match channel count.
    // Return Unknown positions so BS1770LoudnessEngine explicitly rejects the layout.
    return Array.from({ length: channels }, () => 'Unknown');
  }

  if (channels === 1) return ['Mono'];
  if (channels === 2) return ['L', 'R'];

  // For channels > 2 without explicit channelMask, return Unknown positions
  // so BS1770LoudnessEngine explicitly rejects ambiguous/unmapped multichannel layouts
  return Array.from({ length: channels }, () => 'Unknown');
}

/**
 * Streaming WAV (RIFF/PCM/IEEE-FLOAT) Audio Decoder. Decodes audio stream in bounded, incremental
 * chunks (O(1) memory). Supports arbitrary RIFF chunk ordering, extra metadata chunks (LIST, INFO,
 * JUNK, bext), 8-bit, 16-bit, 24-bit, 32-bit PCM integer, and 32-bit IEEE float formats across
 * mono/stereo/multi-channel.
 */
export class WavAudioDecoder implements AudioDecoder {
  readonly codec = 'pcm_wav';

  public supports(filePath: string): boolean {
    return /\.wav$/i.test(filePath);
  }

  public async probe(filePath: string): Promise<AudioFormatInfo> {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const parsed = await this.parseWavStructure(handle, filePath);
      return {
        sampleRate: parsed.sampleRate,
        channels: parsed.channels,
        channelLayout: parsed.channelLayout,
        bitDepth: parsed.bitDepth,
        duration: parsed.totalSamples / parsed.sampleRate,
        totalSamples: parsed.totalSamples,
        codec: parsed.codec
      };
    } finally {
      await handle.close();
    }
  }

  public async decodeStream(
    filePath: string,
    options: DecodeStreamOptions,
    onChunk: (chunk: DecodeChunk) => Promise<void> | void
  ): Promise<void> {
    const { abortSignal, chunkSize = 16384 } = options;
    const handle = await fs.promises.open(filePath, 'r');

    try {
      const parsed = await this.parseWavStructure(handle, filePath);
      const { channels, channelLayout, bitDepth, isFloat, dataOffset, dataLength, totalSamples } =
        parsed;
      const bytesPerSample = bitDepth / 8;
      const blockAlign = channels * bytesPerSample;

      const bufferBytes = chunkSize * blockAlign;
      const readBuffer = Buffer.alloc(bufferBytes);

      let currentFileOffset = dataOffset;
      const dataEndOffset = dataOffset + dataLength;
      let currentSampleOffset = 0;

      while (currentFileOffset < dataEndOffset) {
        if (abortSignal?.aborted) {
          throw new Error(`WAV decoding cancelled by abort signal.`);
        }

        const bytesToRead = Math.min(bufferBytes, dataEndOffset - currentFileOffset);
        const { bytesRead: actualRead } = await handle.read(
          readBuffer,
          0,
          bytesToRead,
          currentFileOffset
        );
        if (actualRead === 0) break;

        const framesInChunk = Math.floor(actualRead / blockAlign);
        if (framesInChunk === 0) break;

        // Allocate Float32Array per channel for this bounded chunk
        const channelData: Float32Array[] = [];
        for (let ch = 0; ch < channels; ch++) {
          channelData.push(new Float32Array(framesInChunk));
        }

        // Convert PCM integer / float samples to normalized [-1.0, 1.0]
        let bytePos = 0;
        for (let f = 0; f < framesInChunk; f++) {
          for (let ch = 0; ch < channels; ch++) {
            let normalized = 0;

            if (isFloat && bitDepth === 32) {
              normalized = readBuffer.readFloatLE(bytePos);
              bytePos += 4;
            } else if (bitDepth === 16) {
              const int16 = readBuffer.readInt16LE(bytePos);
              normalized = int16 / 32768.0;
              bytePos += 2;
            } else if (bitDepth === 24) {
              const b0 = readBuffer[bytePos];
              const b1 = readBuffer[bytePos + 1];
              const b2 = readBuffer[bytePos + 2];
              let int24 = b0 | (b1 << 8) | (b2 << 16);
              if (int24 & 0x800000) int24 |= 0xff000000;
              normalized = int24 / 8388608.0;
              bytePos += 3;
            } else if (!isFloat && bitDepth === 32) {
              // 32-bit PCM integer
              const int32 = readBuffer.readInt32LE(bytePos);
              normalized = int32 / 2147483648.0;
              bytePos += 4;
            } else if (bitDepth === 8) {
              // 8-bit unsigned PCM
              const uint8 = readBuffer.readUInt8(bytePos);
              normalized = (uint8 - 128) / 128.0;
              bytePos += 1;
            } else {
              throw new Error(`Unsupported WAV bit depth (${bitDepth}) or format configuration.`);
            }

            channelData[ch][f] = Math.max(-1.0, Math.min(1.0, normalized));
          }
        }

        await onChunk({
          channelData,
          channelLayout,
          sampleOffset: currentSampleOffset,
          frameCount: framesInChunk,
          totalSamples
        });

        currentFileOffset += framesInChunk * blockAlign;
        currentSampleOffset += framesInChunk;
      }
    } finally {
      await handle.close();
    }
  }

  /** Scans RIFF/WAVE chunk headers iteratively to handle arbitrary chunk ordering and metadata. */
  private async parseWavStructure(
    handle: fs.promises.FileHandle,
    filePath: string
  ): Promise<ParsedWavHeader> {
    const stats = await handle.stat();
    const fileSize = stats.size;

    if (fileSize < 12) {
      throw new Error(`Invalid WAV file: size (${fileSize} bytes) too small for RIFF header.`);
    }

    const headerBuf = Buffer.alloc(12);
    await handle.read(headerBuf, 0, 12, 0);

    const riff = headerBuf.toString('ascii', 0, 4);
    const wave = headerBuf.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error(`Not a valid RIFF/WAVE audio file: ${filePath}`);
    }

    let fileOffset = 12;
    let audioFormat = 0;
    let isFloat = false;
    let channels = 0;
    let channelMask = 0;
    let sampleRate = 0;
    let bitDepth = 0;
    let dataOffset = 0;
    let dataLength = 0;

    const chunkHeaderBuf = Buffer.alloc(8);

    while (fileOffset + 8 <= fileSize) {
      const { bytesRead } = await handle.read(chunkHeaderBuf, 0, 8, fileOffset);
      if (bytesRead < 8) break;

      const chunkId = chunkHeaderBuf.toString('ascii', 0, 4);
      const chunkSize = chunkHeaderBuf.readUInt32LE(4);
      const chunkDataOffset = fileOffset + 8;

      if (chunkId === 'fmt ') {
        const fmtSize = Math.max(16, chunkSize);
        const fmtBuf = Buffer.alloc(fmtSize);
        await handle.read(fmtBuf, 0, fmtSize, chunkDataOffset);

        audioFormat = fmtBuf.readUInt16LE(0);
        channels = fmtBuf.readUInt16LE(2);
        sampleRate = fmtBuf.readUInt32LE(4);
        bitDepth = fmtBuf.readUInt16LE(14);

        if (audioFormat === WAVE_FORMAT_PCM) {
          isFloat = false;
        } else if (audioFormat === WAVE_FORMAT_IEEE_FLOAT) {
          isFloat = true;
        } else if (audioFormat === WAVE_FORMAT_EXTENSIBLE) {
          if (fmtSize < 40) {
            throw new Error(`Invalid WAVE_FORMAT_EXTENSIBLE header size (${fmtSize} < 40 bytes).`);
          }
          channelMask = fmtBuf.readUInt32LE(20);
          const subFormatTag = fmtBuf.readUInt32LE(24);
          const isKsGuidMatch = fmtBuf.subarray(28, 40).equals(KSDATAFORMAT_SUBTYPE_GUID_POSTFIX);

          if (!isKsGuidMatch) {
            throw new Error(`Unsupported WAVE_FORMAT_EXTENSIBLE SubFormat GUID.`);
          }

          if (subFormatTag === KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_GUID_PREFIX) {
            isFloat = true;
          } else if (subFormatTag === KSDATAFORMAT_SUBTYPE_PCM_GUID_PREFIX) {
            isFloat = false;
          } else {
            throw new Error(`Unsupported WAVE_FORMAT_EXTENSIBLE subFormat tag (${subFormatTag}).`);
          }
        } else {
          throw new Error(`Unsupported WAV compression format tag: ${audioFormat}`);
        }
      } else if (chunkId === 'data') {
        dataOffset = chunkDataOffset;
        dataLength = Math.min(chunkSize, fileSize - dataOffset);
        break; // Found data chunk
      }

      // Advance to next chunk (RIFF chunks are word-aligned to 2-byte boundaries)
      const paddedSize = chunkSize + (chunkSize % 2);
      fileOffset = chunkDataOffset + paddedSize;
    }

    if (dataOffset === 0) {
      throw new Error(`Invalid WAV file: 'data' chunk not found in ${filePath}`);
    }
    if (channels === 0 || sampleRate === 0 || bitDepth === 0) {
      throw new Error(`Invalid WAV file: missing or incomplete 'fmt ' chunk in ${filePath}`);
    }

    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const totalSamples = Math.floor(dataLength / blockAlign);

    const codecName = isFloat ? `WAV (IEEE Float ${bitDepth}-bit)` : `WAV (PCM ${bitDepth}-bit)`;

    const channelLayout = deriveChannelLayout(channels, channelMask);

    return {
      audioFormat,
      isFloat,
      channels,
      channelLayout,
      sampleRate,
      bitDepth,
      dataOffset,
      dataLength,
      totalSamples,
      codec: codecName
    };
  }
}
