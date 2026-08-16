import { db } from '@main/db/db';
import { songs } from '@main/db/schema';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { getAllSongIds, getAllSongs } from '../songs';

describe('getAllSongIds Query vs getAllSongs Projection Equivalence across ALL Sort Types', () => {
  const testSongIds: number[] = [];

  beforeEach(async () => {
    const t1 = new Date(Date.now() - 40000);
    const t2 = new Date(Date.now() - 30000);
    const t3 = new Date(Date.now() - 20000);
    const t4 = new Date(Date.now() - 10000);

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
          skipCount: 5,
          fileCreatedAt: t1,
          fileModifiedAt: t4,
          createdAt: t1
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
          skipCount: 15,
          fileCreatedAt: t2,
          fileModifiedAt: t3,
          createdAt: t2
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
          skipCount: 0,
          fileCreatedAt: t3,
          fileModifiedAt: t2,
          createdAt: t3
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
          skipCount: 2,
          fileCreatedAt: t4,
          fileModifiedAt: t1,
          createdAt: t4
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

  const allSortTypes: SongSortTypes[] = [
    'aToZ',
    'zToA',
    'releasedYearAscending',
    'releasedYearDescending',
    'trackNoAscending',
    'trackNoDescending',
    'dateAddedAscending',
    'dateAddedDescending',
    'dateModifiedAscending',
    'dateModifiedDescending',
    'addedOrder',
    'mostSkipped',
    'leastSkipped'
  ];

  for (const sortType of allSortTypes) {
    it(`should return exact same order of IDs as getAllSongs for sortType: '${sortType}'`, async () => {
      const fullResult = await getAllSongs({ sortType, filterType: 'notSelected' });
      const idResult = await getAllSongIds({ sortType, filterType: 'notSelected' });

      const expectedIds = fullResult.data.map((s) => s.id);
      expect(idResult).toEqual(expectedIds);
    });
  }

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
