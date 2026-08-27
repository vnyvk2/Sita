import type { DecodeChunk } from './types';

export const WAVEFORM_NUM_BINS = 200;

/**
 * WaveformAccumulator
 *
 * Incremental, single-pass waveform peak generator.
 * Processes bounded Float32Array PCM chunks and accumulates maximum absolute amplitude
 * across channels into exactly 200 temporal bins without whole-file buffering.
 *
 * Invariant: Memory consumption is strictly O(1) (fixed 200-element Float32Array).
 */
export class WaveformAccumulator {
  private readonly numBins: number;
  private readonly bins: Float32Array;
  private totalExpectedSamples: number;
  private highestSampleProcessed: number = 0;

  constructor(totalExpectedSamples: number, numBins = WAVEFORM_NUM_BINS) {
    this.numBins = numBins;
    this.bins = new Float32Array(numBins);
    this.totalExpectedSamples = Math.max(1, totalExpectedSamples);
  }

  /**
   * Updates the total expected sample count if probed estimation differs from actual stream.
   */
  public setTotalSamples(totalSamples: number): void {
    if (totalSamples > 0) {
      this.totalExpectedSamples = totalSamples;
    }
  }

  /**
   * Consumes a bounded PCM chunk from the audio decoder stream.
   */
  public processChunk(chunk: DecodeChunk): void {
    const { channelData, sampleOffset, frameCount, totalSamples } = chunk;
    if (totalSamples > 0 && totalSamples !== this.totalExpectedSamples) {
      this.totalExpectedSamples = totalSamples;
    }

    const numChannels = channelData.length;
    if (numChannels === 0 || frameCount === 0) return;

    for (let i = 0; i < frameCount; i++) {
      const globalFrameIndex = sampleOffset + i;
      this.highestSampleProcessed = Math.max(this.highestSampleProcessed, globalFrameIndex + 1);

      // Map frame index to bin [0, 199]
      const binIndex = Math.min(
        this.numBins - 1,
        Math.floor((globalFrameIndex * this.numBins) / this.totalExpectedSamples)
      );

      // Find peak amplitude across all channels for this sample frame
      let peakAmp = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = channelData[ch][i];
        const absVal = Math.abs(sample);
        if (absVal > peakAmp) {
          peakAmp = absVal;
        }
      }

      if (peakAmp > this.bins[binIndex]) {
        this.bins[binIndex] = Math.min(1.0, peakAmp);
      }
    }
  }

  /**
   * Finalizes the waveform extraction and returns a normalized Float32Array(200).
   */
  public finish(): Float32Array {
    // If total processed samples was shorter/longer than initially expected, rescale empty tail/gaps if needed
    const result = new Float32Array(this.numBins);
    for (let b = 0; b < this.numBins; b++) {
      result[b] = Math.min(1.0, Math.max(0.0, this.bins[b]));
    }
    return result;
  }
}
