import { describe, it, expect, vi } from 'vitest';

import { expandDirectoryAncestors, resolveOrCreateMusicFolders } from '../folderHierarchy';

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

  it('Case 1: should expand and create brand-new nested hierarchy (Adele/21 under Music root)', async () => {
    const existingFolders = [{ id: 1, path: 'C:\\Music', parentId: null }];
    const insertedRows: Array<{ path: string; parentId: number; id: number; name: string }> = [];
    let nextId = 2;

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

    // Only the leaf directory is supplied
    const discoveredDirs = ['C:\\Music\\Adele\\21'];

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      discoveredDirs,
      'win32',
      mockDatabase
    );

    // Both intermediate artist and leaf album must be created
    expect(folderMap.get('c:\\music\\adele')).toBe(2);
    expect(folderMap.get('c:\\music\\adele\\21')).toBe(3);

    const adeleRow = insertedRows.find((r) => r.path === 'C:\\Music\\Adele');
    expect(adeleRow?.parentId).toBe(1); // parent is Music root (id: 1)

    const album21Row = insertedRows.find((r) => r.path === 'C:\\Music\\Adele\\21');
    expect(album21Row?.parentId).toBe(2); // parent is Adele (id: 2)
  });

  it('Case 2: should reuse existing intermediate folder and only create missing leaf (Adele exists, 21 is new)', async () => {
    const existingFolders = [
      { id: 1, path: 'C:\\Music', parentId: null },
      { id: 10, path: 'C:\\Music\\Adele', parentId: 1 }
    ];
    const insertedRows: Array<{ path: string; parentId: number; id: number }> = [];
    let nextId = 11;

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

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      ['C:\\Music\\Adele\\21'],
      'win32',
      mockDatabase
    );

    // Reused Adele
    expect(folderMap.get('c:\\music\\adele')).toBe(10);
    // Created 21
    expect(folderMap.get('c:\\music\\adele\\21')).toBe(11);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].path).toBe('C:\\Music\\Adele\\21');
    expect(insertedRows[0].parentId).toBe(10);
  });

  it('Case 3: should not duplicate records when entire hierarchy already exists in DB', async () => {
    const existingFolders = [
      { id: 1, path: 'C:\\Music', parentId: null },
      { id: 10, path: 'C:\\Music\\Adele', parentId: 1 },
      { id: 20, path: 'C:\\Music\\Adele\\21', parentId: 10 }
    ];

    const mockDatabase = {
      select: createSelectMock(existingFolders),
      insert: vi.fn()
    } as unknown as DB;

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      ['C:\\Music\\Adele\\21'],
      'win32',
      mockDatabase
    );

    expect(folderMap.get('c:\\music\\adele')).toBe(10);
    expect(folderMap.get('c:\\music\\adele\\21')).toBe(20);
    expect(mockDatabase.insert).not.toHaveBeenCalled();
  });

  it('Case 4: should handle multiple nested leaves and shared ancestors (Adele/21, Adele/25, Taylor/1989)', async () => {
    const existingFolders = [{ id: 1, path: 'C:\\Music', parentId: null }];
    const insertedRows: Array<{ path: string; parentId: number; id: number }> = [];
    let nextId = 100;

    const mockDatabase = {
      select: createSelectMock(existingFolders),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val) => ({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              const row = { ...val, id: nextId++ };
              insertedRows.push(row);
              return Promise.resolve([row]);
            })
          })
        }))
      }))
    } as unknown as DB;

    const folderMap = await resolveOrCreateMusicFolders(
      1,
      'C:\\Music',
      ['C:\\Music\\Adele\\21', 'C:\\Music\\Adele\\25', 'C:\\Music\\Taylor\\1989'],
      'win32',
      mockDatabase
    );

    const adeleId = folderMap.get('c:\\music\\adele')!;
    const taylorId = folderMap.get('c:\\music\\taylor')!;
    const album21Id = folderMap.get('c:\\music\\adele\\21')!;
    const album25Id = folderMap.get('c:\\music\\adele\\25')!;
    const album1989Id = folderMap.get('c:\\music\\taylor\\1989')!;

    expect(adeleId).toBeDefined();
    expect(taylorId).toBeDefined();
    expect(album21Id).toBeDefined();
    expect(album25Id).toBeDefined();
    expect(album1989Id).toBeDefined();

    // Verify parent relationships
    const adeleRow = insertedRows.find((r) => r.path === 'C:\\Music\\Adele');
    const taylorRow = insertedRows.find((r) => r.path === 'C:\\Music\\Taylor');
    const album21Row = insertedRows.find((r) => r.path === 'C:\\Music\\Adele\\21');
    const album25Row = insertedRows.find((r) => r.path === 'C:\\Music\\Adele\\25');
    const album1989Row = insertedRows.find((r) => r.path === 'C:\\Music\\Taylor\\1989');

    expect(adeleRow?.parentId).toBe(1);
    expect(taylorRow?.parentId).toBe(1);
    expect(album21Row?.parentId).toBe(adeleId);
    expect(album25Row?.parentId).toBe(adeleId);
    expect(album1989Row?.parentId).toBe(taylorId);
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
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(whereClauseCalledWith);

    expect(query.params).toContain('C:\\Music\\%');
  });
});

describe('expandDirectoryAncestors', () => {
  it('should expand nested subdirectories up to root on Windows', () => {
    const result = expandDirectoryAncestors('C:\\Music\\Adele\\21', 'C:\\Music', 'win32');
    expect(result).toEqual(['C:\\Music\\Adele\\21', 'C:\\Music\\Adele']);
  });

  it('should not include directories outside the configured root', () => {
    const result = expandDirectoryAncestors('C:\\Other\\Artist\\Album', 'C:\\Music', 'win32');
    expect(result).toEqual([]);
  });

  it('should return an empty array when directory is the root itself', () => {
    const result = expandDirectoryAncestors('C:\\Music', 'C:\\Music', 'win32');
    expect(result).toEqual([]);
  });

  it('should expand nested subdirectories up to root on POSIX', () => {
    const result = expandDirectoryAncestors('/music/Adele/21', '/music', 'linux');
    expect(result).toEqual(['/music/Adele/21', '/music/Adele']);
  });
});

