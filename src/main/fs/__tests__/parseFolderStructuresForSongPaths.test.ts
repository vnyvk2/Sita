import fsSync from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllFilePathsFromFolder } from '../parseFolderStructuresForSongPaths';

vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn()
  }
}));

vi.mock('../logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('getAllFilePathsFromFolder file/directory classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1: should correctly distinguish files from directories with dots in their names', () => {
    const mockEntries = [
      { name: 'Into Your Arms (feat. Ava Max)', isFile: () => false, isDirectory: () => true },
      { name: 'Album v1.0', isFile: () => false, isDirectory: () => true },
      { name: 'Artist Jr.', isFile: () => false, isDirectory: () => true },
      { name: 'song.mp3', isFile: () => true, isDirectory: () => false },
      { name: 'song.lrc', isFile: () => true, isDirectory: () => false },
      { name: 'cover.jpg', isFile: () => true, isDirectory: () => false }
    ];

    vi.mocked(fsSync.readdirSync).mockReturnValue(mockEntries as any);

    const folderPath = 'E:\\Music\\Witt Lowry';
    const result = getAllFilePathsFromFolder(folderPath);

    // Invariant: Subdirectories with dots in their names MUST NOT be returned
    expect(result).not.toContain(path.join(folderPath, 'Into Your Arms (feat. Ava Max)'));
    expect(result).not.toContain(path.join(folderPath, 'Album v1.0'));
    expect(result).not.toContain(path.join(folderPath, 'Artist Jr.'));

    // Invariant: Genuine files are returned
    expect(result).toContain(path.join(folderPath, 'song.mp3'));
    expect(result).toContain(path.join(folderPath, 'song.lrc'));
    expect(result).toContain(path.join(folderPath, 'cover.jpg'));
    expect(result).toHaveLength(3);
  });

  it('P1: should return empty array on filesystem read errors without throwing', () => {
    vi.mocked(fsSync.readdirSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = getAllFilePathsFromFolder('C:\\Restricted');
    expect(result).toEqual([]);
  });
});
