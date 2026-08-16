import { db } from '@main/db/db';
import { songs } from '@main/db/schema';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { getAllSongIds, getAllSongs } from '../songs';

describe('getAllSongIds Query vs getAllSongs Projection Equivalence', () => {
  const testSongIds: number[] = [];

  beforeEach(async () => {
    const now = new Date();
    // Insert test songs with varied titles, years, and dates
    const inserted = await db
      .insert(songs)
      .values([
        {
          title: 'Charlie Song',
          titleCI: 'charlie song',
          path: 'C:\\test\\charlie.mp3',
          year: 2020,
          trackNumber: 1,
          isBlacklisted: false,
          isFavorite: true,
          duration: 180,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Alpha Song',
          titleCI: 'alpha song',
          path: 'C:\\test\\alpha.mp3',
          year: 2018,
          trackNumber: 2,
          isBlacklisted: false,
          isFavorite: false,
          duration: 200,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Bravo Song',
          titleCI: 'bravo song',
          path: 'C:\\test\\bravo.mp3',
          year: 2022,
          trackNumber: 3,
          isBlacklisted: false,
          isFavorite: true,
          duration: 220,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Blacklisted Song',
          titleCI: 'blacklisted song',
          path: 'C:\\test\\blacklisted.mp3',
          year: 2019,
          trackNumber: 4,
          isBlacklisted: true,
          isFavorite: false,
          duration: 150,
          fileCreatedAt: now,
          fileModifiedAt: now
        }
      ])
      .returning({ id: songs.id });

    for (const item of inserted) {
      testSongIds.push(item.id);
    }
  });

  afterEach(async () => {
    for (const id of testSongIds) {
      await db.delete(songs).where(eq(songs.id, id));
    }
    testSongIds.length = 0;
  });

  it('should return exact same order of IDs as getAllSongs for aToZ sort', async () => {
    const fullResult = await getAllSongs({ sortType: 'aToZ', filterType: 'notSelected' });
    const idResult = await getAllSongIds({ sortType: 'aToZ', filterType: 'notSelected' });

    const expectedIds = fullResult.data.map((s) => s.id);
    expect(idResult).toEqual(expectedIds);
  });

  it('should return exact same order of IDs as getAllSongs for zToA sort', async () => {
    const fullResult = await getAllSongs({ sortType: 'zToA', filterType: 'notSelected' });
    const idResult = await getAllSongIds({ sortType: 'zToA', filterType: 'notSelected' });

    const expectedIds = fullResult.data.map((s) => s.id);
    expect(idResult).toEqual(expectedIds);
  });

  it('should filter favorites identically to getAllSongs', async () => {
    const fullResult = await getAllSongs({ sortType: 'aToZ', filterType: 'favorites' });
    const idResult = await getAllSongIds({ sortType: 'aToZ', filterType: 'favorites' });

    const expectedIds = fullResult.data.map((s) => s.id);
    expect(idResult).toEqual(expectedIds);
  });

  it('should filter blacklisted songs identically to getAllSongs', async () => {
    const fullResult = await getAllSongs({ sortType: 'aToZ', filterType: 'blacklistedSongs' });
    const idResult = await getAllSongIds({ sortType: 'aToZ', filterType: 'blacklistedSongs' });

    const expectedIds = fullResult.data.map((s) => s.id);
    expect(idResult).toEqual(expectedIds);
  });
});
