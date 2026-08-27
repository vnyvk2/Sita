import fs from 'fs';
import type { AudioDecoder, AudioFormatInfo, DecodeChunk, DecodeStreamOptions } from '../types';

/**
 * Streaming WAV (RIFF/PCM) Audio Decoder.
 * Streams PCM samples incrementally in fixed-size memory buffers (O(1) memory).
 */
export class WavAudioDecoder implements AudioDecoder {
  readonly codec = 'pcm_wav';

  public supports(filePath: string): boolean {
    return /\.wav$/i.test(filePath);
  }

  public async probe(filePath: string): Promise<AudioFormatInfo> {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const headerBuffer = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(headerBuffer, 0, 4096, 0);
      if (bytesRead < 44) {
        throw new Error(`WAV file ${filePath} is too small to contain a valid header.`);
      }

      const parsed = this.parseWavHeader(headerBuffer);
      return {
        sampleRate: parsed.sampleRate,
        channels: parsed.channels,
        bitDepth: parsed.bitDepth,
        duration: parsed.totalSamples / parsed.sampleRate,
        totalSamples: parsed.totalSamples,
        codec: parsed.audioFormat === 3 ? 'WAV (IEEE Float)' : 'WAV (PCM)'
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
      const headerBuffer = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(headerBuffer, 0, 4096, 0);
      if (bytesRead < 44) {
        throw new Error(`Invalid WAV file: header truncated in ${filePath}`);
      }

      const parsed = this.parseWavHeader(headerBuffer);
      const { channels, bitDepth, dataOffset, dataLength, totalSamples } = parsed;
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
        const { bytesRead: actualRead } = await handle.read(readBuffer, 0, bytesToRead, currentFileOffset);
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
            if (bitDepth === 16) {
              const int16 = readBuffer.readInt16LE(bytePos);
              normalized = int16 / 32768.0;
              bytePos += 2;
            } else if (bitDepth === 24) {
              const b0 = readBuffer[bytePos];
              const b1 = readBuffer[bytePos + 1];
              const b2 = readBuffer[bytePos + 2];
              let int24 = (b0 | (b1 << 8) | (b2 << 16));
              if (int24 & 0x800000) int24 |= 0xff000000;
              normalized = int24 / 8388608.0;
              bytePos += 3;
            } else if (bitDepth === 32) {
              normalized = readBuffer.readFloatLE(bytePos);
              bytePos += 4;
            } else if (bitDepth === 8) {
              const uint8 = readBuffer.readUInt8(bytePos);
              normalized = (uint8 - 128) / 128.0;
              bytePos += 1;
            }
            channelData[ch][f] = Math.max(-1.0, Math.min(1.0, normalized));
          }
        }

        await onChunk({
          channelData,
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

  private parseWavHeader(buf: Buffer): {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    bitDepth: number;
    dataOffset: number;
    dataLength: number;
    totalSamples: number;
  } {
    const riff = buf.toString('ascii', 0, 4);
    const wave = buf.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error('Not a valid RIFF/WAVE audio file.');
    }

    let offset = 12;
    let audioFormat = 1;
    let channels = 2;
    let sampleRate = 44100;
    let bitDepth = 16;
    let dataOffset = 0;
    let dataLength = 0;

    while (offset < buf.length - 8) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      offset += 8;

      if (chunkId === 'fmt ') {
        audioFormat = buf.readUInt16LE(offset);
        channels = buf.readUInt16LE(offset + 2);
        sampleRate = buf.readUInt32LE(offset + 4);
        bitDepth = buf.readUInt16LE(offset + 14);
      } else if (chunkId === 'data') {
        dataOffset = offset;
        dataLength = chunkSize;
        break;
      }
      offset += chunkSize;
    }

    if (dataOffset === 0) {
      throw new Error('WAV data chunk not found in header.');
    }

    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const totalSamples = Math.floor(dataLength / blockAlign);

    return {
      audioFormat,
      channels,
      sampleRate,
      bitDepth,
      dataOffset,
      dataLength,
      totalSamples
    };
  }
}
