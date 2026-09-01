import { randomUUID } from 'crypto';
import { mkdirSync, readdirSync, renameSync, rmSync, copyFileSync, statSync } from 'fs';
import path from 'path';

import logger from '@main/logger';
import { TagWriterService } from '@main/metadata/services/TagWriterService';

import {
  ONLINE_DOWNLOADS_MAX_DURATION_SECS,
  type DownloadJobState,
  type DuplicatePolicy,
  type EnqueueDownloadInput,
  type DownloadsSnapshot
} from './models/downloadTypes';
import { assertUrlResolvesToPublicHost, UnsafeUrlError } from './services/artworkUrlGuard';
import type { OnlineExtractor } from './services/OnlineExtractor';

const CONCURRENCY = 2;
const MIN_FILE_SIZE_BYTES = 10 * 1024;
const MAX_TRACKED_JOBS = 200;
const PROGRESS_EVENT_THROTTLE_MS = 400;

export interface DownloadSettings {
  destinationFolder: string;
  duplicatePolicy: DuplicatePolicy;
}

export interface DownloadManagerOptions {
  extractor: OnlineExtractor;
  stagingRoot: string;
  resolveSettings: () => Promise<DownloadSettings>;
  /** Pushes a snapshot to the renderer (wired to webContents.send by IPC setup). */
  publish?: (snapshot: DownloadsSnapshot) => void;
  /**
   * Called after a file reached its final destination. Lets the host app nudge library change
   * tracking for scan modes without filesystem watchers.
   */
  onFileFinalized?: (finalPath: string) => void;
}

type JobRecord = DownloadJobState & {
  abortController?: AbortController;
  thumbnailUrl?: string;
  /** Expected duration from the listing, for the soft drift warning. */
  durationSecs?: number;
  /** Internal: set right before moving so cancellation cannot race the move. */
  isFinalizing?: boolean;
  /**
   * Internal: set when cancellation arrives before the job pipeline created its AbortController
   * (e.g. while suspended on settings resolution).
   */
  cancelRequested?: boolean;
};

/**
 * Orchestrates online downloads: queue -> extract into staging -> verify -> tag -> atomic move into
 * the user's music folder. The filesystem remains the source of truth; ingestion happens
 * exclusively through the normal scanner.
 *
 * A playlist download is simply many jobs enqueued with the same playlistId.
 */
export class DownloadManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: string[] = [];
  private activeCount = 0;
  private readonly tagWriter = new TagWriterService();

  constructor(private readonly options: DownloadManagerOptions) {}

  getSnapshot(): DownloadsSnapshot {
    const jobs = [...this.jobs.values()].map(toPublicState);
    return {
      jobs,
      activeCount: this.activeCount,
      queuedCount: this.queue.length
    };
  }

  /**
   * Enqueues one track. Returns the affected job id. Deduping happens against tracked jobs (by
   * videoId) and existing files in the destination folder.
   */
  async enqueue(
    input: EnqueueDownloadInput
  ): Promise<{ jobId: string; status: DownloadJobState['status'] }> {
    const settings = await this.options.resolveSettings();
    if (!settings.destinationFolder) {
      throw new Error('No download folder configured.');
    }

    const existing = this.findByVideoId(input.videoId);
    if (existing && !['FAILED', 'CANCELLED'].includes(existing.status)) {
      return { jobId: existing.jobId, status: existing.status };
    }

    const duplicateFile = this.findExistingFileByVideoId(settings.destinationFolder, input.videoId);
    if (duplicateFile && settings.duplicatePolicy === 'SKIP') {
      const record = this.createRecord(input);
      this.finish(record, 'SKIPPED_DUPLICATE');
      this.publish();
      return { jobId: record.jobId, status: record.status };
    }

    const record = this.createRecord(input);
    this.queue.push(record.jobId);
    this.publish();
    this.pump();

    return { jobId: record.jobId, status: record.status };
  }

  /** Convenience wrapper used by the playlist flow. */
  async enqueueMany(
    inputs: EnqueueDownloadInput[]
  ): Promise<{ queued: number; duplicates: number }> {
    let queued = 0;
    let duplicates = 0;
    for (const input of inputs) {
      const { status } = await this.enqueue(input);
      if (status === 'SKIPPED_DUPLICATE') duplicates += 1;
      else if (['QUEUED', 'DOWNLOADING', 'COMPLETED', 'FINALIZING'].includes(status)) queued += 1;
    }
    return { queued, duplicates };
  }

  cancel(jobId: string): boolean {
    const record = this.jobs.get(jobId);
    if (!record) return false;

    const queueIndex = this.queue.indexOf(jobId);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
      this.finish(record, 'CANCELLED');
      this.publish();
      return true;
    }

    if (
      record.isFinalizing ||
      ['COMPLETED', 'SKIPPED_DUPLICATE', 'CANCELLED', 'FAILED'].includes(record.status)
    ) {
      return false;
    }
    record.cancelRequested = true;
    record.abortController?.abort();
    return true;
  }

  cancelPlaylistJobs(playlistId: string): number {
    let cancelled = 0;
    for (const record of this.jobs.values()) {
      if (record.playlistId === playlistId && this.cancel(record.jobId)) cancelled += 1;
    }
    return cancelled;
  }

  /**
   * Cancels every queued and active job. Used on app shutdown so spawned yt-dlp processes never
   * outlive the app.
   */
  cancelAll(): number {
    let cancelled = 0;
    for (const jobId of [...this.queue]) {
      if (this.cancel(jobId)) cancelled += 1;
    }
    for (const record of this.jobs.values()) {
      if (
        record.isFinalizing ||
        ['COMPLETED', 'SKIPPED_DUPLICATE', 'CANCELLED', 'FAILED'].includes(record.status)
      ) {
        continue;
      }
      if (!record.cancelRequested) cancelled += 1;
      record.cancelRequested = true;
      record.abortController?.abort();
    }
    return cancelled;
  }

  private findByVideoId(videoId: string): JobRecord | undefined {
    for (const record of this.jobs.values()) {
      if (record.videoId === videoId) return record;
    }
    return undefined;
  }

  /** Matches `<anything>[<videoId>].<ext>` inside the destination folder. */
  private findExistingFileByVideoId(folder: string, videoId: string): string | null {
    try {
      for (const entry of readdirSync(folder)) {
        if (entry.includes(`[${videoId}]`)) return path.join(folder, entry);
      }
    } catch {
      // Folder missing/unreadable: treat as no duplicates.
    }
    return null;
  }

  private createRecord(input: EnqueueDownloadInput): JobRecord {
    const record: JobRecord = {
      jobId: randomUUID(),
      sourceType: this.options.extractor.id,
      videoId: input.videoId,
      title: input.title,
      artist: input.artist,
      album: input.album,
      playlistId: input.playlistId,
      playlistName: input.playlistName,
      status: 'QUEUED',
      progress: 0,
      thumbnailUrl: input.thumbnailUrl,
      durationSecs: input.durationSecs,
      createdAt: Date.now()
    };
    this.jobs.set(record.jobId, record);
    this.trimTrackedJobs();
    return record;
  }

  private trimTrackedJobs() {
    if (this.jobs.size <= MAX_TRACKED_JOBS) return;
    const terminalOrder: DownloadJobState['status'][] = [
      'FAILED',
      'CANCELLED',
      'SKIPPED_DUPLICATE',
      'COMPLETED'
    ];
    for (const status of terminalOrder) {
      for (const [jobId, record] of this.jobs) {
        if (this.jobs.size <= MAX_TRACKED_JOBS) return;
        if (record.status === status) this.jobs.delete(jobId);
      }
    }
  }

  private pump() {
    while (this.activeCount < CONCURRENCY && this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const record = this.jobs.get(jobId);
      if (!record) continue;
      this.activeCount += 1;
      void this.processJob(record)
        .catch((error) => {
          // Defensive: processJob handles its own errors, but a throw from its
          // finally block must never become an unhandled rejection.
          logger.error('[DownloadManager] Unexpected job pipeline error.', { error });
        })
        .finally(() => {
          this.activeCount -= 1;
          this.pump();
        });
    }
  }

  private async processJob(record: JobRecord): Promise<void> {
    const settings = await this.options.resolveSettings().catch((error) => {
      logger.error('[DownloadManager] Failed to load settings.', { error });
      return null;
    });

    if (!settings?.destinationFolder) {
      this.fail(record, 'No download folder configured.');
      return;
    }

    // Cancellation may have arrived while this job was suspended on settings.
    if (record.cancelRequested) {
      this.finish(record, 'CANCELLED');
      return;
    }

    const stagingDir = path.join(this.options.stagingRoot, record.jobId);
    const abortController = new AbortController();
    record.abortController = abortController;

    try {
      mkdirSync(stagingDir, { recursive: true });

      record.status = 'DOWNLOADING';
      record.progress = 0;
      this.publish();

      let lastPublish = 0;
      const output = await this.options.extractor.download({
        videoId: record.videoId,
        outputDir: stagingDir,
        abortSignal: abortController.signal,
        onProgress: (percent) => {
          record.progress = Math.min(99, Math.max(0, Math.round(percent)));
          const now = Date.now();
          if (now - lastPublish > PROGRESS_EVENT_THROTTLE_MS) {
            lastPublish = now;
            this.publish();
          }
        }
      });

      // From here on, cancelling mid-move could corrupt the library folder,
      // so the job becomes un-cancellable until it settles.
      record.isFinalizing = true;
      record.status = 'FINALIZING';
      record.progress = 100;
      this.publish();

      const stats = statSync(output.filePath);
      if (stats.size < MIN_FILE_SIZE_BYTES) {
        throw new Error('The downloaded audio file is suspiciously small and was discarded.');
      }

      // Independent of any search/playlist filtering: the finished file itself
      // must satisfy the duration contract (guards direct IPC enqueues).
      await enforceDurationContract(output.filePath, record.durationSecs);

      const artworkBuffer = await fetchArtwork(record.thumbnailUrl);
      const tagResult = await this.tagWriter.writeTags({
        filePath: output.filePath,
        title: record.title,
        artist: record.artist ?? undefined,
        album: record.album ?? undefined,
        artworkBuffer: artworkBuffer ?? undefined
      });
      if (!tagResult.success) {
        // Tags are an enhancement; a failed write must not lose the track.
        logger.warn('[DownloadManager] Tagging failed, keeping untagged file.', {
          error: tagResult.error,
          jobId: record.jobId
        });
      }

      const finalPath = this.moveToDestination(
        output.filePath,
        settings.destinationFolder,
        settings.duplicatePolicy
      );

      record.filePath = finalPath;
      this.finish(record, 'COMPLETED');
      // The hook may be asynchronous; a rejection inside it must never become
      // an unhandled rejection in the main process.
      void Promise.resolve(this.options.onFileFinalized?.(finalPath)).catch((hookError) => {
        logger.warn('[DownloadManager] onFileFinalized hook failed.', { error: hookError });
      });
      logger.info('[DownloadManager] Download finished.', {
        jobId: record.jobId,
        title: record.title,
        finalPath
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        this.finish(record, 'CANCELLED');
      } else if (error instanceof DuplicateSkippedError) {
        // A file with the same videoId appeared between enqueue and move.
        this.finish(record, 'SKIPPED_DUPLICATE');
      } else {
        logger.error('[DownloadManager] Download failed.', { error, jobId: record.jobId });
        this.fail(record, error instanceof Error ? error.message : String(error));
      }
    } finally {
      // Always: success moved the file out (empty dir remains), cancel/failure
      // may have left partial data behind. Nothing may survive in staging.
      this.cleanupStaging(stagingDir);
      record.abortController = undefined;
      record.isFinalizing = false;
      this.publish();
    }
  }

  /**
   * Moves the staged file into the destination folder. renameSync keeps the move atomic on the same
   * volume; across volumes we copy next to the destination and rename locally so the scanner never
   * sees a partial file.
   */
  private moveToDestination(
    stagedFilePath: string,
    destinationFolder: string,
    policy: DuplicatePolicy
  ): string {
    mkdirSync(destinationFolder, { recursive: true });

    const ext = path.extname(stagedFilePath);
    const baseName = path.basename(stagedFilePath, ext);
    let target = path.join(destinationFolder, `${baseName}${ext}`);

    if (policy !== 'OVERWRITE' && exists(target)) {
      if (policy === 'KEEP_BOTH') {
        let counter = 2;
        do {
          target = path.join(destinationFolder, `${baseName} (${counter})${ext}`);
          counter += 1;
        } while (exists(target));
      } else {
        throw new DuplicateSkippedError(target);
      }
    }

    try {
      renameSync(stagedFilePath, target);
    } catch (error) {
      if (isCrossDeviceError(error)) {
        const tempTarget = path.join(destinationFolder, `.${baseName}${ext}.tmp`);
        try {
          copyFileSync(stagedFilePath, tempTarget);
          renameSync(tempTarget, target);
        } catch (moveError) {
          // Never leave hidden .tmp clutter in the user's music folder.
          rmSync(tempTarget, { force: true });
          throw moveError;
        }
        rmSync(stagedFilePath, { force: true });
      } else {
        throw error;
      }
    }
    return target;
  }

  private cleanupStaging(stagingDir: string) {
    try {
      rmSync(stagingDir, { recursive: true, force: true });
    } catch (error) {
      // A locked file (e.g. antivirus or a lingering yt-dlp child) must never
      // escape the finally block as an unhandled rejection.
      logger.warn('[DownloadManager] Failed to clean staging directory.', { error, stagingDir });
    }
  }

  private fail(record: JobRecord, message: string) {
    record.status = 'FAILED';
    record.error = message;
    this.publish();
  }

  private finish(record: JobRecord, status: Exclude<DownloadJobState['status'], 'FAILED'>) {
    record.status = status;
    if (status === 'CANCELLED' || status === 'SKIPPED_DUPLICATE') {
      record.progress = 0;
    }
    this.publish();
  }

  private publish() {
    this.options.publish?.({
      jobs: [...this.jobs.values()].map(toPublicState),
      activeCount: this.activeCount,
      queuedCount: this.queue.length
    });
  }
}

export class DuplicateSkippedError extends Error {
  constructor(public readonly existingPath: string) {
    super('Duplicate skipped.');
    this.name = 'DuplicateSkippedError';
  }
}

function toPublicState(record: JobRecord): DownloadJobState {
  return {
    jobId: record.jobId,
    sourceType: record.sourceType,
    videoId: record.videoId,
    title: record.title,
    artist: record.artist,
    album: record.album,
    playlistId: record.playlistId,
    playlistName: record.playlistName,
    status: record.status,
    progress: record.progress,
    filePath: record.filePath,
    error: record.error,
    createdAt: record.createdAt
  };
}

/** Maximum artwork payload size (5 MB). Anything larger is almost certainly not album art. */
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;

/** Upper bound on redirects followed while fetching artwork. */
const MAX_ARTWORK_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Performs the fetch with every redirect hop validated before it is requested: scheme allowlist
 * plus DNS/IP checks against loopback, private, link-local (cloud metadata), and other non-routable
 * destinations. A compromised renderer must not be able to make the main process fetch internal
 * resources.
 */
async function fetchArtworkResponse(url: string): Promise<Response> {
  let currentUrl = url;
  for (let hop = 0; ; hop += 1) {
    await assertUrlResolvesToPublicHost(currentUrl);
    const response = await fetch(currentUrl, { redirect: 'manual' });

    if (!REDIRECT_STATUSES.has(response.status)) return response;
    try {
      await response.body?.cancel();
    } catch {
      // Drain failures are irrelevant for discarded redirect bodies.
    }

    if (hop >= MAX_ARTWORK_REDIRECTS) {
      throw new UnsafeUrlError(`Too many redirects fetching artwork from ${url}`);
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new UnsafeUrlError(`Redirect without Location header from ${currentUrl}`);
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
}

async function fetchArtwork(url?: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetchArtworkResponse(url);
    if (!response.ok) return null;

    // Reject responses that are obviously not images.
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.startsWith('image/')) {
      logger.warn('[DownloadManager] Rejected artwork response with non-image content-type.', {
        contentType
      });
      return null;
    }

    // Stream with a size cap to prevent OOM from unbounded payloads.
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = response.body?.getReader();
    if (!reader) return null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ARTWORK_BYTES) {
        await reader.cancel();
        logger.warn('[DownloadManager] Artwork response exceeded size limit; discarding.', {
          totalBytes,
          limit: MAX_ARTWORK_BYTES
        });
        return null;
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    return buffer.length > 0 ? buffer : null;
  } catch (error) {
    logger.warn('[DownloadManager] Artwork fetch failed; continuing without cover art.', { error });
    return null;
  }
}

function exists(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies the finished file against the duration contract: - hard limit: longer-than-max files
 * (e.g. full sets uploaded as "songs") are rejected even when they bypassed search/playlist
 * filtering; - soft check: a mismatch against the expected duration is logged only, since YouTube
 * upload durations frequently differ slightly from releases.
 */
async function enforceDurationContract(
  filePath: string,
  expectedDurationSecs?: number
): Promise<void> {
  const { File } = await import('node-taglib-sharp');
  let actualMs: number | undefined;
  const file = File.createFromPath(filePath);
  try {
    actualMs = file.properties?.durationMilliseconds;
  } finally {
    file.dispose();
  }

  if (!actualMs || actualMs <= 0) return;

  const actualSecs = actualMs / 1000;
  if (actualSecs > ONLINE_DOWNLOADS_MAX_DURATION_SECS) {
    throw new Error(
      `The downloaded audio is ${Math.round(actualSecs / 60)} minutes long, which exceeds ` +
        `${ONLINE_DOWNLOADS_MAX_DURATION_SECS / 60} minutes. It looks like this result was not a song.`
    );
  }

  if (expectedDurationSecs && expectedDurationSecs > 0) {
    const driftSecs = Math.abs(actualSecs - expectedDurationSecs);
    if (driftSecs > Math.max(15, expectedDurationSecs * 0.25)) {
      logger.warn('[DownloadManager] Downloaded duration differs notably from the listing.', {
        filePath,
        expectedDurationSecs,
        actualDurationSecs: Math.round(actualSecs)
      });
    }
  }
}

function isCrossDeviceError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EXDEV'
  );
}
