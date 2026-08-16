import { describe, it, expect, vi } from 'vitest';

import { resolveOrCreateMusicFolders } from '../folderHierarchy';

describe('folderHierarchy - resolveOrCreateMusicFolders', () => {
  it('should map subdirectories to existing folder IDs and create new folders with correct parent IDs', async () => {
    const existingFolders = [
      { id: 1, path: 'C:\\Music', parentId: null },
      { id: 2, path: 'C:\\Music\\Rock', parentId: 1 }
    ];

    const insertedRows: Array<{ path: string; parentId: number; id: number }> = [];
    let nextId = 3;

    const mockTrx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue(existingFolders)
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          returning: vi.fn().mockImplementation(() => {
            const row = { ...val, id: nextId++ };
            insertedRows.push(row);
            return Promise.resolve([row]);
          })
        }))
      })
    } as unknown as DB;

    const discoveredDirs = [
      'C:\\Music',
      'C:\\Music\\Rock',
      'C:\\Music\\Rock\\Metallica',
      'C:\\Music\\Jazz'
    ];

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      discoveredDirs,
      'win32',
      mockTrx
    );

    // Existing folders
    expect(folderMap.get('c:\\music')).toBe(1);
    expect(folderMap.get('c:\\music\\rock')).toBe(2);

    // Newly created folders
    expect(folderMap.get('c:\\music\\jazz')).toBe(3);
    expect(folderMap.get('c:\\music\\rock\\metallica')).toBe(4);

    // Parent ID relations
    const metallicaRow = insertedRows.find((r) => r.path === 'C:\\Music\\Rock\\Metallica');
    expect(metallicaRow?.parentId).toBe(2); // parent is Rock (id: 2)

    const jazzRow = insertedRows.find((r) => r.path === 'C:\\Music\\Jazz');
    expect(jazzRow?.parentId).toBe(1); // parent is root (id: 1)
  });
});
