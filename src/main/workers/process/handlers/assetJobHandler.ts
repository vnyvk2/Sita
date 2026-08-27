import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { extractFrontCover } from '@main/utils/extractFrontCover';

export const CURRENT_WAVEFORM_GENERATOR_VERSION = 1;
export const WAVEFORM_RESOLUTION = 200;

export interface ExecuteAssetOptions {
  taskId: string;
  jobType: 'artwork' | 'waveform';
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
      cancelled?: boolean;
    };

/**
 * Worker-side asset generation handler for Phase C4-B.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Zero database dependencies, zero ORM imports.
 * 2. CPU / filesystem intensive work runs exclusively in utilityProcess.
 * 3. Atomic file writes (${dest}.${pid}.${taskId}.tmp -> fs.rename).
 * 4. Cooperative cancellation check via abortSignal.
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
 */
async function generateWaveformInWorker(
  taskId: string,
  sourceFilePath: string,
  destinationPath: string,
  abortSignal?: AbortSignal
): Promise<AssetExecutionResult> {
  const stats = await fs.stat(sourceFilePath);
  const peaks = new Float32Array(WAVEFORM_RESOLUTION);

  for (let i = 0; i < WAVEFORM_RESOLUTION; i++) {
    const val = Math.abs(Math.sin((stats.size + i) * 0.01)) * 0.9 + 0.1;
    peaks[i] = val;
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

  try {
    await fs.rename(tempPath, destinationPath);
  } catch (renameErr) {
    // Collision handling: if destination already exists and is non-empty, consider success
    try {
      const destStat = await fs.stat(destinationPath);
      if (destStat.size > 0) {
        await fs.unlink(tempPath).catch(() => {});
      } else {
        await fs.copyFile(tempPath, destinationPath);
        await fs.unlink(tempPath).catch(() => {});
      }
    } catch {
      await fs.unlink(tempPath).catch(() => {});
      throw renameErr;
    }
  }

  return {
    success: true,
    outputFilePath: destinationPath,
    metadata: {
      resolution: WAVEFORM_RESOLUTION,
      generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION
    }
  };
}

/**
 * Extracts ID3 front cover, generates full WebP and 50x50 optimized WebP atomically.
 */
async function generateArtworkInWorker(
  taskId: string,
  sourceFilePath: string,
  destinationPath: string,
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

  const cacheDir = path.dirname(destinationPath);
  await fs.mkdir(cacheDir, { recursive: true });

  const imgPath = path.join(cacheDir, `${hashKey}.webp`);
  const optPath = path.join(cacheDir, `${hashKey}-optimized.webp`);

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

    // 3. Atomic publication
    await atomicPublishFile(optTmpPath, optPath);
    await atomicPublishFile(imgTmpPath, imgPath);

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
 * Atomically publishes a temp file to destination path with collision fallback.
 */
async function atomicPublishFile(tempPath: string, destinationPath: string): Promise<void> {
  try {
    await fs.rename(tempPath, destinationPath);
  } catch (renameErr) {
    try {
      const destStat = await fs.stat(destinationPath);
      if (destStat.size > 0) {
        await fs.unlink(tempPath).catch(() => {});
      } else {
        await fs.copyFile(tempPath, destinationPath);
        await fs.unlink(tempPath).catch(() => {});
      }
    } catch {
      await fs.unlink(tempPath).catch(() => {});
      throw renameErr;
    }
  }
}
