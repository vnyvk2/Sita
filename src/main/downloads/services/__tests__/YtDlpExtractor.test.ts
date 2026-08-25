import { EventEmitter } from 'events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { YtDlpExtractor } from '../YtDlpExtractor';
import { ExtractorError } from '../OnlineExtractor';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args)
}));

vi.mock('../binaryResolver', () => ({
  resolveBinaryPath: vi.fn(() => '/fake/bin/yt-dlp')
}));

interface FakeChildOptions {
  stdoutData?: string;
  stderrData?: string;
  exitCode?: number;
}

function makeFakeChild({ stdoutData = '', stderrData = '', exitCode = 0 }: FakeChildOptions) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: (encoding: string) => void };
    stderr: EventEmitter & { setEncoding: (encoding: string) => void };
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.kill = vi.fn();
  queueMicrotask(() => {
    if (stdoutData) child.stdout.emit('data', stdoutData);
    if (stderrData) child.stderr.emit('data', stderrData);
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
});
