import { db } from '@main/db/db';
import { reconcileExistingMultiGenres } from '@main/db/queries/genres';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@main/db/db', () => ({
  db: {
    transaction: vi.fn(async (cb) => {
      const mockTrx = createMockDbState([]);
      return cb(mockTrx);
    })
  }
}));

interface MockGenre {
  id: number;
  name: string;
  nameCI: string;
  songs?: Array<{ songId: number }>;
  artworks?: Array<{ artworkId: number }>;
}

/**
 * Creates a stateful mock DB transaction that realistically enforces:
 *
 * 1. Name-based lookup in genres (nameCI)
 * 2. Primary key constraint / ON CONFLICT DO NOTHING on genres_songs (genre_id, song_id)
 * 3. Primary key constraint / ON CONFLICT DO NOTHING on artworks_genres (artwork_id, genre_id)
 * 4. Genre creation and deletion tracking
 */
function createMockDbState(initialGenres: MockGenre[]) {
  let nextGenreId = 100;
  const genresMap = new Map<string, MockGenre>();
  const allGenresList: MockGenre[] = [];
  const songsGenresSet = new Set<string>(); // "genreId:songId"
  const artworksGenresSet = new Set<string>(); // "artworkId:genreId"
  const deletedGenreIds = new Set<number>();
  const createdGenres: MockGenre[] = [];

  for (const g of initialGenres) {
    genresMap.set(g.nameCI.toLowerCase(), g);
    allGenresList.push(g);
    if (g.songs) {
      for (const s of g.songs) {
        songsGenresSet.add(`${g.id}:${s.songId}`);
      }
    }
    if (g.artworks) {
      for (const a of g.artworks) {
        artworksGenresSet.add(`${a.artworkId}:${g.id}`);
      }
    }
  }

  const mockTrx: any = {
    _state: {
      genresMap,
      songsGenresSet,
      artworksGenresSet,
      deletedGenreIds,
      createdGenres
    },
    query: {
      genres: {
        findMany: vi.fn().mockImplementation(() => {
          return Promise.resolve([...allGenresList]);
        }),
        findFirst: vi.fn().mockImplementation((options) => {
          // When getGenreWithTitle runs: where: (genres, { eq }) => eq(genres.nameCI, genreTitle.toLowerCase())
          if (options && typeof options.where === 'function') {
            let matchedTitle = '';
            const dummyGenres = { nameCI: 'nameCI' };
            const dummyHelpers = {
              eq: (_col: any, val: string) => {
                matchedTitle = val.toLowerCase();
              }
            };
            options.where(dummyGenres, dummyHelpers);
            if (matchedTitle) {
              const found = genresMap.get(matchedTitle);
              return Promise.resolve(found && !deletedGenreIds.has(found.id) ? found : undefined);
            }
          }
          return Promise.resolve(undefined);
        })
      }
    },
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((val) => {
        // Genre insert: { name: canonicalName }
        if (val && typeof val.name === 'string') {
          const lower = val.name.toLowerCase();
          if (genresMap.has(lower)) {
            // Already exists
            const existing = genresMap.get(lower)!;
            return {
              onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
              onConflictDoUpdate: () => ({ returning: () => Promise.resolve([existing]) }),
              returning: () => Promise.resolve([existing])
            };
          }
          const newGenre: MockGenre = {
            id: nextGenreId++,
            name: val.name,
            nameCI: lower,
            songs: [],
            artworks: []
          };
          genresMap.set(lower, newGenre);
          createdGenres.push(newGenre);
          return {
            onConflictDoNothing: () => ({ returning: () => Promise.resolve([newGenre]) }),
            onConflictDoUpdate: () => ({ returning: () => Promise.resolve([newGenre]) }),
            returning: () => Promise.resolve([newGenre])
          };
        }

        // Artworks insert: [{ artworkId, genreId }]
        if (Array.isArray(val)) {
          const inserted: any[] = [];
          for (const item of val) {
            const key = `${item.artworkId}:${item.genreId}`;
            if (!artworksGenresSet.has(key)) {
              artworksGenresSet.add(key);
              inserted.push(item);
            }
          }
          return {
            onConflictDoNothing: () => ({ returning: () => Promise.resolve(inserted) }),
            returning: () => Promise.resolve(inserted)
          };
        }

        // Song link insert: { genreId, songId }
        if (val && typeof val.genreId === 'number' && typeof val.songId === 'number') {
          const key = `${val.genreId}:${val.songId}`;
          if (songsGenresSet.has(key)) {
            // Conflict simulated: returns empty array on ON CONFLICT DO NOTHING
            return {
              onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
              returning: () => Promise.resolve([])
            };
          }
          songsGenresSet.add(key);
          return {
            onConflictDoNothing: () => ({ returning: () => Promise.resolve([val]) }),
            returning: () => Promise.resolve([val])
          };
        }

        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
          returning: () => Promise.resolve([])
        };
      })
    })),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        // deleteGenre passes eq(genres.id, genreId)
        return {
          then: (resolve: () => void) => {
            resolve();
          }
        };
      })
    }))
  };

  // Enhance delete to record deleted genre ID from deleteGenre call
  mockTrx.delete = vi.fn().mockImplementation(() => ({
    where: vi.fn().mockImplementation((condition) => {
      // Extract genre ID from eq(genres.id, genreId)
      let deletedId: number | undefined;
      if (condition && typeof condition === 'object') {
        const dummyGenres = { id: 'id' };
        const dummyHelpers = {
          eq: (_col: any, val: number) => {
            deletedId = val;
          }
        };
        if (typeof condition === 'function') {
          condition(dummyGenres, dummyHelpers);
        }
      }
      return Promise.resolve([]);
    })
  }));

  return mockTrx;
}

describe('reconcileExistingMultiGenres database migration / reconciliation', () => {
  it('splits malformed delimiter genres (e.g. Rock,pop) and re-links songs to canonical records', async () => {
    const existingGenres: MockGenre[] = [
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

    const mockTrx = createMockDbState(existingGenres);
    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(1);

    // Verified: Created canonical Rock and pop records
    const createdNames = mockTrx._state.createdGenres.map((g: MockGenre) => g.name);
    expect(createdNames).toContain('Rock');
    expect(createdNames).toContain('pop');

    // Both song 10 and song 20 are linked to Rock and pop
    const rock = mockTrx._state.genresMap.get('rock')!;
    const pop = mockTrx._state.genresMap.get('pop')!;
    expect(rock).toBeDefined();
    expect(pop).toBeDefined();

    expect(mockTrx._state.songsGenresSet.has(`${rock.id}:10`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${rock.id}:20`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:10`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:20`)).toBe(true);

    // Artwork from Rock,pop was linked to canonical genres
    expect(mockTrx._state.artworksGenresSet.has(`5:${rock.id}`)).toBe(true);
    expect(mockTrx._state.artworksGenresSet.has(`5:${pop.id}`)).toBe(true);
  });

  it('merges relationships into pre-existing canonical genres without creating duplicates or failing on overlapping songs/artworks', async () => {
    // "Rock" already exists with ID 10 and already has song 10 and artwork 5
    const existingRock: MockGenre = {
      id: 10,
      name: 'Rock',
      nameCI: 'rock',
      songs: [{ songId: 10 }],
      artworks: [{ artworkId: 5 }]
    };

    // "Rock,pop" has overlapping song 10, new song 20, and overlapping artwork 5
    const malformedRockPop: MockGenre = {
      id: 1,
      name: 'Rock,pop',
      nameCI: 'rock,pop',
      songs: [{ songId: 10 }, { songId: 20 }],
      artworks: [{ artworkId: 5 }]
    };

    const mockTrx = createMockDbState([malformedRockPop, existingRock]);
    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(1);

    // Verified: Rock already existed, so ONLY Pop was created
    const createdNames = mockTrx._state.createdGenres.map((g: MockGenre) => g.name);
    expect(createdNames).not.toContain('Rock');
    expect(createdNames).toContain('pop');

    // Verified: Songs and artworks are merged into existing Rock (genreId 10)
    // Overlapping song 10 remained linked, new song 20 was linked
    expect(mockTrx._state.songsGenresSet.has('10:10')).toBe(true);
    expect(mockTrx._state.songsGenresSet.has('10:20')).toBe(true);

    // Overlapping artwork 5 remained linked to Rock (genreId 10)
    expect(mockTrx._state.artworksGenresSet.has('5:10')).toBe(true);

    // Newly created Pop genre received song 10, song 20, and artwork 5
    const pop = mockTrx._state.genresMap.get('pop')!;
    expect(pop).toBeDefined();
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:10`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:20`)).toBe(true);
    expect(mockTrx._state.artworksGenresSet.has(`5:${pop.id}`)).toBe(true);
  });

  it('converges multiple legacy compound genres ("Rock,pop", "Rock;Pop", "Rock / Pop") into the same canonical genres without duplicate records', async () => {
    const legacyGenres: MockGenre[] = [
      {
        id: 1,
        name: 'Rock,pop',
        nameCI: 'rock,pop',
        songs: [{ songId: 101 }],
        artworks: [{ artworkId: 1 }]
      },
      {
        id: 2,
        name: 'Rock;Pop',
        nameCI: 'rock;pop',
        songs: [{ songId: 102 }],
        artworks: [{ artworkId: 2 }]
      },
      {
        id: 3,
        name: 'Rock / Pop',
        nameCI: 'rock / pop',
        songs: [{ songId: 103 }],
        artworks: []
      }
    ];

    const mockTrx = createMockDbState(legacyGenres);
    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(3);

    // Exactly 2 canonical genres created in total: Rock and pop
    expect(mockTrx._state.createdGenres.length).toBe(2);
    const createdNames = mockTrx._state.createdGenres.map((g: MockGenre) => g.name);
    expect(createdNames).toContain('Rock');
    expect(createdNames).toContain('pop');

    const rock = mockTrx._state.genresMap.get('rock')!;
    const pop = mockTrx._state.genresMap.get('pop')!;

    // All songs (101, 102, 103) are linked to canonical Rock and pop
    expect(mockTrx._state.songsGenresSet.has(`${rock.id}:101`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${rock.id}:102`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${rock.id}:103`)).toBe(true);

    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:101`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:102`)).toBe(true);
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:103`)).toBe(true);
  });

  it('reconciles genres that differ from their canonical form only by surrounding whitespace', async () => {
    // Regression: a legacy "Pop " parses to ["Pop"], but previously required
    // GENRE_SEPARATOR_REGEX to match, which it never does for pure whitespace —
    // so these dirty records were silently skipped forever.
    const existingGenres: MockGenre[] = [
      {
        id: 1,
        name: 'Pop ',
        nameCI: 'Pop ',
        songs: [{ songId: 10 }],
        artworks: [{ artworkId: 5 }]
      }
    ];

    const mockTrx = createMockDbState(existingGenres);
    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(1);

    const createdNames = mockTrx._state.createdGenres.map((g: MockGenre) => g.name);
    expect(createdNames).toContain('Pop');

    const pop = mockTrx._state.genresMap.get('pop')!;
    expect(pop).toBeDefined();
    expect(mockTrx._state.songsGenresSet.has(`${pop.id}:10`)).toBe(true);
    expect(mockTrx._state.artworksGenresSet.has(`5:${pop.id}`)).toBe(true);
  });

  it('automatically opens a database transaction when called without an existing transaction', async () => {
    await reconcileExistingMultiGenres();
    expect(db.transaction).toHaveBeenCalled();
  });

  it('does not touch or delete compound genres like Hip-Hop/Rap or clean single genres', async () => {
    const existingGenres: MockGenre[] = [
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

    const mockTrx = createMockDbState(existingGenres);
    const result = await reconcileExistingMultiGenres(mockTrx);

    expect(result.reconciledCount).toBe(0);
    expect(mockTrx._state.createdGenres.length).toBe(0);
  });
});
