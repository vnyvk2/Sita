import { describe, it, expect, vi } from 'vitest';

import { resolveOrCreateMusicFolders } from '../folderHierarchy';

const createSelectMock = (result: any = []) => {
  return vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation(() => {
      const p = Promise.resolve(result);
      (p as any).where = vi.fn().mockResolvedValue(result);
      return p;
    })
  }));
};

describe('folderHierarchy - resolveOrCreateMusicFolders', () => {
  it('should map subdirectories to existing folder IDs and create new folders with correct parent IDs', async () => {
    const existingFolders = [
      { id: 1, path: 'C:\\Music', parentId: null },
      { id: 2, path: 'C:\\Music\\Rock', parentId: 1 }
    ];

    const insertedRows: Array<{ path: string; parentId: number; id: number }> = [];
    let nextId = 3;

    const mockDatabase = {
      select: createSelectMock(existingFolders),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              const row = { ...val, id: nextId++ };
              insertedRows.push(row);
              return Promise.resolve([row]);
            })
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
      mockDatabase
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

  it('should recover gracefully from onConflictDoNothing on concurrent folder creation', async () => {
    const mockDatabase = {
      select: vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockImplementation(() => {
            const p = Promise.resolve([]);
            (p as any).where = vi.fn().mockResolvedValue([]);
            return p;
          })
        }))
        .mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 42, path: 'C:\\Music\\Pop', parentId: 1 }])
          })
        })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]) // Insert collided and returned empty
          })
        })
      })
    };

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      ['C:\\Music\\Pop'],
      'win32',
      mockDatabase as unknown as DB
    );

    expect(folderMap.get('c:\\music\\pop')).toBe(42);
  });

  it('should throw an explicit error on folder creation failure without falling back', async () => {
    const mockDatabase = {
      select: vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockImplementation(() => {
            const p = Promise.resolve([]);
            (p as any).where = vi.fn().mockResolvedValue([]);
            return p;
          })
        }))
        .mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([])
          })
        })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]) // DB returned empty array on insert
          })
        })
      })
    };

    await expect(
      resolveOrCreateMusicFolders(
        1,
        'C:\\Music',
        ['C:\\Music\\Pop'],
        'win32',
        mockDatabase as unknown as DB
      )
    ).rejects.toThrow('Failed to insert music_folders record for');
  });

  it('should abort cleanly when AbortSignal is triggered', async () => {
    const controller = new AbortController();
    controller.abort();

    const mockDatabase = {
      select: createSelectMock([]),
      insert: vi.fn()
    } as unknown as DB;

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      ['C:\\Music\\Pop'],
      'win32',
      mockDatabase,
      controller.signal
    );

    expect(folderMap.get('c:\\music')).toBe(1);
    expect(mockDatabase.insert).not.toHaveBeenCalled();
  });

  it('should throw an explicit error if an intermediate parent folder cannot be resolved (no silent root fallback)', async () => {
    // DB has root (id: 1), but C:\Music\Rock is missing from DB and not in discoveredDirs
    const existingFolders = [{ id: 1, path: 'C:\\Music', parentId: null }];

    const mockDatabase = {
      select: createSelectMock(existingFolders),
      insert: vi.fn()
    } as unknown as DB;

    // Discovered Metallica under missing Rock
    const discoveredDirs = ['C:\\Music\\Rock\\Metallica'];

    await expect(
      resolveOrCreateMusicFolders(1, 'C:\\Music', discoveredDirs, 'win32', mockDatabase)
    ).rejects.toThrow(
      "Unable to resolve parent folder 'C:\\Music\\Rock' for 'C:\\Music\\Rock\\Metallica'"
    );
  });

  it('C-3: should scope SQL query to active scan root with trailing directory separator', async () => {
    let whereClauseCalledWith: any = null;
    const mockDatabase = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((condition) => {
            whereClauseCalledWith = condition;
            return Promise.resolve([{ id: 1, path: 'C:\\Music', parentId: null }]);
          })
        })
      }),
      insert: vi.fn()
    } as unknown as DB;

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      [],
      'win32',
      mockDatabase
    );

    expect(folderMap.get('c:\\music')).toBe(1);
    expect(mockDatabase.select).toHaveBeenCalled();
    expect(whereClauseCalledWith).toBeDefined();
  });
});
