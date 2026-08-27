export interface AudioFormatInfo {
  sampleRate: number;
  channels: number;
  duration: number; // in seconds
  totalSamples: number; // total frames / sample points per channel
  codec: string;
  bitDepth?: number;
}

export interface DecodeChunk {
  /**
   * Normalized audio samples in range [-1.0, 1.0] per channel.
   * channelData[0] is Left (or Mono), channelData[1] is Right, etc.
   */
  channelData: Float32Array[];
  /**
   * Zero-indexed starting frame position of this chunk relative to the entire track.
   */
  sampleOffset: number;
  /**
   * Total number of frames in this chunk.
   */
  frameCount: number;
  /**
   * Total estimated/known frames in the entire audio track.
   */
  totalSamples: number;
}

export interface DecodeStreamOptions {
  abortSignal?: AbortSignal;
  /**
   * Target frame count per chunk to bound memory usage.
   * Default is typically 16,384 frames (approx. 64KB per channel buffer).
   */
  chunkSize?: number;
}

export interface AudioDecoder {
  readonly codec: string;
  supports(filePath: string): boolean;
  probe(filePath: string): Promise<AudioFormatInfo>;
  decodeStream(
    filePath: string,
    options: DecodeStreamOptions,
    onChunk: (chunk: DecodeChunk) => Promise<void> | void
  ): Promise<void>;
}
