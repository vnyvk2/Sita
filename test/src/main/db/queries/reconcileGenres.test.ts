import { describe, expect, it, vi } from 'vitest';
import { reconcileExistingMultiGenres } from '@main/db/queries/genres';
import { db } from '@main/db/db';

vi.mock('@main/db/db', () => ({
  db: {
    transaction: vi.fn(async (cb) => {
      const mockTrx = {
        query: {
          genres: {
            findMany: vi.fn().mockResolvedValue([]),
            findFirst: vi.fn().mockResolvedValue(undefined)
          }
        },
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
            onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) })
          })
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      };
      return cb(mockTrx);
    })
  }
}));

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
          findFirst: vi.fn().mockImplementation(() => {
            return Promise.resolve(undefined);
          })
        }
      },
      insert: vi.fn().mockImplementation(() => ({
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

  it('merges relationships into pre-existing canonical genres without creating duplicates or failing on overlapping songs/artworks', async () => {
    // "Rock" already exists with ID 10 and already has song 10 and artwork 5
    const existingRock = {
      id: 10,
      name: 'Rock',
      nameCI: 'rock',
      songs: [{ songId: 10 }],
      artworks: [{ artworkId: 5 }]
    };

    // "Rock,pop" has overlapping song 10, new song 20, and overlapping artwork 5
    const malformedRockPop = {
      id: 1,
      name: 'Rock,pop',
      nameCI: 'rock,pop',
      songs: [{ songId: 10 }, { songId: 20 }],
      artworks: [{ artworkId: 5 }]
    };

    const existingGenres = [malformedRockPop, existingRock];
    const createdGenres: Array<{ id: number; name: string }> = [];
    const linkedSongs: Array<{ genreId: number; songId: number }> = [];
    const linkedArtworks: Array<{ artworkId: number; genreId: number }> = [];
    const deletedGenreIds: number[] = [];

    const mockTrx: any = {
      query: {
        genres: {
          findMany: vi.fn().mockResolvedValue(existingGenres),
          findFirst: vi.fn().mockImplementation(({ where }) => {
            // When looking up "Rock", return the pre-existing Rock record
            return Promise.resolve(existingRock);
          })
        }
      },
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val) => {
          if (val.name) {
            // Only non-existing canonical genres (e.g. pop) should trigger an insert
            const newG = { id: 20, name: val.name, nameCI: val.name.toLowerCase() };
            createdGenres.push(newG);
            return {
              returning: () => Promise.resolve([newG]),
              onConflictDoNothing: () => ({ returning: () => Promise.resolve([newG]) })
            };
          }
          if (Array.isArray(val)) {
            // Linking artworks (idempotent)
            linkedArtworks.push(...val);
            return {
              onConflictDoNothing: () => ({ returning: () => Promise.resolve(val) }),
              returning: () => Promise.resolve(val)
            };
          }
          if (val.genreId && val.songId) {
            // Linking songs (idempotent)
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
          deletedGenreIds.push(1); // Only delete malformed genre 1
          return Promise.resolve();
        })
      }))
    };

    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(1);
    // Verified: No duplicate Rock record created, only Pop created if absent
    expect(createdGenres.map((g) => g.name)).not.toContain('Rock');

    // Verified: Songs and artworks are merged into existing Rock (genreId 10)
    const rockSongLinks = linkedSongs.filter((l) => l.genreId === 10);
    expect(rockSongLinks.some((l) => l.songId === 10)).toBe(true);
    expect(rockSongLinks.some((l) => l.songId === 20)).toBe(true);

    const rockArtLinks = linkedArtworks.filter((l) => l.genreId === 10);
    expect(rockArtLinks.some((l) => l.artworkId === 5)).toBe(true);

    // Verified: Malformed genre record 1 is deleted
    expect(deletedGenreIds).toContain(1);
    expect(deletedGenreIds).not.toContain(10);
  });

  it('automatically opens a database transaction when called without an existing transaction', async () => {
    await reconcileExistingMultiGenres();
    expect(db.transaction).toHaveBeenCalled();
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
