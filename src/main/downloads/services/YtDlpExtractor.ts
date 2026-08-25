import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';

import logger from '@main/logger';

import {
  ONLINE_DOWNLOADS_MAX_DURATION_SECS,
  ONLINE_PLAYLIST_MAX_ENTRIES,
  type OnlineDownloadOutput,
  type OnlineDownloadRequest,
  type OnlinePlaylistInfo,
  type OnlineTrackResult
} from '../models/downloadTypes';
import { resolveBinaryPath } from './binaryResolver';
import { ExtractorError, type OnlineExtractor, type OnlineSearchOptions } from './OnlineExtractor';

/** Containers Nora can ingest. Anything else (e.g. webm-only) is a surfaced failure. */
const SUPPORTED_EXTENSIONS = new Set(['.m4a', '.mp3', '.opus', '.ogg', '.wav', '.flac', '.aac']);

interface YtDlpFlatEntry {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  view_count?: number;
  thumbnails?: Array<{ url?: string; preference?: number; width?: number }>;
  live_status?: string;
  is_live?: boolean;
}

interface YtDlpPlaylistJson {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  entries?: YtDlpFlatEntry[];
  _type?: string;
}

export class YtDlpExtractor implements OnlineExtractor {
  readonly id = 'YOUTUBE' as const;
  readonly displayName = 'YouTube';

  async search(query: string, options?: OnlineSearchOptions): Promise<OnlineTrackResult[]> {
    const limit = options?.limit ?? 25;
    const trimmed = query.trim();
    if (!trimmed) return [];

    const json = await this.runJson([`ytsearch${limit}:${trimmed}`, '--flat-playlist']);
    const entries = Array.isArray(json.entries) ? json.entries : [];
    return this.mapEntries(entries).tracks;
  }

  async resolvePlaylist(urlOrId: string): Promise<OnlinePlaylistInfo> {
    const playlistId = extractPlaylistId(urlOrId);
    if (!playlistId) throw new ExtractorError('No YouTube playlist id found in the input.', 'NOT_FOUND');
    if (/^(RD|UL|LM)/.test(playlistId)) {
      throw new ExtractorError(
        'Radio mixes and auto playlists are unbounded and cannot be downloaded as a playlist.',
        'UNSUPPORTED_SOURCE'
      );
    }

    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    const json = await this.runJson(['--flat-playlist', '--playlist-items', `1:${ONLINE_PLAYLIST_MAX_ENTRIES}`, url]);

    const rawEntries = Array.isArray(json.entries) ? json.entries : [];
    const mapped = this.mapEntries(rawEntries);

    return {
      playlistId,
      title: json.title || playlistId,
      channel: json.channel || json.uploader,
      entries: mapped.tracks,
      excludedCount: mapped.excludedCount + Math.max(0, rawEntries.length - ONLINE_PLAYLIST_MAX_ENTRIES)
    };
  }

  describeFileName(title: string, videoId: string): string {
    // Mirrors the -o template; yt-dlp sanitizes the title for the filesystem.
    return `${sanitizeFileName(title)} [${videoId}]`;
  }

  async download(request: OnlineDownloadRequest): Promise<OnlineDownloadOutput> {
    const { videoId, outputDir, abortSignal, onProgress } = request;

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--progress',
      '--newline',
      // Audio only, no post-processing/transcode: m4a preferred (near-universal),
      // ogg-opus as fallback. Plain-webm results are rejected during verification.
      '-f',
      'bestaudio[ext=m4a]/bestaudio[ext=opus]',
      '--windows-filenames',
      '--trim-filenames',
      '120',
      '--progress-template',
      'download:NORA_PROGRESS:%(progress._percent_str)s',
      '-o',
      path.join(outputDir, '%(title)s [%(id)s].%(ext)s'),
      watchUrlFor(videoId)
    ];

    const child = spawn(resolveBinaryPath('yt-dlp'), args, { windowsHide: true });

    let stderrTail = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n|\r/)) {
        const match = line.match(/NORA_PROGRESS:\s*([\d.]+)%/);
        if (match) onProgress?.(Number.parseFloat(match[1]));
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });

    const abortHandler = () => {
      logger.info('[YtDlpExtractor] Cancelling download', { videoId });
      killProcessTree(child);
    };
    if (abortSignal.aborted) abortHandler();
    else abortSignal.addEventListener('abort', abortHandler, { once: true });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code));
    }).finally(() => abortSignal.removeEventListener('abort', abortHandler));

    if (abortSignal.aborted) {
      throw new ExtractorError('Download cancelled.', 'CANCELLED');
    }
    if (exitCode !== 0) {
      logger.error('[YtDlpExtractor] yt-dlp failed', { videoId, exitCode, stderrTail });
      throw new ExtractorError(
        summarizeYtDlpError(stderrTail) ?? `yt-dlp exited with code ${exitCode}.`,
        'EXTRACTION_FAILED'
      );
    }

    const completed = findCompletedFile(outputDir);
    if (!completed) {
      throw new ExtractorError('yt-dlp finished but no media file was found in staging.', 'EXTRACTION_FAILED');
    }

    const containerExt = path.extname(completed).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(containerExt)) {
      throw new ExtractorError(
        `The audio stream was returned as "${containerExt}" which Nora cannot ingest. Try again later or pick another result.`,
        'UNSUPPORTED_SOURCE'
      );
    }

    return { filePath: completed, containerExt: containerExt.slice(1), durationSecs: undefined };
  }

  private async runJson(args: string[]): Promise<YtDlpPlaylistJson> {
    const child = spawn(resolveBinaryPath('yt-dlp'), [
      ...args,
      '--dump-single-json',
      '--no-warnings',
      '--windows-filenames'
    ], { windowsHide: true });

    let stdout = '';
    let stderrTail = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code));
    });

    if (exitCode !== 0) {
      throw new ExtractorError(
        summarizeYtDlpError(stderrTail) ?? `yt-dlp exited with code ${exitCode}.`,
        'EXTRACTION_FAILED'
      );
    }

    try {
      return JSON.parse(stdout.trim()) as YtDlpPlaylistJson;
    } catch (error) {
      logger.error('[YtDlpExtractor] Failed to parse yt-dlp JSON output.', { error });
      throw new ExtractorError('Failed to interpret the extractor response.', 'EXTRACTION_FAILED');
    }
  }

  private mapEntries(entries: YtDlpFlatEntry[]): { tracks: OnlineTrackResult[]; excludedCount: number } {
    const tracks: OnlineTrackResult[] = [];
    let excludedCount = 0;

    for (const entry of entries) {
      if (!entry.id || !entry.title) {
        excludedCount += 1;
        continue;
      }
      const isLive = entry.is_live === true || entry.live_status === 'is_live' || entry.live_status === 'is_upcoming';
      const tooLong =
        typeof entry.duration === 'number' &&
        entry.duration > ONLINE_DOWNLOADS_MAX_DURATION_SECS;

      if (isLive || tooLong) {
        excludedCount += 1;
        continue;
      }

      tracks.push({
        videoId: entry.id,
        title: entry.title,
        channel: entry.channel || entry.uploader || '',
        duration:
          typeof entry.duration === 'number' && Number.isFinite(entry.duration)
            ? Math.round(entry.duration)
            : 0,
        viewCount: typeof entry.view_count === 'number' ? entry.view_count : undefined,
        thumbnails: (entry.thumbnails ?? [])
          .filter((t): t is { url: string } => Boolean(t.url))
          .map((t) => t.url)
      });
    }

    return { tracks, excludedCount };
  }
}

function watchUrlFor(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Kills yt-dlp AND any processes it spawned (e.g. ffmpeg). Plain child.kill()
 * on Windows terminates only the direct process, orphaning its children which
 * then keep file handles open inside the staging directory.
 */
function killProcessTree(child: ReturnType<typeof spawn>): void {
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true
    });
    killer.on('error', () => child.kill());
    return;
  }
  child.kill('SIGTERM');
}

/**
 * Accepts a playlist id, a playlist URL or a watch URL that also carries list=.
 */
function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://www.youtube.com/playlist?list=${trimmed}`);
    const listParam = url.searchParams.get('list');
    if (listParam) return listParam;
  } catch {
    // fall through to raw-id interpretation
  }
  if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed)) return trimmed;
  return null;
}

function sanitizeFileName(name: string): string {
  const withoutControlChars = Array.from(name)
    .filter((char) => char.charCodeAt(0) > 31)
    .join('');
  return withoutControlChars
    .replace(/[<>:"/\\|?*]/g, '_')
    .trimEnd()
    .slice(0, 120);
}

function findCompletedFile(dir: string): string | null {
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.part') && !entry.endsWith('.ytdl') && !entry.endsWith('.tmp')) {
      return path.join(dir, entry);
    }
  }
  return null;
}

function summarizeYtDlpError(stderrTail: string): string | null {
  const lines = stderrTail
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:') || l.includes('ERROR'));
  return lines.length > 0 ? lines[lines.length - 1].replace(/^ERROR:\s*/, '') : null;
}
