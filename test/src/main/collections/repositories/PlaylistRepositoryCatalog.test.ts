import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { db } from '../../../../../src/main/db/db';
import { playlistEntries, playlists, songs } from '../../../../../src/main/db/schema';

describe('PlaylistRepository.getPlaylistSongCatalog', () => {
  const repository = new PlaylistRepository();

  beforeEach(async () => {
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);
  });

  it('retrieves entries with entryId, songId, position, and totals', async () => {
    const [playlist] = await db
      .insert(playlists)
      .values({ name: `Test Playlist ${randomUUID()}` })
      .returning();

    const now = new Date();
    const seededSongs = await db
      .insert(songs)
      .values([
        {
          title: 'Alpha Song',
          duration: 100,
          language: 'English',
          path: `C:\\music\\alpha-${randomUUID()}.mp3`,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Beta Song',
          duration: 200,
          language: 'Spanish',
          path: `C:\\music\\beta-${randomUUID()}.mp3`,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Gamma Song',
          duration: 300,
          language: 'French',
          path: `C:\\music\\gamma-${randomUUID()}.mp3`,
          fileCreatedAt: now,
          fileModifiedAt: now
        }
      ])
      .returning();

    const [entry0] = await db
      .insert(playlistEntries)
      .values({
        playlistId: playlist.id,
        songId: seededSongs[0].id,
        position: 0,
        addedAt: new Date(Date.now() - 3000)
      })
      .returning();

    const [entry1] = await db
      .insert(playlistEntries)
      .values({
        playlistId: playlist.id,
        songId: seededSongs[1].id,
        position: 1,
        addedAt: new Date(Date.now() - 2000)
      })
      .returning();

    const [entry2] = await db
      .insert(playlistEntries)
      .values({
        playlistId: playlist.id,
        songId: seededSongs[2].id,
        position: 2,
        addedAt: new Date(Date.now() - 1000)
      })
      .returning();

    // 1. Default customOrder
    const catalog = await repository.getPlaylistSongCatalog(playlist.id, {
      sortType: 'customOrder'
    });

    expect(catalog.total).toBe(3);
    expect(catalog.totalDuration).toBe(600); // 100 + 200 + 300
    expect(catalog.entries).toHaveLength(3);
    expect(catalog.entries[0]).toEqual({
      entryId: entry0.id,
      songId: seededSongs[0].id
    });
    expect(catalog.entries[1]).toEqual({
      entryId: entry1.id,
      songId: seededSongs[1].id
    });
    expect(catalog.entries[2]).toEqual({
      entryId: entry2.id,
      songId: seededSongs[2].id
    });
    expect(catalog.languages).toEqual(['English', 'French', 'Spanish']);

    // Check alphabetMap on aToZ
    const aToZCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
      sortType: 'aToZ'
    });
    expect(aToZCatalog.alphabetMap).toHaveProperty('A', 0);
    expect(aToZCatalog.alphabetMap).toHaveProperty('B', 1);
    expect(aToZCatalog.alphabetMap).toHaveProperty('G', 2);

    // 2. Filter by language
    const spanishCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
      language: 'Spanish'
    });
    expect(spanishCatalog.total).toBe(1);
    expect(spanishCatalog.entries[0].songId).toBe(seededSongs[1].id);
    expect(spanishCatalog.languages).toEqual(['English', 'French', 'Spanish']); // distinct across whole playlist

    // 3. Keyword search
    const searchCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
      keyword: 'Gamma'
    });
    expect(searchCatalog.total).toBe(1);
    expect(searchCatalog.entries[0].songId).toBe(seededSongs[2].id);

    // 4. Sort zToA
    const zToACatalog = await repository.getPlaylistSongCatalog(playlist.id, {
      sortType: 'zToA'
    });
    expect(zToACatalog.entries.map((e) => e.songId)).toEqual([
      seededSongs[2].id,
      seededSongs[1].id,
      seededSongs[0].id
    ]);
  });
});
