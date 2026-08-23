import { describe, expect, it, vi } from 'vitest';
import { reconcileExistingMultiGenres } from '@main/db/queries/genres';

describe('reconcileExistingMultiGenres database migration / reconciliation', () => {
  it('splits malformed delimiter genres (e.g. Rock,pop) and re-links songs to canonical records', async () => {
    const existingGenres = [
      {
        id: 1,
        name: 'Rock,pop',
        nameCI: 'rock,pop',
        songs: [{ songId: 10 }, { songId: 20 }],
        artworks: [{ artworkId: 5 }]
      },
      {
        id: 2,
        name: 'Hip-Hop/Rap',
        nameCI: 'hip-hop/rap',
        songs: [{ songId: 30 }],
        artworks: []
      },
      {
        id: 3,
        name: 'Jazz',
        nameCI: 'jazz',
        songs: [{ songId: 40 }],
        artworks: []
      }
    ];

    const createdGenres: Array<{ id: number; name: string }> = [];
    const linkedSongs: Array<{ genreId: number; songId: number }> = [];
    const linkedArtworks: Array<{ artworkId: number; genreId: number }> = [];
    const deletedGenreIds: number[] = [];

    let nextId = 100;

    const mockTrx: any = {
      query: {
        genres: {
          findMany: vi.fn().mockResolvedValue(existingGenres),
          findFirst: vi.fn().mockImplementation(({ where }) => {
            // Find in created genres or existing genres
            return Promise.resolve(undefined);
          })
        }
      },
      insert: vi.fn().mockImplementation((table) => ({
        values: vi.fn().mockImplementation((val) => {
          if (val.name) {
            const newG = { id: nextId++, name: val.name, nameCI: val.name.toLowerCase() };
            createdGenres.push(newG);
            return {
              returning: () => Promise.resolve([newG]),
              onConflictDoNothing: () => ({ returning: () => Promise.resolve([newG]) })
            };
          }
          if (Array.isArray(val)) {
            // Artworks
            linkedArtworks.push(...val);
            return {
              onConflictDoNothing: () => ({ returning: () => Promise.resolve(val) }),
              returning: () => Promise.resolve(val)
            };
          }
          if (val.genreId && val.songId) {
            linkedSongs.push(val);
            return {
              onConflictDoNothing: () => ({ returning: () => Promise.resolve([val]) }),
              returning: () => Promise.resolve([val])
            };
          }
          return {
            returning: () => Promise.resolve([]),
            onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) })
          };
        })
      })),
      delete: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          deletedGenreIds.push(1); // Deleted genre id 1 (Rock,pop)
          return Promise.resolve();
        })
      }))
    };

    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(1);
    expect(deletedGenreIds).toContain(1);

    // Created Rock and pop
    const createdNames = createdGenres.map((g) => g.name);
    expect(createdNames).toContain('Rock');
    expect(createdNames).toContain('pop');

    // Both song 10 and song 20 are linked to newly created genres
    const song10Links = linkedSongs.filter((l) => l.songId === 10);
    const song20Links = linkedSongs.filter((l) => l.songId === 20);
    expect(song10Links.length).toBe(2);
    expect(song20Links.length).toBe(2);

    // Artwork from Rock,pop was linked to canonical genres
    expect(linkedArtworks.length).toBe(2);
  });

  it('does not touch or delete compound genres like Hip-Hop/Rap or clean single genres', async () => {
    const existingGenres = [
      {
        id: 1,
        name: 'Hip-Hop/Rap',
        nameCI: 'hip-hop/rap',
        songs: [{ songId: 10 }],
        artworks: []
      },
      {
        id: 2,
        name: 'R&B/Soul',
        nameCI: 'r&b/soul',
        songs: [{ songId: 20 }],
        artworks: []
      },
      {
        id: 3,
        name: 'Rock & Roll',
        nameCI: 'rock & roll',
        songs: [{ songId: 30 }],
        artworks: []
      }
    ];

    const mockTrx: any = {
      query: {
        genres: {
          findMany: vi.fn().mockResolvedValue(existingGenres),
          findFirst: vi.fn().mockResolvedValue(undefined)
        }
      },
      insert: vi.fn(),
      delete: vi.fn()
    };

    const result = await reconcileExistingMultiGenres(mockTrx);
    expect(result.reconciledCount).toBe(0);
    expect(mockTrx.insert).not.toHaveBeenCalled();
    expect(mockTrx.delete).not.toHaveBeenCalled();
  });
});
