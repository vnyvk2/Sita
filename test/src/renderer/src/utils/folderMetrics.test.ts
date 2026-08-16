import { describe, it, expect } from 'vitest';

import {
  computeFolderMetricsMap,
  getAllSongIds,
  parseFolderBreadcrumbs
} from '../../../../../src/renderer/src/utils/folderMetrics';

const createMockFolder = (
  path: string,
  subFolders: MusicFolder[] = [],
  songIds: number[] = []
): MusicFolder => ({
  path,
  stats: {
    lastModifiedDate: new Date(),
    lastChangedDate: new Date(),
    fileCreatedDate: new Date(),
    lastParsedDate: new Date()
  },
  songIds,
  isBlacklisted: false,
  subFolders
});

describe('folderMetrics', () => {
  describe('computeFolderMetricsMap', () => {
    it('handles empty tree', () => {
      const metricsMap = computeFolderMetricsMap([]);
      expect(metricsMap.size).toBe(0);
    });

    it('computes metrics for a single leaf folder', () => {
      const leaf = createMockFolder('C:\\Music\\Album', [], [1, 2, 3]);
      const metricsMap = computeFolderMetricsMap([leaf]);

      expect(metricsMap.get('C:\\Music\\Album')).toEqual({
        directSongCount: 3,
        totalSongCount: 3,
        directFolderCount: 0,
        totalFolderCount: 0
      });
    });

    it('computes exact direct vs total counts for multi-level hierarchy', () => {
      const tree: MusicFolder[] = [
        createMockFolder('C:\\Music', [
          createMockFolder('C:\\Music\\Adele', [
            createMockFolder('C:\\Music\\Adele\\21', [], [101, 102]),
            createMockFolder('C:\\Music\\Adele\\25', [], [103, 104, 105])
          ]),
          createMockFolder('C:\\Music\\Taylor', [
            createMockFolder('C:\\Music\\Taylor\\1989', [], [201])
          ])
        ])
      ];

      const metricsMap = computeFolderMetricsMap(tree);

      // Music: directFolderCount = 2 (Adele, Taylor), totalFolderCount = 5 (Adele, 21, 25, Taylor, 1989), totalSongs = 6
      expect(metricsMap.get('C:\\Music')).toEqual({
        directSongCount: 0,
        totalSongCount: 6,
        directFolderCount: 2,
        totalFolderCount: 5
      });

      // Adele: directFolderCount = 2 (21, 25), totalFolderCount = 2 (21, 25), totalSongs = 5
      expect(metricsMap.get('C:\\Music\\Adele')).toEqual({
        directSongCount: 0,
        totalSongCount: 5,
        directFolderCount: 2,
        totalFolderCount: 2
      });

      // 21: leaf
      expect(metricsMap.get('C:\\Music\\Adele\\21')).toEqual({
        directSongCount: 2,
        totalSongCount: 2,
        directFolderCount: 0,
        totalFolderCount: 0
      });

      // Taylor: directFolderCount = 1 (1989), totalFolderCount = 1, totalSongs = 1
      expect(metricsMap.get('C:\\Music\\Taylor')).toEqual({
        directSongCount: 0,
        totalSongCount: 1,
        directFolderCount: 1,
        totalFolderCount: 1
      });
    });

    it('computes mixed hierarchy with both direct songs and subfolders', () => {
      const artist = createMockFolder(
        'C:\\Music\\Artist',
        [
          createMockFolder('C:\\Music\\Artist\\AlbumA', [], [2, 3]),
          createMockFolder('C:\\Music\\Artist\\AlbumB', [], [4])
        ],
        [1] // 1 direct song in artist folder
      );

      const metricsMap = computeFolderMetricsMap([artist]);

      expect(metricsMap.get('C:\\Music\\Artist')).toEqual({
        directSongCount: 1,
        totalSongCount: 4,
        directFolderCount: 2,
        totalFolderCount: 2
      });
    });
  });

  describe('getAllSongIds', () => {
    it('returns empty array for folder with no songs and no subfolders', () => {
      const empty = createMockFolder('C:\\Music\\Empty');
      expect(getAllSongIds(empty)).toEqual([]);
    });

    it('collects songs in deterministic order: direct songs -> child1 -> child2', () => {
      const artist = createMockFolder(
        'C:\\Music\\Artist',
        [
          createMockFolder('C:\\Music\\Artist\\AlbumA', [], [10, 20]),
          createMockFolder('C:\\Music\\Artist\\AlbumB', [], [30])
        ],
        [1, 2] // direct songs
      );

      const ids = getAllSongIds(artist);
      expect(ids).toEqual([1, 2, 10, 20, 30]);
    });

    it('deduplicates duplicate IDs if any exist in the data', () => {
      const folder = createMockFolder(
        'C:\\Music\\Artist',
        [createMockFolder('C:\\Music\\Artist\\Album', [], [1, 2])],
        [1] // duplicate ID 1
      );

      expect(getAllSongIds(folder)).toEqual([1, 2]);
    });
  });

  describe('parseFolderBreadcrumbs', () => {
    it('parses Windows path with drive letter into clickable breadcrumbs', () => {
      const breadcrumbs = parseFolderBreadcrumbs('C:\\Music\\Adele\\21');

      expect(breadcrumbs).toEqual([
        { label: 'C:', path: 'C:\\', isCurrent: false },
        { label: 'Music', path: 'C:\\Music', isCurrent: false },
        { label: 'Adele', path: 'C:\\Music\\Adele', isCurrent: false },
        { label: '21', path: 'C:\\Music\\Adele\\21', isCurrent: true }
      ]);
    });

    it('parses Unix path into clickable breadcrumbs', () => {
      const breadcrumbs = parseFolderBreadcrumbs('/home/user/Music/Adele/21');

      expect(breadcrumbs).toEqual([
        { label: 'home', path: '/home', isCurrent: false },
        { label: 'user', path: '/home/user', isCurrent: false },
        { label: 'Music', path: '/home/user/Music', isCurrent: false },
        { label: 'Adele', path: '/home/user/Music/Adele', isCurrent: false },
        { label: '21', path: '/home/user/Music/Adele/21', isCurrent: true }
      ]);
    });

    it('handles empty path gracefully', () => {
      expect(parseFolderBreadcrumbs('')).toEqual([]);
    });
  });
});
