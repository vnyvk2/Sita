import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { YtDlpExtractor } from '../YtDlpExtractor';
import { ExtractorError } from '../OnlineExtractor';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args)
}));

vi.mock('../binaryResolver', () => ({
  resolveBinaryPath: vi.fn((name: string) => `/fake/bin/${name}`)
}));

interface FakeChildOptions {
  stdoutData?: string;
  stderrData?: string;
  exitCode?: number;
  /** Emitted right before close; lets a test place a "downloaded" file. */
  beforeClose?: (outputDir?: string) => void;
}

function makeFakeChild({ stdoutData = '', stderrData = '', exitCode = 0, beforeClose }: FakeChildOptions) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: (encoding: string) => void };
    stderr: EventEmitter & { setEncoding: (encoding: string) => void };
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.kill = vi.fn(() => {
    child.killed = true;
  });
  queueMicrotask(() => {
    if (stdoutData) child.stdout.emit('data', stdoutData);
    if (stderrData) child.stderr.emit('data', stderrData);
    beforeClose?.();
    child.emit('close', exitCode);
  });
  return child;
}

describe('YtDlpExtractor', () => {
  let extractor: YtDlpExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new YtDlpExtractor();
  });

  describe('resolvePlaylist', () => {
    it('rejects unbounded radio mixes without spawning yt-dlp', async () => {
      await expect(extractor.resolvePlaylist('https://www.youtube.com/watch?v=abc&list=RDAMVMxyz')).rejects.toMatchObject(
        { code: 'UNSUPPORTED_SOURCE' } satisfies Partial<ExtractorError>
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('extracts the list id from a watch URL and maps entries', async () => {
      const playlistJson = {
        id: 'PL123',
        title: 'My Playlist',
        channel: 'Someone',
        entries: [
          {
            id: 'vid1',
            title: 'Song One',
            channel: 'Artist - Topic',
            duration: 200,
            thumbnails: [{ url: 'https://img/small', width: 120 }, { url: 'https://img/big', width: 640 }]
          },
          {
            id: 'vid2',
            title: 'A very long video',
            duration: 60 * 60,
            thumbnails: [{ url: 'https://img/x' }]
          },
          {
            id: 'vid3',
            title: 'Live stream',
            live_status: 'is_live',
            duration: 100,
            thumbnails: []
          },
          { title: 'Entry without an id', duration: 100 }
        ]
      };

      spawnMock.mockImplementation(() =>
        makeFakeChild({ stdoutData: JSON.stringify(playlistJson) })
      );

      const info = await extractor.resolvePlaylist('https://www.youtube.com/watch?v=abc&list=PL123');

      expect(info.playlistId).toBe('PL123');
      expect(info.title).toBe('My Playlist');
      expect(info.entries.map((entry) => entry.videoId)).toEqual(['vid1']);
      expect(info.excludedCount).toBe(3);
      expect(info.entries[0].thumbnails).toEqual([
        'https://img/small',
        'https://img/big'
      ]);
      expect(info.entries[0].channel).toBe('Artist - Topic');
    });
  });

  describe('search', () => {
    it('returns mapped tracks from a ytsearch flat playlist response', async () => {
      spawnMock.mockImplementation(() =>
        makeFakeChild({
          stdoutData: JSON.stringify({
            entries: [
              {
                id: 'v1',
                title: 'Track A',
                uploader: 'Channel A',
                duration: 180,
                view_count: 10,
                thumbnails: [{ url: 'https://thumb/a' }]
              }
            ]
          })
        })
      );

      const results = await extractor.search('track a');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        videoId: 'v1',
        title: 'Track A',
        channel: 'Channel A',
        duration: 180,
        viewCount: 10
      });
      // First positional argument must be the ytsearch query
      expect(spawnMock.mock.calls[0][1][0]).toBe('ytsearch25:track a');
    });

    it('returns an empty list for blank queries without spawning', async () => {
      const results = await extractor.search('   ');
      expect(results).toEqual([]);
      expect(spawnMock).not.toHaveBeenCalled();
    });
  });

  describe('describeFileName', () => {
    it('embeds the videoId and sanitizes filesystem-hostile characters', () => {
      expect(extractor.describeFileName('My: Cool "Song"?', 'abc123')).toBe(
        'My_ Cool _Song__ [abc123]'
      );
    });
  });

  describe('download', () => {
    let outputDir: string;

    beforeEach(() => {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-ytdl-extractor-'));
    });

    afterEach(() => {
      fs.rmSync(outputDir, { recursive: true, force: true });
    });

    it('builds the audio-only command with progress template and staging output template', async () => {
      spawnMock.mockImplementation((binary: string, args: string[]) => {
        expect(binary).toBe('/fake/bin/yt-dlp');
        // Contract flags for the most externally fragile part of the pipeline.
        for (const flag of [
          '--no-playlist',
          '--windows-filenames',
          '--trim-filenames',
          '--newline',
          '--progress-template'
        ]) {
          if (!args.includes(flag)) throw new Error(`Missing required flag: ${flag}`);
        }
        const formatIndex = args.indexOf('-f');
        expect(args[formatIndex + 1]).toBe('bestaudio[ext=m4a]/bestaudio[ext=opus]');
        const templateIndex = args.indexOf('-o');
        expect(args[templateIndex + 1]).toContain('%(title)s [%(id)s].%(ext)s');
        expect(args).toContain('https://www.youtube.com/watch?v=abc123');
        return makeFakeChild({
          beforeClose: () => fs.writeFileSync(path.join(outputDir, 'Song [abc123].m4a'), 'x')
        });
      });

      const output = await extractor.download({
        videoId: 'abc123',
        outputDir,
        abortSignal: new AbortController().signal
      });

      expect(output.filePath).toBe(path.join(outputDir, 'Song [abc123].m4a'));
      expect(output.containerExt).toBe('m4a');
    });

    it('reports parsed progress percentages, including lines split across chunks', async () => {
      const percents: number[] = [];
      let firstChunkSent = false;
      spawnMock.mockImplementation(() => {
        const child = makeFakeChild({});
        queueMicrotask(() => {
          child.stdout.emit('data', 'download:NORA_PROGRESS: 12.5%\r\n');
          firstChunkSent = true;
          void firstChunkSent;
          // Split mid-token across two data events.
          child.stdout.emit('data', 'download:NORA_PRO');
          child.stdout.emit('data', 'GRESS: 87.0%\r\n');
          child.emit('close', 0);
        });
        return child;
      });

      await extractor.download({
        videoId: 'abc123',
        outputDir,
        abortSignal: new AbortController().signal,
        onProgress: (p) => percents.push(p)
      }).catch(() => undefined);

      expect(percents).toEqual([12.5, 87]);
    });

    it('kills the process when the abort signal fires', async () => {
      let fakeChild: ReturnType<typeof makeFakeChild> | undefined;
      spawnMock.mockImplementation(() => {
        fakeChild = makeFakeChild({ exitCode: 1 });
        // Keep the child "running" until killed: never auto-close.
        fakeChild.kill.mockImplementation(() => fakeChild!.emit('close', null));
        return fakeChild;
      });

      const controller = new AbortController();
      const promise = extractor.download({
        videoId: 'abc123',
        outputDir,
        abortSignal: controller.signal
      });

      await vi.waitFor(() => expect(fakeChild).toBeDefined());
      controller.abort();

      await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(fakeChild!.kill).toHaveBeenCalled();
    });

    it('rejects unsupported containers instead of returning them', async () => {
      spawnMock.mockImplementation(() =>
        makeFakeChild({
          beforeClose: () => fs.writeFileSync(path.join(outputDir, 'Song [abc123].webm'), 'x')
        })
      );

      await expect(
        extractor.download({
          videoId: 'abc123',
          outputDir,
          abortSignal: new AbortController().signal
        })
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_SOURCE' });
    });

    it('surfaces yt-dlp errors with a summarized message', async () => {
      spawnMock.mockImplementation(() =>
        makeFakeChild({ stderrData: 'ERROR: Sign in to confirm your age', exitCode: 1 })
      );

      await expect(
        extractor.download({
          videoId: 'abc123',
          outputDir,
          abortSignal: new AbortController().signal
        })
      ).rejects.toMatchObject({ code: 'EXTRACTION_FAILED' });
    });
  });
});
