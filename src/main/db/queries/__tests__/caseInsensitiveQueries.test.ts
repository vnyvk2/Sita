import { db } from '@main/db/db';
import { albums, artists, genres } from '@main/db/schema';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { getAlbumWithTitle } from '../albums';
import { getArtistWithName } from '../artists';
import { getGenreWithTitle, getGenreByName } from '../genres';

describe('Case-Insensitive Queries (DEF-SCN-01)', () => {
  beforeEach(async () => {
    // Clean up test rows
    await db.delete(genres).where(eq(genres.name, 'Rock'));
    await db.delete(genres).where(eq(genres.name, 'Électronique'));
    await db.delete(albums).where(eq(albums.title, 'The Dark Side of the Moon'));
    await db.delete(albums).where(eq(albums.title, 'Électronique'));
    await db.delete(artists).where(eq(artists.name, 'Pink Floyd'));
    await db.delete(artists).where(eq(artists.name, 'Sigur Rós'));
  });

  afterEach(async () => {
    await db.delete(genres).where(eq(genres.name, 'Rock'));
    await db.delete(genres).where(eq(genres.name, 'Électronique'));
    await db.delete(albums).where(eq(albums.title, 'The Dark Side of the Moon'));
    await db.delete(albums).where(eq(albums.title, 'Électronique'));
    await db.delete(artists).where(eq(artists.name, 'Pink Floyd'));
    await db.delete(artists).where(eq(artists.name, 'Sigur Rós'));
  });

  it('matches genres case-insensitively for ASCII and Unicode without UNIQUE collision', async () => {
    await db.insert(genres).values({ name: 'Rock' });
    await db.insert(genres).values({ name: 'Électronique' });

    // Exact match
    const g1 = await getGenreWithTitle('Rock');
    expect(g1).toBeDefined();
    expect(g1?.name).toBe('Rock');

    // Lowercase ASCII
    const g2 = await getGenreWithTitle('rock');
    expect(g2).toBeDefined();
    expect(g2?.id).toBe(g1?.id);

    // Uppercase ASCII
    const g3 = await getGenreByName('ROCK');
    expect(g3).toBeDefined();
    expect(g3?.id).toBe(g1?.id);

    // Mixed case ASCII
    const g4 = await getGenreByName('rOcK');
    expect(g4).toBeDefined();
    expect(g4?.id).toBe(g1?.id);

    // Unicode genre lookup
    const gUni = await getGenreWithTitle('Électronique');
    expect(gUni).toBeDefined();
    expect(gUni?.name).toBe('Électronique');

    const gUni2 = await getGenreByName('Électronique');
    expect(gUni2).toBeDefined();
    expect(gUni2?.id).toBe(gUni?.id);
  });

  it('matches albums case-insensitively for ASCII and Unicode', async () => {
    await db.insert(albums).values({ title: 'The Dark Side of the Moon' });
    await db.insert(albums).values({ title: 'Électronique' });

    const a1 = await getAlbumWithTitle('The Dark Side of the Moon');
    expect(a1).toBeDefined();

    const a2 = await getAlbumWithTitle('the dark side of the moon');
    expect(a2).toBeDefined();
    expect(a2?.id).toBe(a1?.id);

    const a3 = await getAlbumWithTitle('THE DARK SIDE OF THE MOON');
    expect(a3).toBeDefined();
    expect(a3?.id).toBe(a1?.id);

    const aUni = await getAlbumWithTitle('Électronique');
    expect(aUni).toBeDefined();
    expect(aUni?.title).toBe('Électronique');
  });

  it('matches artists case-insensitively for ASCII and Unicode', async () => {
    await db.insert(artists).values({ name: 'Pink Floyd' });
    await db.insert(artists).values({ name: 'Sigur Rós' });

    const ar1 = await getArtistWithName('Pink Floyd');
    expect(ar1).toBeDefined();

    const ar2 = await getArtistWithName('pink floyd');
    expect(ar2).toBeDefined();
    expect(ar2?.id).toBe(ar1?.id);

    const ar3 = await getArtistWithName('PINK FLOYD');
    expect(ar3).toBeDefined();
    expect(ar3?.id).toBe(ar1?.id);

    const arUni = await getArtistWithName('Sigur Rós');
    expect(arUni).toBeDefined();
    expect(arUni?.name).toBe('Sigur Rós');
  });

  it('handles invalid / non-string inputs gracefully', async () => {
    expect(await getAlbumWithTitle('' as unknown as string)).toBeUndefined();
    expect(await getAlbumWithTitle(null as unknown as string)).toBeUndefined();
    expect(await getAlbumWithTitle(undefined as unknown as string)).toBeUndefined();

    expect(await getArtistWithName('' as unknown as string)).toBeUndefined();
    expect(await getArtistWithName(null as unknown as string)).toBeUndefined();
    expect(await getArtistWithName(undefined as unknown as string)).toBeUndefined();

    expect(await getGenreWithTitle('' as unknown as string)).toBeUndefined();
    expect(await getGenreWithTitle(null as unknown as string)).toBeUndefined();
    expect(await getGenreWithTitle(undefined as unknown as string)).toBeUndefined();

    expect(await getGenreByName('' as unknown as string)).toBeUndefined();
    expect(await getGenreByName(null as unknown as string)).toBeUndefined();
    expect(await getGenreByName(undefined as unknown as string)).toBeUndefined();
  });
});
