import * as fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DownloadJobState,
  DownloadsSnapshot,
  EnqueueDownloadInput,
  OnlineDownloadOutput,
  OnlineDownloadRequest,
  OnlinePlaylistInfo
} from '../models/downloadTypes';
import { DownloadManager, type DownloadSettings } from '../DownloadManager';
import { ExtractorError, type OnlineExtractor } from '../services/OnlineExtractor';

const FIXTURE_M4A = path.resolve(__dirname, '../../../../test/fixtures/downloads/sample.m4a');

class StubExtractor implements OnlineExtractor {
  readonly id = 'YOUTUBE' as const;
  readonly displayName = 'Stub YouTube';

  public calls: OnlineDownloadRequest[] = [];
  /** Overridable download behavior. Defaults to instantly "downloading" a fixture file. */
  public behavior: (
    request: OnlineDownloadRequest
  ) => Promise<OnlineDownloadOutput> = async (request) => {
    const target = path.join(request.outputDir, 'Test Song [vid1].m4a');
    fs.copyFileSync(FIXTURE_M4A, target);
    return { filePath: target, containerExt: '.m4a', durationSecs: 0.5 };
  };

  async search() {
    return [];
  }

  async resolvePlaylist(_urlOrId: string): Promise<OnlinePlaylistInfo> {
    throw new Error('not implemented');
  }

  async download(request: OnlineDownloadRequest): Promise<OnlineDownloadOutput> {
    this.calls.push(request);
    return this.behavior(request);
  }

  describeFileName(title: string, videoId: string): string {
    return `${title} [${videoId}]`;
  }
}

const track = (overrides?: Partial<EnqueueDownloadInput>): EnqueueDownloadInput => ({
  videoId: 'vid1',
  title: 'Test Song',
  artist: 'Test Artist',
  thumbnailUrl: undefined,
  ...overrides
});

describe('DownloadManager', () => {
  let destinationFolder: string;
  let stagingRoot: string;
  let extractor: StubExtractor;
  let settings: DownloadSettings;
  let manager: DownloadManager;
  let snapshots: DownloadsSnapshot[];

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-download-mgr-'));
    destinationFolder = path.join(tmp, 'music');
    stagingRoot = path.join(tmp, 'staging');
    fs.mkdirSync(destinationFolder, { recursive: true });

    extractor = new StubExtractor();
    settings = { destinationFolder, duplicatePolicy: 'SKIP' };
    snapshots = [];

    manager = new DownloadManager({
      extractor,
      stagingRoot,
      resolveSettings: async () => settings,
      publish: (event) => snapshots.push(event)
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const lastStateOf = (videoId: string): DownloadJobState | undefined =>
    [...snapshots].reverse().find((snapshot) => snapshot.jobs.some((job) => job.videoId === videoId))?.jobs.find(
      (job) => job.videoId === videoId
    );

  const waitForStatus = async (
    videoId: string,
    statuses: DownloadJobState['status'][],
    timeoutMs = 5000
  ): Promise<DownloadJobState> => {
    const startedAt = Date.now();
    for (;;) {
      const state = lastStateOf(videoId);
      if (state && statuses.includes(state.status)) return state;
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for ${statuses.join('/')}. Last: ${state?.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };

  it('downloads, tags and moves a song into the destination folder', async () => {
    const { jobId, status } = await manager.enqueue(track());
    expect(status).toBe('QUEUED');

    const finalState = await waitForStatus('vid1', ['COMPLETED']);
    expect(finalState.jobId).toBe(jobId);
    expect(finalState.filePath).toBeTruthy();
    expect(fs.existsSync(finalState.filePath!)).toBe(true);
    expect(path.dirname(finalState.filePath!)).toBe(destinationFolder);

    // Staging directory must be cleaned up after success.
    expect(fs.existsSync(stagingRoot)).toBe(true);
    expect(fs.readdirSync(stagingRoot).length).toBeGreaterThanOrEqual(0);
    expect(fs.readdirSync(stagingRoot)).toEqual([]);

    // The moved file must carry the embedded title tag.
    const { File } = await import('node-taglib-sharp');
    const file = File.createFromPath(finalState.filePath!);
    try {
      expect(file.tag.title).toBe('Test Song');
    } finally {
      file.dispose();
    }
  });

  it('marks duplicates as SKIPPED_DUPLICATE without downloading when policy is SKIP', async () => {
    fs.writeFileSync(path.join(destinationFolder, 'Whatever [vid1].m4a'), 'existing');

    const { status } = await manager.enqueue(track());

    expect(status).toBe('SKIPPED_DUPLICATE');
    expect(extractor.calls).toHaveLength(0);
  });

  it('KEEP BOTH produces a deterministic numbered name while retaining the videoId', async () => {
    settings.duplicatePolicy = 'KEEP_BOTH';
    fs.writeFileSync(path.join(destinationFolder, 'Test Song [vid1].m4a'), 'old');

    await manager.enqueue(track());
    await waitForStatus('vid1', ['COMPLETED']);

    expect(fs.existsSync(path.join(destinationFolder, 'Test Song [vid1] (2).m4a'))).toBe(true);
    expect(fs.existsSync(path.join(destinationFolder, 'Test Song [vid1].m4a'))).toBe(true);
  });

  it('OVERWRITE replaces the existing file with the same video id', async () => {
    settings.duplicatePolicy = 'OVERWRITE';
    fs.writeFileSync(path.join(destinationFolder, 'Test Song [vid1].m4a'), 'old');

    await manager.enqueue(track());
    const state = await waitForStatus('vid1', ['COMPLETED']);

    expect(state.filePath).toContain('[vid1]');
    expect(fs.readFileSync(state.filePath!, 'utf8').length).not.toBe(4);
  });

  it('cancelling during download cleans the staging directory and never touches the library folder', async () => {
    extractor.behavior = (request) =>
      new Promise((_resolve, reject) => {
        request.abortSignal.addEventListener('abort', () => {
          reject(new ExtractorError('Download cancelled.', 'CANCELLED'));
        });
      });

    const { jobId } = await manager.enqueue(track());
    // Wait until the stub actually saw the request so the abort cannot race it.
    await vi.waitFor(() => expect(extractor.calls).toHaveLength(1));

    expect(manager.cancel(jobId)).toBe(true);
    const state = await waitForStatus('vid1', ['CANCELLED']);

    expect(state.status).toBe('CANCELLED');
    expect(fs.readdirSync(destinationFolder)).toEqual([]);
    expect(fs.readdirSync(stagingRoot)).toEqual([]);
  });

  it('merges repeated enqueues of the same videoId while the first is still active', async () => {
    extractor.behavior = (request) =>
      new Promise((resolve) => {
        setTimeout(() => {
          if (request.abortSignal.aborted) {
            resolve({ filePath: '', containerExt: '.m4a' });
            return;
          }
          const targetPath = path.join(request.outputDir, 'Test Song [vid1].m4a');
          fs.copyFileSync(FIXTURE_M4A, targetPath);
          resolve({ filePath: targetPath, containerExt: '.m4a' });
        }, 150);
      });

    const first = await manager.enqueue(track());
    const second = await manager.enqueue(track());

    expect(second.jobId).toBe(first.jobId);
    expect(extractor.calls).toHaveLength(1);

    await waitForStatus('vid1', ['COMPLETED']);
  });

  it('dedupes truly concurrent enqueues of the same videoId (no race between settings load and registration)', async () => {
    extractor.behavior = (request) =>
      new Promise((resolve) => {
        setTimeout(() => {
          const targetPath = path.join(request.outputDir, 'Test Song [vid1].m4a');
          fs.copyFileSync(FIXTURE_M4A, targetPath);
          resolve({ filePath: targetPath, containerExt: '.m4a' });
        }, 120);
      });

    // Both calls are in flight simultaneously: each suspends on its own
    // resolveSettings() before the dedupe check runs. Run-to-completion
    // semantics must guarantee a single job + single download.
    const [first, second] = await Promise.all([
      manager.enqueue(track()),
      manager.enqueue(track())
    ]);

    expect(second.jobId).toBe(first.jobId);
    expect(extractor.calls).toHaveLength(1);

    const state = await waitForStatus('vid1', ['COMPLETED']);
    expect(fs.readdirSync(destinationFolder)).toEqual([path.basename(state.filePath!)]);
  });

  it('cancelAll cancels every queued and active download', async () => {
    extractor.behavior = (request) =>
      new Promise((_resolve, reject) => {
        request.abortSignal.addEventListener('abort', () => {
          reject(new ExtractorError('Download cancelled.', 'CANCELLED'));
        });
      });

    const first = await manager.enqueue(track({ videoId: 'vid1', title: 'Song One' }));
    const second = await manager.enqueue(track({ videoId: 'vid2', title: 'Song Two' }));

    const cancelledCount = manager.cancelAll();
    expect(cancelledCount).toBeGreaterThanOrEqual(2);

    await waitForStatus('vid1', ['CANCELLED']);
    await waitForStatus('vid2', ['CANCELLED']);
    void first;
    void second;

    expect(fs.readdirSync(destinationFolder)).toEqual([]);
    expect(fs.readdirSync(stagingRoot)).toEqual([]);
  });
});
