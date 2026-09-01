import fs from 'fs/promises';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fastDiskWalk } from '../fastDiskWalk';

vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn()
  }
}));

describe('fastDiskWalk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should discover supported audio files and ignore non-audio files', async () => {
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

    const onFileDiscovered = vi.fn();
    const result = await fastDiskWalk([root], { onFileDiscovered });

    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0].path).toBe('C:\\Music\\track1.mp3');
    expect(result.snapshots[0].rootId).toBe(1);
    expect(result.snapshots[0].dirPath).toBe('C:\\Music');
    expect(result.snapshots[0].fileModifiedAt).toBe(mockMtime);
    expect(result.snapshots[1].path).toBe('C:\\Music\\track2.flac');

    expect(result.failedSubtrees).toHaveLength(0);
    expect(result.failedPaths).toHaveLength(0);
    expect(onFileDiscovered).toHaveBeenCalledTimes(2);
  });

  it('should skip hidden files and hidden directories (.git, .DS_Store)', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: '.git', isFile: () => false, isDirectory: () => true },
      { name: '.DS_Store', isFile: () => true, isDirectory: () => false },
      { name: 'song.mp3', isFile: () => true, isDirectory: () => false }
    ] as any);

    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date(10000),
      size: 1000
    } as any);

    const result = await fastDiskWalk([root]);

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].path).toBe('C:\\Music\\song.mp3');
  });

  it('should traverse nested directory hierarchies and populate parent directory paths', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
      if (dirPath === 'C:\\Music') {
        return [
          { name: 'Rock', isFile: () => false, isDirectory: () => true },
          { name: 'root.mp3', isFile: () => true, isDirectory: () => false }
        ] as any;
      }
      if (dirPath === 'C:\\Music\\Rock') {
        return [{ name: 'rock1.mp3', isFile: () => true, isDirectory: () => false }] as any;
      }
      return [];
    });

    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date(),
      size: 2048
    } as any);

    const result = await fastDiskWalk([root]);

    expect(result.snapshots).toHaveLength(2);
    const rootSong = result.snapshots.find((s) => s.path === 'C:\\Music\\root.mp3');
    const rockSong = result.snapshots.find((s) => s.path === 'C:\\Music\\Rock\\rock1.mp3');

    expect(rootSong?.dirPath).toBe('C:\\Music');
    expect(rockSong?.dirPath).toBe('C:\\Music\\Rock');
  });

  it('should record failed directory in failedSubtrees on readdir error (Failed Subtree Safety)', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
      if (dirPath === 'C:\\Music') {
        return [
          { name: 'Restricted', isFile: () => false, isDirectory: () => true },
          { name: 'accessible.mp3', isFile: () => true, isDirectory: () => false }
        ] as any;
      }
      if (dirPath === 'C:\\Music\\Restricted') {
        throw new Error('EACCES: permission denied');
      }
      return [];
    });

    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date(),
      size: 1024
    } as any);

    const result = await fastDiskWalk([root]);

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].path).toBe('C:\\Music\\accessible.mp3');
    expect(result.failedSubtrees).toContain('C:\\Music\\Restricted');
  });

  it('should record failed file in failedPaths on stat error (Failed Path Safety)', async () => {
    const root = { id: 1, path: 'C:\\Music' };

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'good.mp3', isFile: () => true, isDirectory: () => false },
      { name: 'locked.mp3', isFile: () => true, isDirectory: () => false }
    ] as any);

    vi.mocked(fs.stat).mockImplementation(async (filePath: any) => {
      if (String(filePath).includes('locked.mp3')) {
        throw new Error('EBUSY: resource locked');
      }
      return { mtime: new Date(), size: 1024 } as any;
    });

    const result = await fastDiskWalk([root]);

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].path).toBe('C:\\Music\\good.mp3');
    expect(result.failedPaths).toContain('C:\\Music\\locked.mp3');
  });

  it('should abort cleanly when AbortSignal triggers', async () => {
    const root = { id: 1, path: 'C:\\Music' };
    const controller = new AbortController();

    vi.mocked(fs.readdir).mockImplementation(async () => {
      controller.abort();
      return [
        { name: 'track1.mp3', isFile: () => true, isDirectory: () => false },
        { name: 'Sub', isFile: () => false, isDirectory: () => true }
      ] as any;
    });

    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date(),
      size: 1024
    } as any);

    const result = await fastDiskWalk([root], { abortSignal: controller.signal });

    // Traversal stopped after abort
    expect(result.failedSubtrees).toHaveLength(0);
  });

  it('C-2 REGRESSION: should achieve bounded parallel traversal (concurrency > 1) for a single root with multiple subdirectories', async () => {
    const root = { id: 1, path: 'C:\\Music' };
    const subDirCount = 20;

    let activeReaddirWorkers = 0;
    let maxObservedConcurrency = 0;

    vi.mocked(fs.readdir).mockImplementation(async (dirPath: any) => {
      activeReaddirWorkers++;
      if (activeReaddirWorkers > maxObservedConcurrency) {
        maxObservedConcurrency = activeReaddirWorkers;
      }

      // Small async delay to simulate disk I/O overlap
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeReaddirWorkers--;

      if (dirPath === 'C:\\Music') {
        // Root contains 20 subdirectories
        return Array.from({ length: subDirCount }, (_, i) => ({
          name: `Folder_${i}`,
          isFile: () => false,
          isDirectory: () => true
        })) as any;
      }

      // Each subfolder contains 1 song
      const folderName = path.basename(String(dirPath));
      return [
        {
          name: `${folderName}_track.mp3`,
          isFile: () => true,
          isDirectory: () => false
        }
      ] as any;
    });

    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date(),
      size: 1024
    } as any);

    const result = await fastDiskWalk([root], { maxConcurrency: 4 });

    // Invariant: All 20 tracks discovered
    expect(result.snapshots).toHaveLength(20);
    expect(result.failedSubtrees).toHaveLength(0);

    // Invariant: Pool size allowed parallel execution across subdirectories
    expect(maxObservedConcurrency).toBeGreaterThan(1);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(4);
  });
});
