import {
  calculateIntegratedLoudnessFromBlocks,
  type GatedLoudnessResult
} from './BS1770LoudnessEngine';
import { calculateLoudnessGain, type ReplayGainOptions } from './ReplayGainPolicy';

export interface TrackLoudnessData {
  songId: number;
  blockEnergies: ArrayLike<number>; // Float64Array or number[]
  samplePeak: number; // discrete sample peak (ITU-R BS.1770 sample peak, not true peak)
}

export interface AlbumLoudnessResult {
  albumLoudness: number;
  albumGain: number;
  albumPeak: number;
  totalBlocksProcessed: number;
  totalBlocksSurvivingGate: number;
}

/**
 * AlbumLoudnessAggregator
 *
 * Implements pure ITU-R BS.1770-4 / EBU R128 multi-track album loudness aggregation.
 *
 * Architectural & Mathematical Invariants:
 *
 * 1. Album integrated loudness is NEVER computed by averaging per-track LUFS numbers.
 * 2. 400ms block energies from all tracks in the album are pooled into a single collection.
 * 3. Absolute Gating (-70.0 LKFS) and Relative Gating (Gamma - 10.0 LU) are evaluated over the
 *    combined album blocks.
 * 4. Album peak is strictly the maximum discrete sample peak across all tracks: albumPeak =
 *    max(track1.samplePeak, ..., trackN.samplePeak).
 * 5. Album gain is computed from the target loudness policy using the album integrated loudness.
 *
 * Complexity:
 *
 * - Working memory: O(total_album_blocks) where total_album_blocks ~= 10 per second across all tracks
 *   (e.g., ~216 KB of Float64 values for a 45-minute album).
 * - Computation: Two linear passes over the pooled album blocks.
 */
export class AlbumLoudnessAggregator {
  /**
   * Aggregates multiple tracks' loudness block data into an album-level loudness result.
   *
   * @param tracks Array of track block energies and discrete sample peaks.
   * @param policyOptions Optional ReplayGain policy options (default: target -18 LUFS).
   * @returns AlbumLoudnessResult with genuine album integrated loudness, gain, and peak.
   */
  public static aggregate(
    tracks: TrackLoudnessData[],
    policyOptions?: ReplayGainOptions
  ): AlbumLoudnessResult {
    if (!tracks || tracks.length === 0) {
      const defaultGain = calculateLoudnessGain(-Infinity, policyOptions);
      return {
        albumLoudness: -Infinity,
        albumGain: defaultGain,
        albumPeak: 0.0,
        totalBlocksProcessed: 0,
        totalBlocksSurvivingGate: 0
      };
    }

    // 1. Calculate total album blocks across all tracks
    let totalBlockCount = 0;
    let maxDiscretePeak = 0.0;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      totalBlockCount += track.blockEnergies.length;
      if (Number.isFinite(track.samplePeak) && track.samplePeak > maxDiscretePeak) {
        maxDiscretePeak = track.samplePeak;
      }
    }

    if (totalBlockCount === 0) {
      const defaultGain = calculateLoudnessGain(-Infinity, policyOptions);
      return {
        albumLoudness: -Infinity,
        albumGain: defaultGain,
        albumPeak: Math.round(maxDiscretePeak * 10000) / 10000,
        totalBlocksProcessed: 0,
        totalBlocksSurvivingGate: 0
      };
    }

    // 2. Pool all 64-bit block energies into a continuous Float64Array
    const pooledBlocks = new Float64Array(totalBlockCount);
    let writeOffset = 0;

    for (let t = 0; t < tracks.length; t++) {
      const trackBlocks = tracks[t].blockEnergies;
      const len = trackBlocks.length;
      for (let b = 0; b < len; b++) {
        pooledBlocks[writeOffset++] = trackBlocks[b];
      }
    }

    // 3. Run pure BS.1770-4 dual-stage gating over the pooled album blocks
    const gated: GatedLoudnessResult = calculateIntegratedLoudnessFromBlocks(pooledBlocks);

    // 4. Calculate Album Gain using ReplayGain policy
    const albumGain = calculateLoudnessGain(gated.integratedLoudness, policyOptions);

    return {
      albumLoudness: gated.integratedLoudness,
      albumGain,
      albumPeak: Math.round(maxDiscretePeak * 10000) / 10000,
      totalBlocksProcessed: gated.blocksProcessed,
      totalBlocksSurvivingGate: gated.blocksSurvivingGate
    };
  }
}
