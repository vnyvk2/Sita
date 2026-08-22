import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetArtworkLocationCacheForTesting,
  checkForDefaultArtworkSaveLocation,
  processArtworkFiles
} from '../artworks';

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    webp: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory'))
  }))
}));

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

  it('should handle permanent filesystem errors (e.g. EACCES) by logging and falling back gracefully', async () => {
    vi.mocked(fs.mkdir).mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { code: 'EACCES', syscall: 'mkdir' })
    );

    // Invariant: Permanent mkdir failure must not throw unhandled exception out of location check
    await expect(checkForDefaultArtworkSaveLocation()).resolves.toBeUndefined();
  });

  it('proves end-to-end artwork fallback: permanent filesystem failure results in default artwork payload without throwing', async () => {
    // 1. Permanent mkdir failure on directory creation
    vi.mocked(fs.mkdir).mockRejectedValue(
      Object.assign(new Error('Permission denied'), { code: 'EACCES', syscall: 'mkdir' })
    );

    // 2. Process artwork for a song with embedded image
    const result = await processArtworkFiles('songs', Buffer.from('embedded-album-art'));

    // Invariant: Must return payload with default fallback without throwing
    expect(result).toBeDefined();
    expect(result.payloads).toBeDefined();
    expect(result.payloads!.length).toBe(2);
    // Real artwork paths should fall back to default artwork paths (song_cover_default.webp)
    expect(result.payloads![0].path).toContain('song_cover_default.webp');
    expect(result.payloads![1].path).toContain('song_cover_default.webp');
  });
});
