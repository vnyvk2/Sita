import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { File } from 'node-taglib-sharp';
import updateSongId3Tags, {
  isMetadataUpdatesPending,
  savePendingMetadataUpdates
} from '@main/updateSong/updateSongId3Tags';
import * as mainModule from '@main/main';
import * as songsDb from '@main/db/queries/songs';
import * as artistsDb from '@main/db/queries/artists';
import * as albumsDb from '@main/db/queries/albums';
import * as genresDb from '@main/db/queries/genres';
import * as artworksDb from '@main/db/queries/artworks';
import { db } from '@main/db/db';

vi.mock('@main/main', () => ({
  getCurrentSongPath: vi.fn(),
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn(),
  getSongsOutsideLibraryData: vi.fn().mockReturnValue([]),
  updateSongsOutsideLibraryData: vi.fn()
}));

vi.mock('@main/db/queries/settings', () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    saveLyricsInLrcFilesForSupportedSongs: false
  })
}));

describe('updateSongId3Tags Lifecycle & Concurrency (Phase 5)', () => {
  const fixtureSource = path.join(process.cwd(), 'test', 'assets', 'test_song.mp3');
  let tempSongPath: string;

  beforeEach(() => {
    tempSongPath = path.join(os.tmpdir(), `update_id3_test_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
    fs.copyFileSync(fixtureSource, tempSongPath);
  });

  afterEach(() => {
    if (fs.existsSync(tempSongPath)) {
      try {
        fs.unlinkSync(tempSongPath);
      } catch {}
    }
  });

  describe('5-C: Deferred Writes & Field-Level Coalescing on Playing Song', () => {
    it('defers physical write when song is currently playing, coalesces multiple updates by field, and flushes latest-write-wins', async () => {
      // Mock that tempSongPath is currently playing
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue(tempSongPath);

      // Mock database transaction and query methods
      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        return callback({});
      });
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 1,
        path: tempSongPath,
        title: 'Original Title',
        artists: [],
        albums: [],
        genres: []
      } as any);
      vi.spyOn(songsDb, 'updateSongBasicFields').mockResolvedValue(true as any);
      vi.spyOn(artistsDb, 'getArtistWithName').mockResolvedValue(undefined);
      vi.spyOn(artistsDb, 'createArtist').mockResolvedValue({ id: 10, name: 'Artist Mutation 1' } as any);
      vi.spyOn(artistsDb, 'linkSongToArtist').mockResolvedValue(true as any);

      // 1. First mutation on playing track: updates title and artist
      const result1 = await updateSongId3Tags(
        1,
        {
          title: 'Title Mutation 1',
          artists: [{ artistId: 10, name: 'Artist Mutation 1' }],
          musicBrainzRecordingId: 'rec-mbid-mut-1',
          isrc: 'ISRC-MUT-1'
        },
        false
      );

      expect(result1.success).toBe(true);
      expect(result1.deferred).toBe(true);
      expect(isMetadataUpdatesPending(tempSongPath)).toBe(true);

      // Physical file should NOT have been modified yet (still playing)
      const fileBeforeFlush = File.createFromPath(tempSongPath);
      expect(fileBeforeFlush.tag.title).not.toBe('Title Mutation 1');
      fileBeforeFlush.dispose();

      // 2. Second mutation on same playing track: updates title only (field-level coalescing)
      // It should NOT erase artist, MBID, or ISRC from mutation 1!
      const result2 = await updateSongId3Tags(
        1,
        {
          title: 'Title Mutation 2 (Latest)'
        },
        false
      );

      expect(result2.success).toBe(true);
      expect(result2.deferred).toBe(true);

      // 3. Playback changes (song finishes / next track plays)
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/another/track.mp3');

      // Flush pending queue
      await savePendingMetadataUpdates(tempSongPath, true);

      expect(isMetadataUpdatesPending(tempSongPath)).toBe(false);

      // 4. Verify physical file on disk contains coalesced latest values:
      // - Title: 'Title Mutation 2 (Latest)' (newest value wins)
      // - Artist: 'Artist Mutation 1' (preserved from mutation 1)
      // - MBID: 'rec-mbid-mut-1' (preserved from mutation 1)
      // - ISRC: 'ISRC-MUT-1' (preserved from mutation 1)
      const fileAfterFlush = File.createFromPath(tempSongPath);
      expect(fileAfterFlush.tag.title).toBe('Title Mutation 2 (Latest)');
      expect(fileAfterFlush.tag.performers).toEqual(['Artist Mutation 1']);
      expect(fileAfterFlush.tag.musicBrainzTrackId).toBe('rec-mbid-mut-1');
      expect(fileAfterFlush.tag.isrc).toBe('ISRC-MUT-1');
      fileAfterFlush.dispose();
    });
  });

  describe('5-B: Shared Entity Preservation vs Zero-Reference Cleanup', () => {
    it('preserves shared artist when unlinking from one song if another song still references it', async () => {
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');

      let artistDeleted = false;
      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        return callback({});
      });
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 1,
        path: tempSongPath,
        title: 'Song 1',
        artists: [{ artist: { id: 100, name: 'Shared Band' } }],
        albums: [],
        genres: []
      } as any);
      vi.spyOn(songsDb, 'updateSongBasicFields').mockResolvedValue(true as any);
      vi.spyOn(artistsDb, 'unlinkSongFromArtist').mockResolvedValue(true as any);
      // Mock that Song 2 also references Artist 100
      vi.spyOn(artistsDb, 'getArtistSongIds').mockResolvedValue([2]);
      vi.spyOn(artistsDb, 'deleteArtist').mockImplementation(async () => {
        artistDeleted = true;
        return true as any;
      });

      // Update Song 1 removing Artist 100
      await updateSongId3Tags(
        1,
        {
          title: 'Song 1 Updated',
          artists: []
        },
        false
      );

      // Artist 100 must NOT have been deleted
      expect(artistDeleted).toBe(false);
    });

    it('cleans up zero-reference artist when unlinking last song', async () => {
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');

      let artistDeleted = false;
      let deletedArtistId: number | undefined;

      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        return callback({});
      });
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 1,
        path: tempSongPath,
        title: 'Solo Song',
        artists: [{ artist: { id: 200, name: 'Orphan Artist' } }],
        albums: [],
        genres: []
      } as any);
      vi.spyOn(songsDb, 'updateSongBasicFields').mockResolvedValue(true as any);
      vi.spyOn(artistsDb, 'unlinkSongFromArtist').mockResolvedValue(true as any);
      // Mock that 0 remaining songs reference Artist 200
      vi.spyOn(artistsDb, 'getArtistSongIds').mockResolvedValue([]);
      vi.spyOn(artistsDb, 'deleteArtist').mockImplementation(async (id: number) => {
        artistDeleted = true;
        deletedArtistId = id;
        return true as any;
      });

      // Update removing Artist 200
      await updateSongId3Tags(
        1,
        {
          title: 'Solo Song Updated',
          artists: []
        },
        false
      );

      // Orphaned Artist 200 must be safely deleted
      expect(artistDeleted).toBe(true);
      expect(deletedArtistId).toBe(200);
    });
  });

  describe('5-A: Physical Write & Relational Projection across all 10 Categories', () => {
    it('writes all 10 mutable metadata categories to physical audio file and updates relational tables', async () => {
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');

      let updatedSongFields: any;
      const linkedArtistIds: number[] = [];
      const linkedAlbumIds: number[] = [];
      const linkedGenreIds: number[] = [];

      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        return callback({});
      });
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 50,
        path: tempSongPath,
        title: 'Original Song',
        artists: [],
        albums: [],
        genres: []
      } as any);
      vi.spyOn(songsDb, 'updateSongBasicFields').mockImplementation(async (_id, fields) => {
        updatedSongFields = fields;
        return true as any;
      });
      vi.spyOn(artistsDb, 'linkSongToArtist').mockImplementation(async (artistId) => {
        linkedArtistIds.push(artistId);
        return true as any;
      });

      vi.spyOn(albumsDb, 'linkSongToAlbum').mockImplementation(async (albumId) => {
        linkedAlbumIds.push(albumId);
        return true as any;
      });

      vi.spyOn(genresDb, 'linkSongToGenre').mockImplementation(async (genreId) => {
        linkedGenreIds.push(genreId);
        return true as any;
      });

      // Execute update across all categories
      const result = await updateSongId3Tags(
        50,
        {
          title: 'Full Projection Title',
          artists: [{ artistId: 101, name: 'Primary Artist' }, { artistId: 102, name: 'Featured Artist' }],
          albums: [{ albumId: 201, title: 'Projection Album' }],
          genres: [{ genreId: 301, name: 'Electronic' }],
          releasedYear: 2024,
          trackNumber: 7,
          discNumber: 2,
          musicBrainzRecordingId: 'rec-proj-12345',
          isrc: 'GBAYE2400007'
        },
        false
      );

      expect(result.success).toBe(true);

      // 1. Verify DB received the direct column fields
      expect(updatedSongFields.title).toBe('Full Projection Title');
      expect(updatedSongFields.year).toBe(2024);
      expect(updatedSongFields.trackNumber).toBe(7);
      expect(updatedSongFields.discNumber).toBe(2);
      expect(updatedSongFields.musicBrainzRecordingId).toBe('rec-proj-12345');
      expect(updatedSongFields.isrc).toBe('GBAYE2400007');

      // 2. Verify relational junction entities were projected
      expect(linkedArtistIds).toEqual([101, 102]);
      expect(linkedAlbumIds).toEqual([201]);
      expect(linkedGenreIds).toEqual([301]);

      // 3. Verify physical ID3 tags on disk match the projected metadata
      const fileOnDisk = File.createFromPath(tempSongPath);
      expect(fileOnDisk.tag.title).toBe('Full Projection Title');
      expect(fileOnDisk.tag.performers).toEqual(['Primary Artist', 'Featured Artist']);
      expect(fileOnDisk.tag.album).toBe('Projection Album');
      expect(fileOnDisk.tag.genres).toEqual(['Electronic']);
      expect(fileOnDisk.tag.year).toBe(2024);
      expect(fileOnDisk.tag.track).toBe(7);
      expect(fileOnDisk.tag.disc).toBe(2);
      expect(fileOnDisk.tag.musicBrainzTrackId).toBe('rec-proj-12345');
      expect(fileOnDisk.tag.isrc).toBe('GBAYE2400007');
      fileOnDisk.dispose();
    });
  });

  describe('5-E: Failure & Compensation Semantics', () => {
    it('aborts operation and does not write physical file if DB transaction fails', async () => {
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');

      vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('DB connection lost'));
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 99,
        path: tempSongPath,
        title: 'Original Before Error',
        artists: [],
        albums: [],
        genres: []
      } as any);

      // updateSongId3Tags safely catches the error and reports failure
      const res = await updateSongId3Tags(
        99,
        {
          title: 'Should Not Be Written'
        },
        false
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe('DB connection lost');

      // Physical file must remain unchanged
      const fileOnDisk = File.createFromPath(tempSongPath);
      expect(fileOnDisk.tag.title).not.toBe('Should Not Be Written');
      fileOnDisk.dispose();
    });

    it('handles physical disk write failure cleanly during pending update flush', async () => {
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue(tempSongPath);

      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        return callback({});
      });
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 103,
        path: tempSongPath,
        title: 'Original Song',
        artists: [],
        albums: [],
        genres: []
      } as any);
      vi.spyOn(songsDb, 'updateSongBasicFields').mockResolvedValue(true as any);

      await updateSongId3Tags(
        103,
        {
          title: 'Will Fail On Disk'
        },
        false
      );

      // Make file read-only on disk
      fs.chmodSync(tempSongPath, 0o444);

      try {
        // Attempt flush
        vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');
        await savePendingMetadataUpdates(tempSongPath, true);
      } finally {
        fs.chmodSync(tempSongPath, 0o666);
      }
    });

    it('handles true overlapping same-file concurrent update calls safely with field coalescing', async () => {
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue(tempSongPath);

      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        return callback({});
      });
      vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
        id: 104,
        path: tempSongPath,
        title: 'Concurrent Initial',
        artists: [],
        albums: [],
        genres: []
      } as any);
      vi.spyOn(songsDb, 'updateSongBasicFields').mockResolvedValue(true as any);
      vi.spyOn(artistsDb, 'getArtistWithName').mockResolvedValue(undefined);
      vi.spyOn(artistsDb, 'createArtist').mockResolvedValue({ id: 20, name: 'Concurrent Band' } as any);
      vi.spyOn(artistsDb, 'linkSongToArtist').mockResolvedValue(true as any);

      // Concurrent overlapping mutations via Promise.all
      const [resA, resB] = await Promise.all([
        updateSongId3Tags(
          104,
          {
            title: 'Concurrent Final Title',
            isrc: 'ISRC-CONCURRENT'
          },
          false
        ),
        updateSongId3Tags(
          104,
          {
            artists: [{ artistId: 20, name: 'Concurrent Band' }],
            musicBrainzRecordingId: 'rec-mbid-concurrent'
          },
          false
        )
      ]);

      expect(resA.deferred).toBe(true);
      expect(resB.deferred).toBe(true);
      expect(isMetadataUpdatesPending(tempSongPath)).toBe(true);

      // Switch song and flush
      vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/another.mp3');
      await savePendingMetadataUpdates(tempSongPath, true);

      // Verify merged coherent disk state
      const file = File.createFromPath(tempSongPath);
      expect(file.tag.title).toBe('Concurrent Final Title');
      expect(file.tag.performers).toEqual(['Concurrent Band']);
      expect(file.tag.isrc).toBe('ISRC-CONCURRENT');
      expect(file.tag.musicBrainzTrackId).toBe('rec-mbid-concurrent');
      file.dispose();
    });
  });
});
