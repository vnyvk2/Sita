import { describe, it, expect } from 'vitest';

import {
  diffFilesystemSnapshot,
  type DiskSongSnapshot,
  type DbSongSnapshot,
  type ScanRoot
} from '../diffEngine';

describe('diffEngine', () => {
  const rootC: ScanRoot = { id: 1, path: 'C:\\Music' };
  const rootE: ScanRoot = { id: 2, path: 'E:\\Music' };

  it('should detect added songs when files exist on disk but not in DB', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'C:\\Music\\Rock\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1
      },
      {
        path: 'C:\\Music\\Rock\\SongB.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\Rock\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      }
    ];

    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [], [], 1000, 'win32');

    expect(result.added).toHaveLength(1);
    expect(result.added[0].path).toBe('C:\\Music\\Rock\\SongB.mp3');
    expect(result.modified).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it('should detect removed songs when DB songs are missing from accessible disk roots', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      },
      {
        id: 102,
        path: 'C:\\Music\\SongB.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      }
    ];

    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [], [], 1000, 'win32');

    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].id).toBe(102);
    expect(result.unchangedCount).toBe(1);
  });

  it('should detect modified songs when disk mtime exceeds DB mtime beyond tolerance', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(15000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      }
    ];

    // Difference is 5000ms > 1000ms tolerance
    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [], [], 1000, 'win32');

    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].path).toBe('C:\\Music\\SongA.mp3');
    expect(result.removed).toHaveLength(0);
    expect(result.unchangedCount).toBe(0);
  });

  it('should treat timestamp differences within tolerance as unchanged', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(10500),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      }
    ];

    // Difference is 500ms <= 1000ms tolerance
    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [], [], 1000, 'win32');

    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it('should treat older disk timestamp as unchanged', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(8000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      }
    ];

    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [], [], 1000, 'win32');

    expect(result.modified).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it('should NEVER remove songs under disconnected/skipped roots (Safety Invariant)', () => {
    const disk: DiskSongSnapshot[] = [];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 201,
        path: 'E:\\Music\\Album\\Song1.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 2
      },
      {
        id: 202,
        path: 'E:\\Music\\Album\\Song2.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 2
      }
    ];

    // Root E:\Music is disconnected/skipped
    const result = diffFilesystemSnapshot(disk, dbSongs, [], [rootE], [], 1000, 'win32');

    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.removed).toHaveLength(0); // MUST be 0!
    expect(result.skippedRoots).toHaveLength(1);
  });

  it('should handle mixed roots correctly (reconcile accessible root while preserving disconnected root)', () => {
    const disk: DiskSongSnapshot[] = [
      // Only files from C:\Music are discovered on disk
      {
        path: 'C:\\Music\\NewSong.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      // Old song under C:\Music that was deleted from disk
      {
        id: 101,
        path: 'C:\\Music\\OldSong.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      },
      // Song under disconnected drive E:\Music
      {
        id: 201,
        path: 'E:\\Music\\DriveSong.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 2
      }
    ];

    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [rootE], [], 1000, 'win32');

    expect(result.added).toHaveLength(1);
    expect(result.added[0].path).toBe('C:\\Music\\NewSong.mp3');
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].id).toBe(101); // Only C:\Music\OldSong.mp3 removed
    expect(result.removed.some((r) => r.id === 201)).toBe(false); // E:\Music\DriveSong.mp3 strictly preserved!
  });

  it('should match paths case-insensitively on Windows', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'c:/music/rock/song.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\ROCK\\Song.MP3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      }
    ];

    const result = diffFilesystemSnapshot(disk, dbSongs, [rootC], [], [], 1000, 'win32');

    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it('should NEVER remove songs under failed/unscanned subtrees (Subtree Failure Safety)', () => {
    const disk: DiskSongSnapshot[] = [
      {
        path: 'C:\\Music\\Jazz\\Song1.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1
      }
    ];
    const dbSongs: DbSongSnapshot[] = [
      {
        id: 101,
        path: 'C:\\Music\\Jazz\\Song1.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 1
      },
      // Song in C:\Music\Rock which failed readdir traversal
      {
        id: 102,
        path: 'C:\\Music\\Rock\\Song2.mp3',
        fileModifiedAt: new Date(10000),
        folderId: 2
      }
    ];

    const result = diffFilesystemSnapshot(
      disk,
      dbSongs,
      [rootC],
      [],
      ['C:\\Music\\Rock'], // Failed subtree
      1000,
      'win32'
    );

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0); // Song2 in Rock MUST NOT be removed!
    expect(result.unchangedCount).toBe(1);
    expect(result.failedSubtrees).toHaveLength(1);
  });
});
