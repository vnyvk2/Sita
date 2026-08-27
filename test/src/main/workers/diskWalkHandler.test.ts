import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeDiskWalk } from '@main/workers/process/handlers/diskWalkHandler';

vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn()
  }
}));

describe('diskWalkHandler (Worker Directory Walker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should discover supported audio files and skip non-supported extensions', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'track1.mp3', isFile: () => true, isDirectory: () => false },
      { name: 'track2.flac', isFile: () => true, isDirectory: () => false },
      { name: 'cover.jpg', isFile: () => true, isDirectory: () => false },
      { name: 'info.txt', isFile: () => true, isDirectory: () => false }
    ] as any);

    const mockMtime = new Date(100000);
    vi.mocked(fs.stat).mockResolvedValue({
      mtime: mockMtime,
      size: 5000000
    } as any);

    const onProgress = vi.fn();
    const result = await executeDiskWalk([root], {
      supportedExtensions: ['.mp3', '.flac'],
      onProgress
    });

    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0].path).toBe('C:\\Music\\track1.mp3');
    expect(result.snapshots[0].rootId).toBe(1);
    expect(result.snapshots[0].fileModifiedAt).toBe(mockMtime);
    expect(result.snapshots[1].path).toBe('C:\\Music\\track2.flac');

    expect(result.failedSubtrees).toHaveLength(0);
    expect(result.failedPaths).toHaveLength(0);
    expect(onProgress).toHaveBeenCalled();
  });

  it('should skip hidden files and hidden directories', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: '.git', isFile: () => false, isDirectory: () => true },
      { name: '.DS_Store', isFile: () => true, isDirectory: () => false },
      { name: 'track.mp3', isFile: () => true, isDirectory: () => false }
    ] as any);

    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date(10000),
      size: 1000
    } as any);

    const result = await executeDiskWalk([root], {
      supportedExtensions: ['.mp3']
    });

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].path).toBe('C:\\Music\\track.mp3');
  });

  it('should record failed directory in failedSubtrees on readdir error', async () => {
    const root = { id: 1, path: 'C:\\Music\\Inaccessible' };

    vi.mocked(fs.readdir).mockRejectedValue(new Error('EACCES: permission denied'));

    const result = await executeDiskWalk([root], {
      supportedExtensions: ['.mp3']
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.failedSubtrees).toEqual(['C:\\Music\\Inaccessible']);
  });

  it('should record failed file in failedPaths on stat error', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'locked.mp3', isFile: () => true, isDirectory: () => false }
    ] as any);

    vi.mocked(fs.stat).mockRejectedValue(new Error('EBUSY: resource locked'));

    const result = await executeDiskWalk([root], {
      supportedExtensions: ['.mp3']
    });

    expect(result.snapshots).toHaveLength(0);
    expect(result.failedPaths).toEqual(['C:\\Music\\locked.mp3']);
  });

  it('should abort cleanly when abortSignal is triggered', async () => {
    const root = { id: 1, path: 'C:\\Music' };
    const abortController = new AbortController();

    vi.mocked(fs.readdir).mockImplementation(async () => {
      abortController.abort();
      return [{ name: 'song.mp3', isFile: () => true, isDirectory: () => false }] as any;
    });

    const result = await executeDiskWalk([root], {
      supportedExtensions: ['.mp3'],
      abortSignal: abortController.signal
    });

    expect(result.snapshots).toHaveLength(0);
  });
});
