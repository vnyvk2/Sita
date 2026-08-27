import type { AudioDecoder, AudioFormatInfo, DecodeChunk, DecodeStreamOptions } from './types';
import { WavAudioDecoder } from './decoders/WavAudioDecoder';

export class AudioDecoderRegistry {
  private readonly decoders: AudioDecoder[] = [];

  constructor() {
    // Register genuinely supported streaming decoders
    this.decoders.push(new WavAudioDecoder());
  }

  public registerDecoder(decoder: AudioDecoder): void {
    this.decoders.unshift(decoder);
  }

  public getDecoderForFile(filePath: string): AudioDecoder | null {
    for (const decoder of this.decoders) {
      if (decoder.supports(filePath)) {
        return decoder;
      }
    }
    return null;
  }

  public async probe(filePath: string): Promise<AudioFormatInfo> {
    const decoder = this.getDecoderForFile(filePath);
    if (!decoder) {
      throw new Error(`Unsupported audio format for file: ${filePath}`);
    }
    return decoder.probe(filePath);
  }

  public async decodeStream(
    filePath: string,
    options: DecodeStreamOptions,
    onChunk: (chunk: DecodeChunk) => Promise<void> | void
  ): Promise<void> {
    const decoder = this.getDecoderForFile(filePath);
    if (!decoder) {
      throw new Error(`Unsupported audio format for file: ${filePath}`);
    }
    return decoder.decodeStream(filePath, options, onChunk);
  }
}

export const defaultAudioDecoderRegistry = new AudioDecoderRegistry();
