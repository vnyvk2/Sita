import { syncAlbumArtworks } from '@main/db/queries/artworks';
import { describe, expect, it, vi } from 'vitest';

describe('syncAlbumArtworks (BUG-08 Preservation of LOCAL artwork)', () => {
  const extractParams = (condition: any): number[] => {
    const numbers: number[] = [];
    const visited = new Set<any>();

    const traverse = (node: any) => {
      if (!node || typeof node !== 'object') {
        if (typeof node === 'number') numbers.push(node);
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);

      if ('value' in node && typeof node.value === 'number') {
        numbers.push(node.value);
      }
      if (Array.isArray(node)) {
        for (const el of node) traverse(el);
      } else {
        if (node.queryChunks) traverse(node.queryChunks);
        if (node.value) traverse(node.value);
      }
    };

    traverse(condition);
    return numbers;
  };

  const createMockDb = (
    existingLinks: Array<{ artworkId: number; source: 'LOCAL' | 'REMOTE' }>
  ) => {
    const deletedArtworkIds: number[] = [];
    const insertedRecords: Array<{ albumId: number; artworkId: number }> = [];

    const mockTrx: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(existingLinks)
          }),
          where: vi.fn().mockImplementation(async () => {
            // Final select after mutations
            const remaining = existingLinks.filter((l) => !deletedArtworkIds.includes(l.artworkId));
            const all = [
              ...remaining,
              ...insertedRecords.map((r) => ({ artworkId: r.artworkId, source: 'REMOTE' as const }))
            ];
            return all.map((a) => ({ artworkId: a.artworkId }));
          })
        })
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((condition) => {
          const rawParams = extractParams(condition);
          const matchingDeleted = existingLinks
            .map((l) => l.artworkId)
            .filter((id) => rawParams.includes(id));
          deletedArtworkIds.push(...matchingDeleted);
          return Promise.resolve();
        })
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((records) => {
          insertedRecords.push(...records);
          return Promise.resolve();
        })
      })
    };

    return { mockTrx, deletedArtworkIds, insertedRecords };
  };

  it('Case 1: LOCAL + new REMOTE -> Preserves LOCAL and adds new REMOTE', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([
      { artworkId: 101, source: 'LOCAL' }
    ]);

    const result = await syncAlbumArtworks(1, [201], mockTrx);

    expect(deletedArtworkIds).toEqual([]); // LOCAL artwork is NEVER deleted
    expect(insertedRecords).toEqual([{ albumId: 1, artworkId: 201 }]);
    expect(result).toEqual([{ artworkId: 101 }, { artworkId: 201 }]);
  });

  it('Case 2: REMOTE + new REMOTE -> Replaces old REMOTE with new REMOTE', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([
      { artworkId: 201, source: 'REMOTE' }
    ]);

    const result = await syncAlbumArtworks(1, [202], mockTrx);

    expect(deletedArtworkIds).toEqual([201]); // Old REMOTE artwork is removed
    expect(insertedRecords).toEqual([{ albumId: 1, artworkId: 202 }]);
    expect(result).toEqual([{ artworkId: 202 }]);
  });

  it('Case 3: LOCAL + REMOTE + new REMOTE -> Preserves LOCAL and replaces old REMOTE', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([
      { artworkId: 101, source: 'LOCAL' },
      { artworkId: 201, source: 'REMOTE' }
    ]);

    const result = await syncAlbumArtworks(1, [202], mockTrx);

    expect(deletedArtworkIds).toEqual([201]); // Only old REMOTE is removed
    expect(insertedRecords).toEqual([{ albumId: 1, artworkId: 202 }]);
    expect(result).toEqual([{ artworkId: 101 }, { artworkId: 202 }]);
  });

  it('Case 4: None + new REMOTE -> Adds new REMOTE', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([]);

    const result = await syncAlbumArtworks(1, [201], mockTrx);

    expect(deletedArtworkIds).toEqual([]);
    expect(insertedRecords).toEqual([{ albumId: 1, artworkId: 201 }]);
    expect(result).toEqual([{ artworkId: 201 }]);
  });

  it('Case 5: LOCAL + no new artwork -> LOCAL unchanged', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([
      { artworkId: 101, source: 'LOCAL' }
    ]);

    const result = await syncAlbumArtworks(1, [], mockTrx);

    expect(deletedArtworkIds).toEqual([]); // No deletions
    expect(insertedRecords).toEqual([]); // No additions
    expect(result).toEqual([{ artworkId: 101 }]);
  });

  it('Case 6: LOCAL + new LOCAL with replaceLocal: true -> Unlinks old LOCAL and adds new LOCAL', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([
      { artworkId: 101, source: 'LOCAL' }
    ]);

    const result = await syncAlbumArtworks(1, [201], mockTrx, { replaceLocal: true });

    expect(deletedArtworkIds).toEqual([101]); // Old LOCAL is removed with opt-in replaceLocal
    expect(insertedRecords).toEqual([{ albumId: 1, artworkId: 201 }]);
    expect(result).toEqual([{ artworkId: 201 }]);
  });

  it('Case 7: LOCAL + REMOTE + new with replaceLocal: true -> Unlinks both old LOCAL and REMOTE and adds new', async () => {
    const { mockTrx, deletedArtworkIds, insertedRecords } = createMockDb([
      { artworkId: 101, source: 'LOCAL' },
      { artworkId: 201, source: 'REMOTE' }
    ]);

    const result = await syncAlbumArtworks(1, [301], mockTrx, { replaceLocal: true });

    expect(deletedArtworkIds).toEqual([101, 201]); // Both old LOCAL and REMOTE removed
    expect(insertedRecords).toEqual([{ albumId: 1, artworkId: 301 }]);
    expect(result).toEqual([{ artworkId: 301 }]);
  });
});
