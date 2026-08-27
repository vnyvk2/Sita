import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { extractFrontCover } from '@main/utils/extractFrontCover';
import { defaultAudioDecoderRegistry } from '../audio/AudioDecoderRegistry';
import { WaveformAccumulator } from '../audio/WaveformAccumulator';
import { BS1770LoudnessEngine } from '../audio/BS1770LoudnessEngine';
import { calculateReplayGainMetrics } from '../audio/ReplayGainPolicy';

export const CURRENT_WAVEFORM_GENERATOR_VERSION = 1;
export const WAVEFORM_RESOLUTION = 200;
export const CURRENT_REPLAYGAIN_GENERATOR_VERSION = 1;

export interface ExecuteAssetOptions {
  taskId: string;
  jobType: 'artwork' | 'waveform' | 'replaygain';
  input: {
    sourceFilePath: string;
    destinationPath: string;
    metadata?: Record<string, unknown>;
  };
  abortSignal?: AbortSignal;
}

export type AssetExecutionResult =
  | {
      success: true;
      outputFilePath: string;
      metadata: Record<string, unknown>;
      cancelled?: false;
    }
  | {
      success: false;
      error: string;
      metadata?: Record<string, unknown>;
      cancelled?: boolean;
    };

/**
 * Worker-side asset generation handler for Phase C4 (Waveform, Artwork, ReplayGain).
 *
 * NOTE ON WAVEFORM & REPLAYGAIN ALGORITHMS:
 * This handler executes Nora's migrated deterministic asset algorithms (synthetic waveform peaks
 * and loudness analysis) in utilityProcess to prevent Main-process CPU contention.
 * Full audio decoding (e.g. via FFmpeg/WebAudio) is decoupled and reserved for future pipeline phases.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Zero database dependencies, zero ORM imports.
 * 2. CPU / filesystem intensive work runs exclusively in utilityProcess.
 * 3. Atomic file writes (${dest}.${pid}.${taskId}.tmp -> fs.rename).
 * 4. Cooperative cancellation check via abortSignal.
 * 5. Rollback on partial multi-file publication failures.
 */
export async function executeAssetJob(options: ExecuteAssetOptions): Promise<AssetExecutionResult> {
  const { taskId, jobType, input, abortSignal } = options;

  if (abortSignal?.aborted) {
    return {
      success: false,
      error: `Asset task ${taskId} was cancelled before execution.`,
      cancelled: true
    };
  }

  // Deterministic failure trigger for testing failure paths
  if (input.sourceFilePath.includes('__FAIL__')) {
    return {
      success: false,
      error: `Simulated asset generation failure for ${input.sourceFilePath}`
    };
  }

  try {
    if (jobType === 'waveform') {
      return await generateWaveformInWorker(taskId, input.sourceFilePath, input.destinationPath, abortSignal);
    } else if (jobType === 'artwork') {
      return await generateArtworkInWorker(taskId, input.sourceFilePath, input.destinationPath, abortSignal);
    } else if (jobType === 'replaygain') {
      return await generateReplayGainInWorker(taskId, input.sourceFilePath, input.destinationPath, abortSignal);
    } else {
      return {
        success: false,
        error: `Unknown jobType '${jobType}' requested.`
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      cancelled: abortSignal?.aborted
    };
  }
}

/**
 * Generates deterministic waveform peaks and writes atomically to destination.
 * Uses incremental streaming audio decoding (O(1) memory) when supported,
 * falling back to synthetic peaks if format is unsupported or file is corrupted.
 */
async function generateWaveformInWorker(
  taskId: string,
  sourceFilePath: string,
  destinationPath: string,
  abortSignal?: AbortSignal
): Promise<AssetExecutionResult> {
  let peaks: Float32Array;
  let metadata: Record<string, unknown>;

  const decoder = defaultAudioDecoderRegistry.getDecoderForFile(sourceFilePath);
  if (decoder) {
    try {
      const info = await decoder.probe(sourceFilePath);
      const accumulator = new WaveformAccumulator(info.totalSamples, WAVEFORM_RESOLUTION);

      await decoder.decodeStream(
        sourceFilePath,
        { abortSignal, chunkSize: 16384 },
        (chunk) => {
          accumulator.processChunk(chunk);
        }
      );

      peaks = accumulator.finish();
      metadata = {
        resolution: WAVEFORM_RESOLUTION,
        generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION,
        codec: info.codec,
        method: 'decoded'
      };
    } catch (err) {
      if (abortSignal?.aborted) {
        return {
          success: false,
          error: `Waveform generation for task ${taskId} cancelled during audio decode.`,
          cancelled: true
        };
      }
      // Re-surface decode failures for supported formats without swallowing as fake synthetic peaks
      return {
        success: false,
        error: `Audio decode failed for ${sourceFilePath}: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  } else {
    // Unsupported audio codec: return explicit failure rather than generating fake synthetic peaks
    return {
      success: false,
      error: `Unsupported audio codec for waveform generation: ${sourceFilePath}`,
      metadata: {
        method: 'unsupported_codec'
      }
    };
  }

  if (abortSignal?.aborted) {
    return {
      success: false,
      error: `Waveform generation for task ${taskId} cancelled before disk write.`,
      cancelled: true
    };
  }

  const cacheDir = path.dirname(destinationPath);
  await fs.mkdir(cacheDir, { recursive: true });

  const tempPath = `${destinationPath}.${process.pid}.${taskId}.tmp`;
  const buffer = Buffer.from(peaks.buffer);
  await fs.writeFile(tempPath, buffer);

  if (abortSignal?.aborted) {
    await fs.unlink(tempPath).catch(() => {});
    return {
      success: false,
      error: `Waveform generation for task ${taskId} cancelled after disk write.`,
      cancelled: true
    };
  }

  await atomicPublishFile(tempPath, destinationPath);

  return {
    success: true,
    outputFilePath: destinationPath,
    metadata
  };
}

/**
 * Extracts ID3 front cover, generates full WebP and 50x50 optimized WebP images atomically.
 * Rolled back if any part of the dual-image publication fails.
 */
async function generateArtworkInWorker(
  taskId: string,
  sourceFilePath: string,
  destinationDirectory: string,
  abortSignal?: AbortSignal
): Promise<AssetExecutionResult> {
  const taglib = await import('node-taglib-sharp');
  const file = taglib.File.createFromPath(sourceFilePath);
  let pictureData: Uint8Array | undefined;

  try {
    pictureData = extractFrontCover(file.tag?.pictures);
  } finally {
    file.dispose();
  }

  if (abortSignal?.aborted) {
    return {
      success: false,
      error: `Artwork extraction for task ${taskId} cancelled after tag parsing.`,
      cancelled: true
    };
  }

  if (!pictureData || pictureData.length === 0) {
    return {
      success: true,
      outputFilePath: '',
      metadata: {
        isDefaultArtwork: true,
        hasEmbeddedArtwork: false
      }
    };
  }

  const hashKey = crypto.createHash('sha256').update(pictureData).digest('hex');
  const fullHash = hashKey;
  const optHash = `${hashKey}-optimized`;

  // destinationDirectory is the target artwork cache folder (DEFAULT_ARTWORK_SAVE_LOCATION)
  await fs.mkdir(destinationDirectory, { recursive: true });

  const imgPath = path.join(destinationDirectory, `${hashKey}.webp`);
  const optPath = path.join(destinationDirectory, `${hashKey}-optimized.webp`);

  const imgTmpPath = `${imgPath}.${process.pid}.${taskId}.tmp`;
  const optTmpPath = `${optPath}.${process.pid}.${taskId}.tmp`;

  try {
    // 1. Generate 50x50 optimized WebP for palette / fast rendering
    await sharp(pictureData)
      .webp({ quality: 50, effort: 0 })
      .resize(50, 50)
      .toFile(optTmpPath);

    if (abortSignal?.aborted) {
      await fs.unlink(optTmpPath).catch(() => {});
      return {
        success: false,
        error: `Artwork processing for task ${taskId} cancelled during optimized resize.`,
        cancelled: true
      };
    }

    // 2. Generate full resolution WebP
    const info = await sharp(pictureData, { animated: true })
      .webp()
      .toFile(imgTmpPath);

    if (abortSignal?.aborted) {
      await fs.unlink(optTmpPath).catch(() => {});
      await fs.unlink(imgTmpPath).catch(() => {});
      return {
        success: false,
        error: `Artwork processing for task ${taskId} cancelled during full webp generation.`,
        cancelled: true
      };
    }

    // 3. Atomic publication with verified ownership tracking
    const publishedPaths: string[] = [];
    try {
      const optStatus = await atomicPublishFile(optTmpPath, optPath);
      if (optStatus === 'published') {
        publishedPaths.push(optPath);
      }

      const imgStatus = await atomicPublishFile(imgTmpPath, imgPath);
      if (imgStatus === 'published') {
        publishedPaths.push(imgPath);
      }
    } catch (pubError) {
      // Rollback only files newly published by this invocation
      for (const p of publishedPaths) {
        await fs.unlink(p).catch(() => {});
      }
      throw pubError;
    }

    return {
      success: true,
      outputFilePath: imgPath,
      metadata: {
        hash: hashKey,
        fullHash,
        optHash,
        width: info.width ?? 250,
        height: info.height ?? 250,
        isDefaultArtwork: false,
        hasEmbeddedArtwork: true,
        realArtworkPath: imgPath,
        realOptimizedArtworkPath: optPath,
        payloads: [
          {
            hash: fullHash,
            path: imgPath,
            width: info.width ?? 250,
            height: info.height ?? 250,
            isOptimized: false,
            source: 'LOCAL'
          },
          {
            hash: optHash,
            path: optPath,
            width: 50,
            height: 50,
            isOptimized: true,
            source: 'LOCAL'
          }
        ]
      }
    };
  } catch (error) {
    await fs.unlink(optTmpPath).catch(() => {});
    await fs.unlink(imgTmpPath).catch(() => {});
    throw error;
  }
}

/**
 * Computes ITU-R BS.1770-4 / EBU R128 loudness metrics and ReplayGain in utilityProcess (Gate D2).
 */
async function generateReplayGainInWorker(
  taskId: string,
  sourceFilePath: string,
  destinationPath?: string,
  abortSignal?: AbortSignal
): Promise<AssetExecutionResult> {
  const decoder = defaultAudioDecoderRegistry.getDecoderForFile(sourceFilePath);
  if (decoder) {
    try {
      const info = await decoder.probe(sourceFilePath);
      const engine = new BS1770LoudnessEngine(info.sampleRate, info.channels, info.channelLayout);

      await decoder.decodeStream(
        sourceFilePath,
        { abortSignal, chunkSize: 16384 },
        (chunk) => {
          engine.processChunk(chunk);
        }
      );

      const loudness = engine.finish();
      const metrics = calculateReplayGainMetrics(loudness);

      let publishedPath = '';
      if (destinationPath) {
        const cacheDir = path.dirname(destinationPath);
        await fs.mkdir(cacheDir, { recursive: true });

        const blockEnergies = engine.getBlockEnergies();
        const buffer = Buffer.from(blockEnergies.buffer, blockEnergies.byteOffset, blockEnergies.byteLength);
        const tempPath = `${destinationPath}.${process.pid}.${taskId}.tmp`;
        await fs.writeFile(tempPath, buffer);

        if (abortSignal?.aborted) {
          await fs.unlink(tempPath).catch(() => {});
          return {
            success: false,
            error: `ReplayGain analysis for task ${taskId} cancelled after disk write.`,
            cancelled: true
          };
        }

        await atomicPublishFile(tempPath, destinationPath);
        publishedPath = destinationPath;
      }

      return {
        success: true,
        outputFilePath: publishedPath,
        metadata: {
          trackGain: metrics.trackGain,
          trackPeak: metrics.trackPeak,
          samplePeak: loudness.samplePeak,
          samplePeakDb: loudness.samplePeakDb,
          integratedLoudness: loudness.integratedLoudness,
          targetLufs: metrics.targetLufs,
          codec: info.codec,
          generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
          method: 'bs1770_decoded'
        }
      };
    } catch (err) {
      if (abortSignal?.aborted) {
        return {
          success: false,
          error: `ReplayGain analysis for task ${taskId} cancelled during audio decode.`,
          cancelled: true
        };
      }
      return {
        success: false,
        error: `Audio decode failed for ${sourceFilePath}: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  } else {
    // Unsupported audio codec: return explicit failure rather than generating fake synthetic loudness
    return {
      success: false,
      error: `Unsupported audio codec for ReplayGain analysis: ${sourceFilePath}`,
      metadata: {
        method: 'unsupported_codec'
      }
    };
  }
}

/**
 * Atomically publishes a temp file to destination path.
 * Returns 'published' if this process successfully renamed the temp file to destination.
 * Returns 'already_existed' if destination already exists and is non-empty (idempotent collision).
 * Cleans up tempPath and rethrows on real I/O or permissions failures where destination is absent.
 */
export async function atomicPublishFile(
  tempPath: string,
  destinationPath: string
): Promise<'published' | 'already_existed'> {
  try {
    await fs.rename(tempPath, destinationPath);
    return 'published';
  } catch (renameErr: unknown) {
    const errCode = (renameErr as { code?: string })?.code;
    const isCollisionCandidate =
      errCode === 'EEXIST' || errCode === 'EBUSY' || errCode === 'EPERM';

    if (isCollisionCandidate) {
      try {
        const destStat = await fs.stat(destinationPath);
        if (destStat.size > 0) {
          await fs.unlink(tempPath).catch(() => {});
          return 'already_existed'; // Valid existing file, idempotent collision
        }
      } catch {
        // Destination check failed, fall through to cleanup and throw
      }
    }

    await fs.unlink(tempPath).catch(() => {});
    throw renameErr;
  }
}
