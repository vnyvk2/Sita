import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '../../../../src/main/db/db';
import {
  songs,
  albums,
  albumsSongs,
  albumsArtworks,
  artworks
} from '../../../../src/main/db/schema';
import { syncSongRelationalData } from '../../../../src/main/parseSong/syncSongRelationalData';
import { getSongById } from '../../../../src/main/db/queries/songs';
import { createAlbum, linkSongToAlbum } from '../../../../src/main/db/queries/albums';
import { saveArtworks } from '../../../../src/main/db/queries/artworks';

describe('syncSongRelationalData — tags.albums contract (D1 / B2)', () => {
  let testSong1Id: number;
  let testSong2Id: number;
  let testAlbumId: number;
  let testArtworkId: number;

  beforeEach(async () => {
    // Clean tables
    await db.delete(albumsArtworks);
    await db.delete(albumsSongs);
    await db.delete(songs);
    await db.delete(albums);
    await db.delete(artworks);

    // Seed 2 songs
    const now = new Date();
    const [s1] = await db
      .insert(songs)
      .values({
        title: 'Track 1',
        duration: 180,
        path: 'C:\\Music\\track1.mp3',
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();
    testSong1Id = s1.id;

    const [s2] = await db
      .insert(songs)
      .values({
        title: 'Track 2',
        duration: 200,
        path: 'C:\\Music\\track2.mp3',
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();
    testSong2Id = s2.id;

    // Seed 1 album
    const album = await createAlbum({ title: 'Test Album' });
    testAlbumId = album.id;

    // Link song1 and song2 to test album
    await linkSongToAlbum(testAlbumId, testSong1Id);
    await linkSongToAlbum(testAlbumId, testSong2Id);

    // Seed 1 artwork and link to test album
    const [art] = await saveArtworks([
      {
        hash: 'testhash123',
        path: 'artworks/testhash123.webp',
        width: 500,
        height: 500,
        isOptimized: false,
        source: 'LOCAL'
      }
    ]);
    testArtworkId = art.id;
    await db.insert(albumsArtworks).values({
      albumId: testAlbumId,
      artworkId: testArtworkId
    });
  });

  it('Contract State 1 (tags.albums === undefined): Partial update preserves album link, album entity, and albums_artworks', async () => {
    const songBefore = await getSongById(testSong1Id);
    expect(songBefore?.albums?.[0]?.album?.id).toBe(testAlbumId);

    // Partial update: only updating song title or artwork, tags.albums is OMITTED (undefined)
    await db.transaction(async (trx) => {
      await syncSongRelationalData({
        songId: testSong1Id,
        song: songBefore!,
        tags: {
          title: 'Track 1 Renamed',
          duration: 180
          // tags.albums is explicitly undefined
        } as any,
        trx
      });
    });

    // 1. Song remains linked to the album
    const songAfter = await getSongById(testSong1Id);
    expect(songAfter?.albums?.[0]?.album?.id).toBe(testAlbumId);

    // 2. Album entity is NOT deleted
    const albumRow = await db.query.albums.findFirst({
      where: eq(albums.id, testAlbumId)
    });
    expect(albumRow).toBeDefined();
    expect(albumRow?.title).toBe('Test Album');

    // 3. Album artwork link still exists
    const albumArtLinks = await db
      .select()
      .from(albumsArtworks)
      .where(eq(albumsArtworks.albumId, testAlbumId));
    expect(albumArtLinks).toHaveLength(1);
    expect(albumArtLinks[0].artworkId).toBe(testArtworkId);
  });

  it('Contract State 2 (tags.albums: [] with other songs remaining): Unlinks song but preserves album entity and remaining songs', async () => {
    const songBefore = await getSongById(testSong1Id);
    expect(songBefore?.albums?.[0]?.album?.id).toBe(testAlbumId);

    // Explicit removal: user cleared album on song 1, but song 2 is still linked to the album
    await db.transaction(async (trx) => {
      await syncSongRelationalData({
        songId: testSong1Id,
        song: songBefore!,
        tags: {
          title: 'Track 1',
          duration: 180,
          albums: [] // explicit empty array
        } as any,
        trx
      });
    });

    // 1. Song 1 is unlinked from the album
    const song1After = await getSongById(testSong1Id);
    expect(song1After?.albums).toHaveLength(0);

    // 2. Song 2 is STILL linked to the album
    const song2After = await getSongById(testSong2Id);
    expect(song2After?.albums?.[0]?.album?.id).toBe(testAlbumId);

    // 3. Album entity is NOT deleted because song 2 remains
    const albumRow = await db.query.albums.findFirst({
      where: eq(albums.id, testAlbumId)
    });
    expect(albumRow).toBeDefined();
    expect(albumRow?.title).toBe('Test Album');

    // 4. Album artwork link is preserved
    const albumArtLinks = await db
      .select()
      .from(albumsArtworks)
      .where(eq(albumsArtworks.albumId, testAlbumId));
    expect(albumArtLinks).toHaveLength(1);
  });

  it('Contract State 3 (tags.albums: [] with sole song on album): Unlinks song and cascade-deletes empty album and albums_artworks', async () => {
    // First, unlink song 2 so song 1 is the sole track on the album
    await db
      .delete(albumsSongs)
      .where(eq(albumsSongs.songId, testSong2Id));

    const songBefore = await getSongById(testSong1Id);
    expect(songBefore?.albums?.[0]?.album?.id).toBe(testAlbumId);

    // Explicit removal on sole song
    await db.transaction(async (trx) => {
      await syncSongRelationalData({
        songId: testSong1Id,
        song: songBefore!,
        tags: {
          title: 'Track 1',
          duration: 180,
          albums: [] // explicit empty array
        } as any,
        trx
      });
    });

    // 1. Song 1 is unlinked
    const song1After = await getSongById(testSong1Id);
    expect(song1After?.albums).toHaveLength(0);

    // 2. Album is deleted from SQLite
    const albumRow = await db.query.albums.findFirst({
      where: eq(albums.id, testAlbumId)
    });
    expect(albumRow).toBeUndefined();

    // 3. albums_artworks row was deleted via SQLite foreign key cascade
    const albumArtLinks = await db
      .select()
      .from(albumsArtworks)
      .where(eq(albumsArtworks.albumId, testAlbumId));
    expect(albumArtLinks).toHaveLength(0);
  });
});
