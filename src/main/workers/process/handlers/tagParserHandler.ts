import fs from 'fs/promises';
import path from 'path';
import { File } from 'node-taglib-sharp';

import { parseGenreList } from '../../../../common/genreUtils';
import { detectSongLanguage } from '../../../parseSong/detectLanguage';
import { extractFrontCover } from '../../../utils/extractFrontCover';
import type { ParsedTrackDTO } from '../workerProtocol';

const ARTIST_SEPARATOR_REGEX = /[,&]/gm;

export function getArtistNames(artists?: string): string[] {
  if (artists) {
    return artists
      .split(ARTIST_SEPARATOR_REGEX)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }
  return [];
}

export function formatDuration(durationSeconds?: number): string {
  if (typeof durationSeconds === 'number' && !isNaN(durationSeconds)) {
    return durationSeconds.toFixed(2);
  }
  return '0.00';
}

/**
 * Worker-side single audio file parser.
 * Reads ID3/Vorbis/MP4 tags using node-taglib-sharp in the utilityProcess.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Zero database dependencies, zero ORM imports.
 * 2. 100% read-only filesystem access.
 * 3. Taglib file handles MUST be disposed in a finally block to prevent resource leaks.
 */
export async function parseTrackMetadata(
  songPath: string,
  folderId?: number
): Promise<ParsedTrackDTO> {
  const stats = await fs.stat(songPath);
  const file = File.createFromPath(songPath);

  try {
    const metadata = file.tag;
    const songTitle =
      metadata.title ||
      path.basename(songPath, path.extname(songPath)) ||
      'Unknown Title';

    const artists = getArtistNames(metadata.performers?.join(', '));
    const albumArtists = getArtistNames(metadata.albumArtists?.join(', '));
    const album = metadata.album?.trim() ? metadata.album.trim() : undefined;
    const genres = parseGenreList(metadata.genres);
    const duration = formatDuration(file.properties.durationMilliseconds / 1000);
    const detectedLanguage = detectSongLanguage(metadata, songPath, songTitle, artists);
    const rawPictureBytes = extractFrontCover(metadata.pictures);

    return {
      songPath,
      folderId,
      title: songTitle,
      duration,
      artists,
      albumArtists,
      album,
      genres,
      year: metadata.year || undefined,
      trackNumber: metadata.track ?? undefined,
      diskNumber: metadata.disc ?? undefined,
      bitRate: file.properties.audioBitrate ? Math.ceil(file.properties.audioBitrate) : undefined,
      sampleRate: file.properties.audioSampleRate,
      noOfChannels: file.properties.audioChannels,
      musicBrainzRecordingId: metadata.musicBrainzTrackId || (metadata as unknown as Record<string, string>).musicBrainzRecordingId || undefined,
      isrc: metadata.isrc || undefined,
      language: detectedLanguage,
      fileCreatedAt: stats ? stats.birthtime : new Date(),
      fileModifiedAt: stats ? stats.mtime : new Date(),
      rawPictureBytes
    };
  } finally {
    try {
      file.dispose?.();
    } catch {
      // Ignore dispose errors
    }
  }
}

export interface ParseBatchOptions {
  taskId: string;
  batchSize?: number;
  maxConcurrency?: number;
  abortSignal?: AbortSignal;
  onBatchReady: (batch: {
    batchId: number;
    isLastBatch: boolean;
    tracks: ParsedTrackDTO[];
    errors: Array<{ path: string; error: string; code?: string }>;
  }) => Promise<void>;
}

/**
 * Parses an array of tracks in bounded batches (default 100) with backpressure.
 * Pauses before parsing the next batch until onBatchReady (the Main process ACK) resolves.
 */
export async function parseTracksStreaming(
  tracks: Array<{ songPath: string; folderId?: number }>,
  options: ParseBatchOptions
): Promise<void> {
  const {
    batchSize = 100,
    maxConcurrency = 8,
    abortSignal,
    onBatchReady
  } = options;

  let batchId = 0;
  const totalTracks = tracks.length;

  for (let i = 0; i < totalTracks; i += batchSize) {
    if (abortSignal?.aborted) break;

    const slice = tracks.slice(i, i + batchSize);
    const isLastBatch = i + batchSize >= totalTracks;
    batchId++;

    const parsedTracks: ParsedTrackDTO[] = [];
    const errors: Array<{ path: string; error: string; code?: string }> = [];

    // Bounded concurrency processing within the batch
    const poolSize = Math.min(maxConcurrency, slice.length);
    let sliceIndex = 0;

    const worker = async () => {
      while (sliceIndex < slice.length) {
        if (abortSignal?.aborted) break;

        const currentItem = slice[sliceIndex++];
        try {
          const parsed = await parseTrackMetadata(currentItem.songPath, currentItem.folderId);
          parsedTracks.push(parsed);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const code = (err as Record<string, unknown>)?.code;
          errors.push({
            path: currentItem.songPath,
            error: msg,
            code: typeof code === 'string' ? code : undefined
          });
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < poolSize; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (abortSignal?.aborted) break;

    // Backpressure yield: pause worker execution until Main process commits this batch
    await onBatchReady({
      batchId,
      isLastBatch,
      tracks: parsedTracks,
      errors
    });
  }
}
