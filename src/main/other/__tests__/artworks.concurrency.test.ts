import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetArtworkLocationCacheForTesting,
  checkForDefaultArtworkSaveLocation
} from '../artworks';

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn()
  }
}));

vi.mock('@main/db/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([])
      })
    })
  }
}));

vi.mock('@main/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Artwork directory concurrency and error safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetArtworkLocationCacheForTesting();
  });

  it('P0: should handle 20 concurrent invocations safely with recursive: true without EEXIST', async () => {
    // Simulate async I/O delay in mkdir so concurrent calls overlap
    vi.mocked(fs.mkdir).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return undefined;
    });

    const concurrentCalls = Array.from({ length: 20 }, () =>
      checkForDefaultArtworkSaveLocation()
    );

    await expect(Promise.all(concurrentCalls)).resolves.toBeDefined();

    // Verify fs.mkdir was called with recursive: true
    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('song_covers'),
      { recursive: true }
    );
  });

  it('P0: should propagate genuine filesystem errors (e.g. EACCES) instead of swallowing them', async () => {
    vi.mocked(fs.mkdir).mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { code: 'EACCES', syscall: 'mkdir' })
    );

    await expect(checkForDefaultArtworkSaveLocation()).rejects.toThrow('Permission denied');
  });
});
