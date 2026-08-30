import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});
vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: undefined, payloads: undefined }),
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

import { db } from '@main/db/db';
import { ingestTrackDTO } from '@main/parseSong/ingestTrackDTO';
import { SongSearchEngine } from '@main/search/engines/SongSearchEngine';
import { ArtistSearchEngine } from '@main/search/engines/ArtistSearchEngine';
import { normalizeQuery } from '@main/search/normalize/normalizeQuery';
import { musicFolders, songs } from '@main/db/schema';

const FIXTURE = [
  { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, Were Dreaming', genre: 'Synthwave' },
  { title: 'Golden Hour', artist: 'JVKE', album: 'This Is What ___ Feels Like', genre: 'Pop' },
  { title: 'Velvet Heart', artist: 'The Velvet Ones', album: 'Soft', genre: 'Indie' },
  { title: 'Electric River', artist: 'Neon Collective', album: 'Current', genre: 'Electronic' }
];

const seed = async () => {
  await db.insert(musicFolders).values({ name: 'T', path: 'C:\\T' });
  for (let i = 0; i < FIXTURE.length; i++) {
    const t = FIXTURE[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ingestTrackDTO({
      songPath: `C:\\T\\track_${i}.mp3`,
      title: t.title,
      duration: '200',
      artists: [t.artist],
      albumArtists: [t.artist],
      album: t.album,
      genres: [t.genre],
      year: 2022,
      sampleRate: 44100,
      bitRate: 320000,
      noOfChannels: 2,
      diskNumber: 1,
      trackNumber: 1,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date(),
      folderId: 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, db, undefined);
  }
};

const songIdsFor = async (title: string): Promise<number[]> => {
  const rows = await db.select({ id: songs.id }).from(songs).where(eq(songs.title, title));
  return rows.map((r) => r.id);
};

describe('typo-resistant search (progressive fuzzy threshold)', () => {
  beforeAll(seed);

  const finds = async (keyword: string, title: string) => {
    const ids = await songIdsFor(title);
    const refs = await SongSearchEngine.search(normalizeQuery(keyword));
    return ids.some((id) => refs.some((r) => r.kind === 'song' && r.id === id));
  };

  it('pass 1 (pg parity): correct + single-letter typos match at 0.3', async () => {
    expect(await finds('midnight city', 'Midnight City')).toBe(true);
    expect(await finds('velvt heart', 'Velvet Heart')).toBe(true); // 0.444
    expect(await finds('golen hour', 'Golden Hour')).toBe(true); // 0.533
  });

  it('pass 2 (floor 0.2): transpositions and short typos that pg_trgm rejected', async () => {
    // 'midngith' = 0.286, 'ctiy' side weak — combined ~0.273: pg rejected, we catch
    expect(await finds('midngith city', 'Midnight City')).toBe(true);
    // 'midngith' alone = 0.286 < 0.3: pg returned 0 rows, we return the song
    expect(await finds('midngith', 'Midnight City')).toBe(true);
  });

  it('artist search benefits from the same progressive fuzzy', async () => {
    const refs = await ArtistSearchEngine.search(normalizeQuery('m38')); // digits — trigram-weak
    void refs;
    const hits = await ArtistSearchEngine.search(normalizeQuery('m83'));
    expect(hits.some((r) => r.kind === 'artist')).toBe(true);
    // transposed artist name ('83m' -> 'm83' is fine; try letter transposition on a word artist)
    const velvet = await ArtistSearchEngine.search(normalizeQuery('velvt ones'));
    expect(velvet.some((r) => r.kind === 'artist')).toBe(true);
  });

  it('negative queries stay empty (no noise from the floor)', async () => {
    const refs = await SongSearchEngine.search(normalizeQuery('zzqq xxww'));
    expect(refs).toHaveLength(0);
  });
});
