import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { db } from '../../../../../src/main/db/db';
import {
  albums,
  albumsSongs,
  artists,
  artistsSongs,
  genres,
  genresSongs,
  playHistory,
  playlistEntries,
  playlists,
  songs
} from '../../../../../src/main/db/schema';
import type { SongSortTypes } from '../../../../../src/renderer/src/components/SongsPage/SongOptions';

describe('PlaylistRepository.getPlaylistSongCatalog', () => {
  const repository = new PlaylistRepository();

  beforeEach(async () => {
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(artistsSongs);
    await db.delete(artists);
    await db.delete(albumsSongs);
    await db.delete(albums);
    await db.delete(genresSongs);
    await db.delete(genres);
    await db.delete(playHistory);
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

    const catalog = await repository.getPlaylistSongCatalog(playlist.id, {
      sortType: 'customOrder'
    });

    expect(catalog.total).toBe(3);
    expect(catalog.totalDuration).toBe(600);
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
  });

  it('handles empty playlist returning zero counts and empty collections', async () => {
    const [playlist] = await db
      .insert(playlists)
      .values({ name: `Empty Playlist ${randomUUID()}` })
      .returning();

    const catalog = await repository.getPlaylistSongCatalog(playlist.id);

    expect(catalog.total).toBe(0);
    expect(catalog.totalDuration).toBe(0);
    expect(catalog.entries).toEqual([]);
    expect(catalog.blacklistedIds).toEqual([]);
    expect(catalog.languages).toEqual([]);
    expect(catalog.alphabetMap).toBeUndefined();
    expect(catalog.letterCounts).toBeUndefined();
  });

  describe('all 10 SQL sort orders + allTimeMostListened', () => {
    it.each([
      { sortType: 'customOrder' as SongSortTypes, expectedOrder: ['B', 'C', 'A'] },
      { sortType: 'originalOrder' as SongSortTypes, expectedOrder: ['A', 'B', 'C'] },
      { sortType: 'aToZ' as SongSortTypes, expectedOrder: ['A', 'B', 'C'] },
      { sortType: 'zToA' as SongSortTypes, expectedOrder: ['C', 'B', 'A'] },
      { sortType: 'dateAddedAscending' as SongSortTypes, expectedOrder: ['A', 'C', 'B'] },
      { sortType: 'dateAddedDescending' as SongSortTypes, expectedOrder: ['B', 'C', 'A'] },
      { sortType: 'releasedYearAscending' as SongSortTypes, expectedOrder: ['B', 'A', 'C'] },
      { sortType: 'releasedYearDescending' as SongSortTypes, expectedOrder: ['C', 'A', 'B'] },
      { sortType: 'artistNameAscending' as SongSortTypes, expectedOrder: ['B', 'C', 'A'] },
      { sortType: 'albumNameAscending' as SongSortTypes, expectedOrder: ['C', 'B', 'A'] },
      { sortType: 'allTimeMostListened' as SongSortTypes, expectedOrder: ['C', 'A', 'B'] }
    ])('sorts correctly with sortType="$sortType"', async ({ sortType, expectedOrder }) => {
      const [playlist] = await db
        .insert(playlists)
        .values({ name: `Sort Playlist ${randomUUID()}` })
        .returning();

      const [artistAdam] = await db.insert(artists).values({ name: 'Adam' }).returning();
      const [artistMaya] = await db.insert(artists).values({ name: 'Maya' }).returning();
      const [artistZoe] = await db.insert(artists).values({ name: 'Zoe' }).returning();

      const [albumAlpha] = await db.insert(albums).values({ title: 'Alpha' }).returning();
      const [albumBravo] = await db.insert(albums).values({ title: 'Bravo' }).returning();
      const [albumCharlie] = await db.insert(albums).values({ title: 'Charlie' }).returning();

      const now = Date.now();
      const [songA] = await db
        .insert(songs)
        .values({
          title: 'Apple',
          duration: 100,
          year: 2010,
          path: `C:\\music\\sort-a-${randomUUID()}.mp3`,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .returning();

      const [songB] = await db
        .insert(songs)
        .values({
          title: 'Banana',
          duration: 120,
          year: 2000,
          path: `C:\\music\\sort-b-${randomUUID()}.mp3`,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .returning();

      const [songC] = await db
        .insert(songs)
        .values({
          title: 'Cherry',
          duration: 140,
          year: 2020,
          path: `C:\\music\\sort-c-${randomUUID()}.mp3`,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .returning();

      // Artists
      await db.insert(artistsSongs).values([
        { songId: songA.id, artistId: artistZoe.id },
        { songId: songB.id, artistId: artistAdam.id },
        { songId: songC.id, artistId: artistMaya.id }
      ]);

      // Albums
      await db.insert(albumsSongs).values([
        { songId: songA.id, albumId: albumCharlie.id },
        { songId: songB.id, albumId: albumBravo.id },
        { songId: songC.id, albumId: albumAlpha.id }
      ]);

      // Play history: C has 10, A has 5, B has 1
      for (let i = 0; i < 5; i++) {
        await db.insert(playHistory).values({ songId: songA.id });
      }
      await db.insert(playHistory).values({ songId: songB.id });
      for (let i = 0; i < 10; i++) {
        await db.insert(playHistory).values({ songId: songC.id });
      }

      // Entries with positions and dates:
      // Entry 0: song A, position 2, addedAt T0 (oldest)
      // Entry 1: song B, position 0, addedAt T2 (newest)
      // Entry 2: song C, position 1, addedAt T1 (middle)
      await db.insert(playlistEntries).values([
        {
          playlistId: playlist.id,
          songId: songA.id,
          position: 2,
          addedAt: new Date(now - 100000)
        },
        {
          playlistId: playlist.id,
          songId: songB.id,
          position: 0,
          addedAt: new Date(now)
        },
        {
          playlistId: playlist.id,
          songId: songC.id,
          position: 1,
          addedAt: new Date(now - 50000)
        }
      ]);

      const keyToId: Record<string, number> = {
        A: songA.id,
        B: songB.id,
        C: songC.id
      };
      const expectedIds = expectedOrder.map((k) => keyToId[k]);

      const catalog = await repository.getPlaylistSongCatalog(playlist.id, {
        sortType
      });

      expect(catalog.entries.map((e) => e.songId)).toEqual(expectedIds);
    });
  });

  describe('status filters', () => {
    it('filters by favorites, nonFavorites, blacklistedSongs, and whitelistedSongs', async () => {
      const [playlist] = await db
        .insert(playlists)
        .values({ name: `Status Playlist ${randomUUID()}` })
        .returning();

      const now = new Date();
      const [favSong, nonFavSong, blacklistedSong, whitelistedSong] = await db
        .insert(songs)
        .values([
          {
            title: 'Fav Song',
            duration: 100,
            isFavorite: true,
            isBlacklisted: false,
            path: `C:\\music\\fav-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Non-Fav Song',
            duration: 100,
            isFavorite: false,
            isBlacklisted: false,
            path: `C:\\music\\nonfav-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Blacklisted Song',
            duration: 100,
            isFavorite: false,
            isBlacklisted: true,
            path: `C:\\music\\bl-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Whitelisted Song',
            duration: 100,
            isFavorite: true,
            isBlacklisted: false,
            path: `C:\\music\\wl-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          }
        ])
        .returning();

      await db.insert(playlistEntries).values([
        { playlistId: playlist.id, songId: favSong.id, position: 0 },
        { playlistId: playlist.id, songId: nonFavSong.id, position: 1 },
        { playlistId: playlist.id, songId: blacklistedSong.id, position: 2 },
        { playlistId: playlist.id, songId: whitelistedSong.id, position: 3 }
      ]);

      // 1. favorites filter
      const favCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        filterType: 'favorites'
      });
      expect(favCatalog.entries.map((e) => e.songId)).toEqual([favSong.id, whitelistedSong.id]);

      // 2. nonFavorites filter
      const nonFavCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        filterType: 'nonFavorites'
      });
      expect(nonFavCatalog.entries.map((e) => e.songId)).toEqual([
        nonFavSong.id,
        blacklistedSong.id
      ]);

      // 3. blacklistedSongs filter
      const blCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        filterType: 'blacklistedSongs'
      });
      expect(blCatalog.entries.map((e) => e.songId)).toEqual([blacklistedSong.id]);
      expect(blCatalog.blacklistedIds).toEqual([blacklistedSong.id]);

      // 4. whitelistedSongs filter
      const wlCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        filterType: 'whitelistedSongs'
      });
      expect(wlCatalog.entries.map((e) => e.songId)).toEqual([
        favSong.id,
        nonFavSong.id,
        whitelistedSong.id
      ]);
    });
  });

  describe('keyword search across title, artist, album, and genre', () => {
    it('matches keyword against song title, artist name, album title, and genre name', async () => {
      const [playlist] = await db
        .insert(playlists)
        .values({ name: `Search Playlist ${randomUUID()}` })
        .returning();

      const [artist] = await db.insert(artists).values({ name: 'Daft Punk' }).returning();
      const [album] = await db.insert(albums).values({ title: 'Discovery' }).returning();
      const [genre] = await db.insert(genres).values({ name: 'Electronic' }).returning();

      const now = new Date();
      const [song1, song2, song3, song4] = await db
        .insert(songs)
        .values([
          {
            title: 'Harder Better Faster Stronger',
            duration: 220,
            path: `C:\\music\\kw1-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'One More Time',
            duration: 320,
            path: `C:\\music\\kw2-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Aerodynamic',
            duration: 210,
            path: `C:\\music\\kw3-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Digital Love',
            duration: 290,
            path: `C:\\music\\kw4-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          }
        ])
        .returning();

      // song2 linked to Daft Punk artist
      await db.insert(artistsSongs).values({ songId: song2.id, artistId: artist.id });
      // song3 linked to Discovery album
      await db.insert(albumsSongs).values({ songId: song3.id, albumId: album.id });
      // song4 linked to Electronic genre
      await db.insert(genresSongs).values({ songId: song4.id, genreId: genre.id });

      await db.insert(playlistEntries).values([
        { playlistId: playlist.id, songId: song1.id, position: 0 },
        { playlistId: playlist.id, songId: song2.id, position: 1 },
        { playlistId: playlist.id, songId: song3.id, position: 2 },
        { playlistId: playlist.id, songId: song4.id, position: 3 }
      ]);

      // Title match
      const titleSearch = await repository.getPlaylistSongCatalog(playlist.id, {
        keyword: 'Harder'
      });
      expect(titleSearch.entries.map((e) => e.songId)).toEqual([song1.id]);

      // Artist match
      const artistSearch = await repository.getPlaylistSongCatalog(playlist.id, {
        keyword: 'Daft Punk'
      });
      expect(artistSearch.entries.map((e) => e.songId)).toEqual([song2.id]);

      // Album match
      const albumSearch = await repository.getPlaylistSongCatalog(playlist.id, {
        keyword: 'Discovery'
      });
      expect(albumSearch.entries.map((e) => e.songId)).toEqual([song3.id]);

      // Genre match
      const genreSearch = await repository.getPlaylistSongCatalog(playlist.id, {
        keyword: 'Electronic'
      });
      expect(genreSearch.entries.map((e) => e.songId)).toEqual([song4.id]);
    });

    it('escapes literal % and _ wildcards in keyword search', async () => {
      const [playlist] = await db
        .insert(playlists)
        .values({ name: `Wildcard Playlist ${randomUUID()}` })
        .returning();

      const now = new Date();
      const [pctSong, normalSong, underscoreSong] = await db
        .insert(songs)
        .values([
          {
            title: '100% Hits',
            duration: 100,
            path: `C:\\music\\pct-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: '1000 Hits',
            duration: 100,
            path: `C:\\music\\norm-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Track_One',
            duration: 100,
            path: `C:\\music\\under-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          }
        ])
        .returning();

      await db.insert(playlistEntries).values([
        { playlistId: playlist.id, songId: pctSong.id, position: 0 },
        { playlistId: playlist.id, songId: normalSong.id, position: 1 },
        { playlistId: playlist.id, songId: underscoreSong.id, position: 2 }
      ]);

      // Searching for literal '%' should ONLY match '100% Hits', NOT '1000 Hits'
      const pctSearch = await repository.getPlaylistSongCatalog(playlist.id, {
        keyword: '100%'
      });
      expect(pctSearch.entries.map((e) => e.songId)).toEqual([pctSong.id]);

      // Searching for literal '_' should ONLY match 'Track_One'
      const underSearch = await repository.getPlaylistSongCatalog(playlist.id, {
        keyword: 'Track_'
      });
      expect(underSearch.entries.map((e) => e.songId)).toEqual([underscoreSong.id]);
    });

    it('deduplicates blacklistedIds when duplicate entries of a blacklisted song exist', async () => {
      const [playlist] = await db
        .insert(playlists)
        .values({ name: `Blacklist Dupe ${randomUUID()}` })
        .returning();

      const now = new Date();
      const [blSong] = await db
        .insert(songs)
        .values({
          title: 'Blacklisted Song',
          duration: 100,
          isBlacklisted: true,
          path: `C:\\music\\bl-dupe-${randomUUID()}.mp3`,
          fileCreatedAt: now,
          fileModifiedAt: now
        })
        .returning();

      // Add same blacklisted song twice to playlist (different entries/positions)
      await db.insert(playlistEntries).values([
        { playlistId: playlist.id, songId: blSong.id, position: 0 },
        { playlistId: playlist.id, songId: blSong.id, position: 1 }
      ]);

      const catalog = await repository.getPlaylistSongCatalog(playlist.id);
      expect(catalog.entries).toHaveLength(2);
      expect(catalog.blacklistedIds).toEqual([blSong.id]); // Must be unique, length 1
    });
  });

  describe('language filter and alphabetMap', () => {
    it('filters by unspecified, specific language, and generates alphabetMap on aToZ/zToA', async () => {
      const [playlist] = await db
        .insert(playlists)
        .values({ name: `Lang Playlist ${randomUUID()}` })
        .returning();

      const now = new Date();
      const [songEn, songJp, songNull] = await db
        .insert(songs)
        .values([
          {
            title: 'English Track',
            duration: 180,
            language: 'English',
            path: `C:\\music\\en-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Japanese Track',
            duration: 200,
            language: 'Japanese',
            path: `C:\\music\\jp-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          },
          {
            title: 'Instrumental',
            duration: 240,
            language: null,
            path: `C:\\music\\inst-${randomUUID()}.mp3`,
            fileCreatedAt: now,
            fileModifiedAt: now
          }
        ])
        .returning();

      await db.insert(playlistEntries).values([
        { playlistId: playlist.id, songId: songEn.id, position: 0 },
        { playlistId: playlist.id, songId: songJp.id, position: 1 },
        { playlistId: playlist.id, songId: songNull.id, position: 2 }
      ]);

      // Specific language
      const jpCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        language: 'Japanese'
      });
      expect(jpCatalog.entries.map((e) => e.songId)).toEqual([songJp.id]);

      // Unspecified language
      const unspecCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        language: 'unspecified'
      });
      expect(unspecCatalog.entries.map((e) => e.songId)).toEqual([songNull.id]);

      // All languages returns all
      const allCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        language: 'all'
      });
      expect(allCatalog.total).toBe(3);

      // Alphabet scrubber map check on aToZ
      const aToZCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        sortType: 'aToZ'
      });
      expect(aToZCatalog.alphabetMap).toBeDefined();
      expect(aToZCatalog.letterCounts).toBeDefined();
      // Alphabetical by title: English Track (E), Instrumental (I), Japanese Track (J)
      expect(aToZCatalog.alphabetMap).toHaveProperty('E', 0);
      expect(aToZCatalog.alphabetMap).toHaveProperty('I', 1);
      expect(aToZCatalog.alphabetMap).toHaveProperty('J', 2);
      expect(aToZCatalog.letterCounts).toEqual({ E: 1, I: 1, J: 1 });

      // Non-alpha sorts must NOT generate alphabetMap
      const customCatalog = await repository.getPlaylistSongCatalog(playlist.id, {
        sortType: 'customOrder'
      });
      expect(customCatalog.alphabetMap).toBeUndefined();
      expect(customCatalog.letterCounts).toBeUndefined();
    });
  });
});
