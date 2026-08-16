import { describe, it, expect } from 'vitest';

import { flattenVisibleFolders } from '../../../../../src/renderer/src/utils/flattenVisibleFolders';

const createMockFolder = (
  path: string,
  subFolders: MusicFolder[] = [],
  songIds: number[] = [1]
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

describe('flattenVisibleFolders', () => {
  it('returns empty array when tree is empty', () => {
    const result = flattenVisibleFolders([], new Set());
    expect(result).toEqual([]);
  });

  it('handles single root collapsed', () => {
    const tree = [createMockFolder('C:\\Music', [createMockFolder('C:\\Music\\Adele')])];
    const expanded = new Set<string>();

    const result = flattenVisibleFolders(tree, expanded);
    expect(result).toHaveLength(1);
    expect(result[0].folder.path).toBe('C:\\Music');
    expect(result[0].depth).toBe(0);
    expect(result[0].hasChildren).toBe(true);
    expect(result[0].isExpanded).toBe(false);
  });

  it('handles single root expanded with child', () => {
    const tree = [createMockFolder('C:\\Music', [createMockFolder('C:\\Music\\Adele')])];
    const expanded = new Set(['C:\\Music']);

    const result = flattenVisibleFolders(tree, expanded);
    expect(result).toHaveLength(2);
    expect(result[0].folder.path).toBe('C:\\Music');
    expect(result[0].depth).toBe(0);
    expect(result[0].isExpanded).toBe(true);

    expect(result[1].folder.path).toBe('C:\\Music\\Adele');
    expect(result[1].depth).toBe(1);
    expect(result[1].hasChildren).toBe(false);
    expect(result[1].isExpanded).toBe(false);
  });

  it('handles deep hierarchy with ancestor expansion invariant', () => {
    const tree = [
      createMockFolder('C:\\Music', [
        createMockFolder('C:\\Music\\Adele', [
          createMockFolder('C:\\Music\\Adele\\21'),
          createMockFolder('C:\\Music\\Adele\\25')
        ]),
        createMockFolder('C:\\Music\\Taylor', [createMockFolder('C:\\Music\\Taylor\\1989')])
      ])
    ];

    // State 1: Music expanded, Adele expanded, Taylor collapsed
    const expanded = new Set(['C:\\Music', 'C:\\Music\\Adele']);
    const result1 = flattenVisibleFolders(tree, expanded);

    expect(result1.map((item) => ({ path: item.folder.path, depth: item.depth }))).toEqual([
      { path: 'C:\\Music', depth: 0 },
      { path: 'C:\\Music\\Adele', depth: 1 },
      { path: 'C:\\Music\\Adele\\21', depth: 2 },
      { path: 'C:\\Music\\Adele\\25', depth: 2 },
      { path: 'C:\\Music\\Taylor', depth: 1 }
    ]);
    expect(result1.find((item) => item.folder.path === 'C:\\Music\\Taylor\\1989')).toBeUndefined();

    // State 2: Collapse root Music -> descendants must not be emitted
    expanded.delete('C:\\Music');
    const result2 = flattenVisibleFolders(tree, expanded);
    expect(result2).toHaveLength(1);
    expect(result2[0].folder.path).toBe('C:\\Music');
    expect(result2[0].depth).toBe(0);
    expect(result2[0].isExpanded).toBe(false);

    // State 3: Re-expand root Music -> Adele was still in expanded set, so Adele and its children 21, 25 reappear!
    expanded.add('C:\\Music');
    const result3 = flattenVisibleFolders(tree, expanded);
    expect(result3.map((item) => item.folder.path)).toEqual([
      'C:\\Music',
      'C:\\Music\\Adele',
      'C:\\Music\\Adele\\21',
      'C:\\Music\\Adele\\25',
      'C:\\Music\\Taylor'
    ]);
  });

  it('handles multiple roots with independent expansion states', () => {
    const tree = [
      createMockFolder('D:\\Music1', [createMockFolder('D:\\Music1\\Child1')]),
      createMockFolder('E:\\Music2', [createMockFolder('E:\\Music2\\Child2')])
    ];

    const expanded = new Set(['E:\\Music2']);
    const result = flattenVisibleFolders(tree, expanded);

    expect(
      result.map((item) => ({
        path: item.folder.path,
        depth: item.depth,
        isExpanded: item.isExpanded
      }))
    ).toEqual([
      { path: 'D:\\Music1', depth: 0, isExpanded: false },
      { path: 'E:\\Music2', depth: 0, isExpanded: true },
      { path: 'E:\\Music2\\Child2', depth: 1, isExpanded: false }
    ]);
  });
});
