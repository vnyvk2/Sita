import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../../../../src/main/db/db';
import { getHistorySongIds } from '../../../../../src/main/db/queries/history';
import { metadataOverrides, musicFolders, playHistory, songs } from '../../../../../src/main/db/schema';

describe('getHistorySongIds (ID-First Windowed Query with Event Preservation)', () => {
  let folderId: number;

  beforeEach(async () => {
    await db.delete(playHistory);
    await db.delete(songs);
    await db.delete(musicFolders);

    const now = new Date();
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        parentId: null,
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();
    folderId = folder.id;
  });

  it('preserves { songId, playedAt, playCount } event structure without flattening to bare numbers', async () => {
    const now = new Date();
    const [song1] = await db
      .insert(songs)
      .values({
        title: 'Song 1',
        duration: 180,
        path: 'C:\\Music\\song1.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [song2] = await db
      .insert(songs)
      .values({
        title: 'Song 2',
        duration: 240,
        path: 'C:\\Music\\song2.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const t1 = new Date(Date.now() - 60000);
    const t2 = new Date(Date.now() - 30000);
    const t3 = new Date(Date.now() - 10000);

    // Song 1 played once at t1
    await db.insert(playHistory).values({ songId: song1.id, createdAt: t1 });
    // Song 2 played twice at t2 and t3
    await db.insert(playHistory).values({ songId: song2.id, createdAt: t2 });
    await db.insert(playHistory).values({ songId: song2.id, createdAt: t3 });

    const result = await getHistorySongIds({ sortType: 'addedOrder' });

    expect(result.ids).toEqual([song2.id, song1.id]);
    expect(result.total).toBe(2);
    expect(result.totalDuration).toBe(420); // 180 + 240

    // Validate event structures
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      songId: song2.id,
      playedAt: t3.getTime(),
      playCount: 2
    });
    expect(result.entries[1]).toEqual({
      songId: song1.id,
      playedAt: t1.getTime(),
      playCount: 1
    });
  });

  it('correctly sorts by most listened and respects limit', async () => {
    const now = new Date();
    const [s1] = await db
      .insert(songs)
      .values({
        title: 'S1',
        duration: 100,
        path: 'C:\\s1.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [s2] = await db
      .insert(songs)
      .values({
        title: 'S2',
        duration: 100,
        path: 'C:\\s2.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [s3] = await db
      .insert(songs)
      .values({
        title: 'S3',
        duration: 100,
        path: 'C:\\s3.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // S1: 1 play, S2: 3 plays, S3: 2 plays
    await db.insert(playHistory).values({ songId: s1.id });
    await db.insert(playHistory).values({ songId: s2.id });
    await db.insert(playHistory).values({ songId: s2.id });
    await db.insert(playHistory).values({ songId: s2.id });
    await db.insert(playHistory).values({ songId: s3.id });
    await db.insert(playHistory).values({ songId: s3.id });

    // Limit 2 top songs
    const result = await getHistorySongIds({
      sortType: 'allTimeMostListened',
      limit: 2
    });

    expect(result.ids).toEqual([s2.id, s3.id]);
    expect(result.entries[0].playCount).toBe(3);
    expect(result.entries[1].playCount).toBe(2);
  });

  it('filters by period and calculates distinct languages', async () => {
    const now = new Date();
    const [songRecent] = await db
      .insert(songs)
      .values({
        title: 'Recent Song',
        duration: 150,
        language: 'English',
        path: 'C:\\recent.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songOld] = await db
      .insert(songs)
      .values({
        title: 'Old Song',
        duration: 200,
        language: 'Spanish',
        path: 'C:\\old.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await db.insert(playHistory).values({ songId: songRecent.id, createdAt: twoDaysAgo });
    await db.insert(playHistory).values({ songId: songOld.id, createdAt: tenDaysAgo });

    // 7-day period should include songRecent (2 days ago) and exclude songOld (10 days ago)
    const result7d = await getHistorySongIds({ period: '7' });
    expect(result7d.ids).toEqual([songRecent.id]);
    expect(result7d.languages).toEqual(['English']);

    // 'all' period should include both
    const resultAll = await getHistorySongIds({ period: 'all' });
    expect(resultAll.ids).toContain(songRecent.id);
    expect(resultAll.ids).toContain(songOld.id);
    expect(resultAll.languages).toEqual(['English', 'Spanish']);
  });

  it('correctly tracks blacklisted songs', async () => {
    const now = new Date();
    const [normalSong] = await db
      .insert(songs)
      .values({
        title: 'Normal',
        duration: 100,
        path: 'C:\\normal.mp3',
        isBlacklisted: false,
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [blacklistedSong] = await db
      .insert(songs)
      .values({
        title: 'Blacklisted',
        duration: 100,
        path: 'C:\\blacklisted.mp3',
        isBlacklisted: true,
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    await db.insert(playHistory).values({ songId: normalSong.id });
    await db.insert(playHistory).values({ songId: blacklistedSong.id });

    const result = await getHistorySongIds();
    expect(result.ids).toContain(normalSong.id);
    expect(result.ids).toContain(blacklistedSong.id);
    expect(result.blacklistedIds).toEqual([blacklistedSong.id]);
  });

  it('monthlyMostListened without period defaults to 30-day cutoff', async () => {
    const now = new Date();
    const [recentSong] = await db
      .insert(songs)
      .values({
        title: 'Recent Hit',
        duration: 120,
        path: 'C:\\recent-hit.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [oldSong] = await db
      .insert(songs)
      .values({
        title: 'Old Hit',
        duration: 120,
        path: 'C:\\old-hit.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // recentSong played 5 times within 10 days
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      await db.insert(playHistory).values({ songId: recentSong.id, createdAt: tenDaysAgo });
    }

    // oldSong played 20 times 45 days ago (outside 30-day window)
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < 20; i++) {
      await db.insert(playHistory).values({ songId: oldSong.id, createdAt: fortyFiveDaysAgo });
    }

    // Calling monthlyMostListened WITHOUT passing period must default to 30-day window
    const result = await getHistorySongIds({ sortType: 'monthlyMostListened' });
    expect(result.ids).toEqual([recentSong.id]);
    expect(result.ids).not.toContain(oldSong.id);
    expect(result.entries[0].playCount).toBe(5);
  });

  it('language filtering and facet calculation honors metadataOverrides', async () => {
    const now = new Date();
    const [song1] = await db
      .insert(songs)
      .values({
        title: 'Song 1',
        duration: 100,
        language: 'English',
        path: 'C:\\song1-override.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [song2] = await db
      .insert(songs)
      .values({
        title: 'Song 2',
        duration: 100,
        language: 'French',
        path: 'C:\\song2-override.mp3',
        folderId,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // Override song2 language to Japanese
    await db.insert(metadataOverrides).values({
      entityKind: 'song',
      entityId: String(song2.id),
      fieldId: 'language',
      stringValue: 'Japanese'
    });

    await db.insert(playHistory).values({ songId: song1.id });
    await db.insert(playHistory).values({ songId: song2.id });

    // Filter by overridden language
    const jpResult = await getHistorySongIds({ language: 'Japanese' });
    expect(jpResult.ids).toEqual([song2.id]);

    // Distinct languages facets must include override and exclude overridden value
    const allResult = await getHistorySongIds({ period: 'all' });
    expect(allResult.languages).toEqual(['English', 'Japanese']);
  });
});
