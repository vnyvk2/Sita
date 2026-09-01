import { db } from '@main/db/db';
import {
  artists,
  artistsSongs,
  albums,
  albumsSongs,
  artworks,
  artworksSongs,
  metadataOverrides,
  songs
} from '@main/db/schema';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getFlatSongsByIds } from '@main/db/queries/songs';

describe('getFlatSongsByIds Flat SQL Projection Query', () => {
  let song1Id: number;
  let song2Id: number;
  let song3Id: number;
  let artist1Id: number;
  let album1Id: number;
  let artwork1Id: number;
  let artwork2Id: number;

  beforeEach(async () => {
    const now = new Date();
    const runId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Insert Artist
    const insertedArtist = await db
      .insert(artists)
      .values({ name: `Flat Artist ${runId}`, isFavorite: false })
      .returning({ id: artists.id });
    artist1Id = insertedArtist[0].id;

    // 2. Insert Album
    const insertedAlbum = await db
      .insert(albums)
      .values({ title: `Flat Album ${runId}`, year: 2023, isFavorite: true })
      .returning({ id: albums.id });
    album1Id = insertedAlbum[0].id;

    // 3. Insert Artworks (one standard, one optimized)
    const insertedArtworks = await db
      .insert(artworks)
      .values([
        {
          path: `artworks/song1_full_${runId}.webp`,
          hash: `hash1_full_${runId}`,
          isOptimized: false,
          width: 500,
          height: 500
        },
        {
          path: `artworks/song1_opt_${runId}.webp`,
          hash: `hash1_opt_${runId}`,
          isOptimized: true,
          width: 150,
          height: 150
        }
      ])
      .returning({ id: artworks.id });
    artwork1Id = insertedArtworks[0].id;
    artwork2Id = insertedArtworks[1].id;

    // 4. Insert Songs
    const insertedSongs = await db
      .insert(songs)
      .values([
        {
          title: 'Flat Song 1',
          path: `C:\\music\\song1_${runId}.mp3`,
          duration: 215.5,
          year: 2023,
          trackNumber: 1,
          diskNumber: 1,
          bitRate: 320,
          sampleRate: 44100,
          noOfChannels: 2,
          language: 'en',
          musicBrainzRecordingId: 'mb-rec-12345',
          isFavorite: true,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Flat Song 2',
          path: `C:\\music\\song2_${runId}.mp3`,
          duration: 180.0,
          year: 2021,
          trackNumber: 2,
          diskNumber: 1,
          bitRate: 256,
          sampleRate: 44100,
          noOfChannels: 2,
          language: 'ja',
          isFavorite: false,
          isBlacklisted: true,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Flat Song 3 (Overridden Lang)',
          path: `C:\\music\\song3_${runId}.mp3`,
          duration: 300.0,
          year: 2020,
          trackNumber: 5,
          language: 'de',
          isFavorite: false,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        }
      ])
      .returning({ id: songs.id });

    song1Id = insertedSongs[0].id;
    song2Id = insertedSongs[1].id;
    song3Id = insertedSongs[2].id;

    // 5. Link Junctions
    await db.insert(artistsSongs).values([
      { artistId: artist1Id, songId: song1Id },
      { artistId: artist1Id, songId: song2Id }
    ]);

    await db.insert(albumsSongs).values([{ albumId: album1Id, songId: song1Id }]);

    await db.insert(artworksSongs).values([
      { artworkId: artwork1Id, songId: song1Id },
      { artworkId: artwork2Id, songId: song1Id }
    ]);

    // 6. Metadata Override for Song 3
    await db.insert(metadataOverrides).values({
      entityKind: 'song',
      entityId: String(song3Id),
      fieldId: 'language',
      stringValue: 'es'
    });
  });

  afterEach(async () => {
    if (song3Id) {
      await db.delete(metadataOverrides).where(inArray(metadataOverrides.entityId, [String(song3Id)]));
    }
    const songIds = [song1Id, song2Id, song3Id].filter(Boolean);
    if (songIds.length > 0) {
      await db.delete(artworksSongs).where(inArray(artworksSongs.songId, songIds));
      await db.delete(albumsSongs).where(inArray(albumsSongs.songId, songIds));
      await db.delete(artistsSongs).where(inArray(artistsSongs.songId, songIds));
      await db.delete(songs).where(inArray(songs.id, songIds));
    }
    const artworkIds = [artwork1Id, artwork2Id].filter(Boolean);
    if (artworkIds.length > 0) {
      await db.delete(artworks).where(inArray(artworks.id, artworkIds));
    }
    if (album1Id) {
      await db.delete(albums).where(inArray(albums.id, [album1Id]));
    }
    if (artist1Id) {
      await db.delete(artists).where(inArray(artists.id, [artist1Id]));
    }
  });

  it('fetches flat song projections with complete fields and relations', async () => {
    const results = await getFlatSongsByIds([song1Id, song2Id, song3Id]);

    expect(results).toHaveLength(3);

    const song1 = results.find((s) => s.songId === song1Id)!;
    expect(song1).toBeDefined();
    expect(song1.title).toBe('Flat Song 1');
    expect(song1.duration).toBe(215.5);
    expect(song1.year).toBe(2023);
    expect(song1.trackNo).toBe(1);
    expect(song1.discNo).toBe(1);
    expect(song1.bitrate).toBe(320);
    expect(song1.sampleRate).toBe(44100);
    expect(song1.noOfChannels).toBe(2);
    expect(song1.language).toBe('en');
    expect(song1.musicBrainzId).toBe('mb-rec-12345');
    expect(song1.isAFavorite).toBe(true);
    expect(song1.isBlacklisted).toBe(false);
    expect(song1.artists[0]?.artistId).toBe(artist1Id);
    expect(song1.album?.albumId).toBe(album1Id);
    expect(song1.album?.isAFavorite).toBe(true);
    expect(song1.isArtworkAvailable).toBe(true);
    expect(song1.artworkPaths.isDefaultArtwork).toBe(false);
    expect(song1.artworkPaths.artworkPath).toContain('song1_full');
    expect(song1.artworkPaths.optimizedArtworkPath).toContain('song1_opt');

    const song2 = results.find((s) => s.songId === song2Id)!;
    expect(song2.isBlacklisted).toBe(true);
    expect(song2.isAFavorite).toBe(false);
    expect(song2.artists[0]?.artistId).toBe(artist1Id);
    expect(song2.album).toBeUndefined();

    // Song 3 language override should take precedence over raw column
    const song3 = results.find((s) => s.songId === song3Id)!;
    expect(song3.language).toBe('es');
  });

  it('preserves requested ID order and duplicates when preserveIdOrder is true', async () => {
    const requested = [song3Id, song1Id, song3Id, song2Id];
    const results = await getFlatSongsByIds(requested, true);

    expect(results).toHaveLength(4);
    expect(results.map((s) => s.songId)).toEqual([song3Id, song1Id, song3Id, song2Id]);
  });

  it('returns empty array when given empty list or non-existent IDs', async () => {
    const emptyResult = await getFlatSongsByIds([]);
    expect(emptyResult).toEqual([]);

    const nonExistent = await getFlatSongsByIds([999999, 888888]);
    expect(nonExistent).toEqual([]);
  });

  it('benchmark: executes 200 items in < 25ms after warm-up', async () => {
    // Generate an array of 200 IDs (repeating our test IDs)
    const testIds = Array.from({ length: 200 }, (_, i) => [song1Id, song2Id, song3Id][i % 3]);

    // Warm-up prepared statement cache
    await getFlatSongsByIds(testIds, true);

    const t0 = performance.now();
    const results = await getFlatSongsByIds(testIds, true);
    const duration = performance.now() - t0;

    expect(results).toHaveLength(200);
    expect(duration).toBeLessThan(25);
  });
});
