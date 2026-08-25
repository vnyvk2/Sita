import { beforeEach, describe, expect, it, vi } from 'vitest';

const { savePendingSongLyrics, savePendingMetadataUpdates } = vi.hoisted(() => ({
  savePendingSongLyrics: vi.fn<(path?: string, force?: boolean) => Promise<void>>(),
  savePendingMetadataUpdates: vi.fn<(path?: string, force?: boolean) => Promise<void>>()
}));

vi.mock('../../saveLyricsToSong', () => ({
  savePendingSongLyrics
}));

vi.mock('../../updateSong/updateSongId3Tags', () => ({
  savePendingMetadataUpdates
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn()
  }
}));

import { flushPendingWritesBeforeExit } from '../flushPendingWritesBeforeExit';

describe('Utils — flushPendingWritesBeforeExit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePendingSongLyrics.mockResolvedValue(undefined);
    savePendingMetadataUpdates.mockResolvedValue(undefined);
  });

  it('awaits both pending lyric and metadata writes with forced save', async () => {
    await flushPendingWritesBeforeExit('/music/song.mp3');

    expect(savePendingSongLyrics).toHaveBeenCalledWith('/music/song.mp3', true);
    expect(savePendingMetadataUpdates).toHaveBeenCalledWith('/music/song.mp3', true);
  });

  it('runs the lyrics flush before the metadata flush', async () => {
    const callOrder: string[] = [];
    savePendingSongLyrics.mockImplementation(() => {
      callOrder.push('lyrics');
      return Promise.resolve(undefined);
    });
    savePendingMetadataUpdates.mockImplementation(() => {
      callOrder.push('metadata');
      return Promise.resolve(undefined);
    });

    await flushPendingWritesBeforeExit('/music/song.mp3');

    expect(callOrder).toEqual(['lyrics', 'metadata']);
  });

  it('still flushes metadata when the lyrics flush rejects', async () => {
    savePendingSongLyrics.mockRejectedValue(new Error('disk full'));

    await expect(flushPendingWritesBeforeExit('/music/song.mp3')).resolves.toBeUndefined();

    expect(savePendingMetadataUpdates).toHaveBeenCalledWith('/music/song.mp3', true);
  });

  it('never propagates metadata flush failures so exit is never blocked', async () => {
    savePendingMetadataUpdates.mockRejectedValue(new Error('EBUSY'));

    await expect(flushPendingWritesBeforeExit('/music/song.mp3')).resolves.toBeUndefined();
  });
});
