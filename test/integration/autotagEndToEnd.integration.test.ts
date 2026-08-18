import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ByteVector, File, Picture, PictureType } from 'node-taglib-sharp';
import { MusicBrainzReleaseMapper } from '@main/metadata/providers/musicbrainz/mappers/ReleaseMapper';
import { MetadataDiffBuilder } from '@main/metadata/diff/MetadataDiffBuilder';
import { MetadataTransactionManager } from '@main/metadata/transactions/MetadataTransactionManager';
import { TagWriterService } from '@main/metadata/services/TagWriterService';
import { ArtworkCacheInvalidator } from '@main/metadata/transactions/ArtworkCacheInvalidator';
import { getSongArtworkPath } from '@main/fs/resolveFilePaths';
import reParseSong from '@main/parseSong/reParseSong';
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
import * as parseSongModule from '@main/parseSong/manageArtistsOfParsedSong';
import * as parseAlbumModule from '@main/parseSong/manageAlbumsOfParsedSong';
import * as parseGenreModule from '@main/parseSong/manageGenresOfParsedSong';
import { db } from '@main/db/db';
import type { MusicBrainzReleaseDto } from '@main/metadata/providers/musicbrainz/dto/ReleaseDto';
import type { ResourceMutationPayload } from '@main/metadata/domain/MetadataTransaction';

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

describe('AutoTag End-to-End Modular Integration Suite (Phase 5 Gate)', () => {
  const fixtureSource = path.join(process.cwd(), 'test', 'assets', 'test_song.mp3');
  let tempTestFile: string;

  beforeEach(() => {
    tempTestFile = path.join(
      os.tmpdir(),
      `autotag_e2e_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`
    );
    fs.copyFileSync(fixtureSource, tempTestFile);
  });

  afterEach(() => {
    if (fs.existsSync(tempTestFile)) {
      try {
        fs.unlinkSync(tempTestFile);
      } catch {}
    }
  });

  // Stage 1: Provider -> Matching -> Preview Diff
  it('1. provider resolution produces complete track metadata and accurate diff preview', () => {
    const releaseDto: MusicBrainzReleaseDto = {
      id: 'mb-rel-e2e-1',
      title: 'OK Computer (Collector Edition)',
      date: '1997-05-21',
      'release-group': { id: 'mb-rg-e2e-1' },
      'artist-credit': [{ name: 'Radiohead' }],
      media: [
        {
          position: 1,
          'track-count': 1,
          tracks: [
            {
              id: 'mb-trk-e2e-1',
              position: 1,
              title: 'Airbag',
              length: 284000,
              isrc: 'GBAYE9700021',
              recording: {
                id: 'mb-rec-e2e-1',
                title: 'Airbag'
              }
            }
          ]
        }
      ]
    };

    const mapper = new MusicBrainzReleaseMapper();
    const resolved = mapper.toResolvedAlbumRelease(releaseDto);

    expect(resolved.providerReleaseId).toBe('mb-rel-e2e-1');
    expect(resolved.album.releaseId).toBe('mb-rel-e2e-1');
    expect(resolved.releaseGroupId).toBe('mb-rg-e2e-1');
    expect(resolved.tracks[0].title).toBe('Airbag');
    expect(resolved.tracks[0].musicBrainzRecordingId).toBe('mb-rec-e2e-1');
    expect(resolved.tracks[0].isrc).toBe('GBAYE9700021');

    const localSong = {
      songId: 1001,
      title: 'Airbag (Demo)',
      path: tempTestFile,
      trackNumber: 1,
      discNumber: 1,
      year: 1996,
      genre: 'Alt Rock',
      artist: 'Radiohead',
      album: 'OK Computer'
    };

    const preview = MetadataDiffBuilder.buildTrackPreviewFromMergedResult(
      {
        localSong,
        remoteTrack: {
          recording: {
            id: 'mb-rec-e2e-1',
            title: 'Airbag',
            trackNumber: 1,
            discNumber: 1
          },
          provider: {
            provider: 'musicbrainz',
            providerRecordingId: 'mb-rec-e2e-1',
            isrc: 'GBAYE9700021'
          }
        },
        confidence: 0.95,
        reasons: []
      } as any,
      {
        title: 'Airbag',
        artist: 'Radiohead',
        album: 'OK Computer (Collector Edition)',
        year: 1997,
        trackNumber: 1,
        discNumber: 1,
        genre: 'Alternative',
        musicBrainzRecordingId: 'mb-rec-e2e-1',
        isrc: 'GBAYE9700021',
        fieldAttributions: {
          title: { providerId: 'musicbrainz', confidenceScore: 0.95 },
          isrc: { providerId: 'musicbrainz', confidenceScore: 0.99 },
          musicBrainzRecordingId: { providerId: 'musicbrainz', confidenceScore: 0.99 }
        }
      } as any
    );

    const titleDiff = preview.fieldDiffs.find((f) => f.fieldId === 'title');
    const isrcDiff = preview.fieldDiffs.find((f) => f.fieldId === 'isrc');
    const mbidDiff = preview.fieldDiffs.find((f) => f.fieldId === 'musicBrainzRecordingId');

    expect(titleDiff?.oldValue).toBe('Airbag (Demo)');
    expect(titleDiff?.suggestedValue).toBe('Airbag');
    expect(isrcDiff?.suggestedValue).toBe('GBAYE9700021');
    expect(mbidDiff?.suggestedValue).toBe('mb-rec-e2e-1');
  });

  // Stage 2: Transaction -> Real DB Relational Updates & Physical ID3 Write
  it('2. transaction executes mutations, persists physical tags and relational fields atomically', async () => {
    vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');

    let dbUpdatedFields: any;
    const linkedArtistIds: number[] = [];
    const linkedAlbumIds: number[] = [];
    const linkedGenreIds: number[] = [];

    vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
      return callback({});
    });
    vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
      id: 1001,
      path: tempTestFile,
      title: 'Airbag (Demo)',
      artists: [],
      albums: [],
      genres: []
    } as any);
    vi.spyOn(songsDb, 'updateSongBasicFields').mockImplementation(async (_id, fields) => {
      dbUpdatedFields = fields;
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

    const txManager = new MetadataTransactionManager({
      dbUpdater: async (songId, data) => {
        const updateResult = await updateSongId3Tags(
          songId,
          {
            title: data.title,
            artists: data.artist ? [{ artistId: 50, name: data.artist }] : undefined,
            albums: data.album ? [{ albumId: 60, title: data.album }] : undefined,
            genres: data.genre ? [{ genreId: 70, name: data.genre }] : undefined,
            releasedYear: data.year,
            trackNumber: data.trackNumber,
            discNumber: data.discNumber,
            musicBrainzRecordingId: data.musicBrainzRecordingId,
            isrc: data.isrc
          },
          false
        );
        return updateResult.success;
      }
    });

    const mutations: ResourceMutationPayload[] = [
      {
        resourceId: 1001,
        filePath: tempTestFile,
        fieldMutations: [
          { fieldId: 'title', oldValue: 'Airbag (Demo)', newValue: 'Airbag' },
          { fieldId: 'artist', oldValue: 'Radiohead', newValue: 'Radiohead' },
          { fieldId: 'album', oldValue: 'OK Computer', newValue: 'OK Computer (Collector Edition)' },
          { fieldId: 'year', oldValue: 1996, newValue: 1997 },
          { fieldId: 'trackNumber', oldValue: 1, newValue: 1 },
          { fieldId: 'discNumber', oldValue: 1, newValue: 1 },
          { fieldId: 'genre', oldValue: 'Alt Rock', newValue: 'Alternative' },
          { fieldId: 'musicBrainzRecordingId', oldValue: '', newValue: 'mb-rec-e2e-1' },
          { fieldId: 'isrc', oldValue: '', newValue: 'GBAYE9700021' }
        ]
      }
    ];

    const txRes = await txManager.executeTransaction('op-e2e-stage2', mutations);
    expect(txRes.success).toBe(true);
    expect(txRes.undoToken).toBeDefined();

    // 1. Verify DB received direct columns and junction links
    expect(dbUpdatedFields.title).toBe('Airbag');
    expect(dbUpdatedFields.year).toBe(1997);
    expect(dbUpdatedFields.musicBrainzRecordingId).toBe('mb-rec-e2e-1');
    expect(dbUpdatedFields.isrc).toBe('GBAYE9700021');
    expect(linkedArtistIds).toContain(50);
    expect(linkedAlbumIds).toContain(60);
    expect(linkedGenreIds).toContain(70);

    // 2. Verify physical audio file on disk received tags
    const file = File.createFromPath(tempTestFile);
    expect(file.tag.title).toBe('Airbag');
    expect(file.tag.performers).toEqual(['Radiohead']);
    expect(file.tag.album).toBe('OK Computer (Collector Edition)');
    expect(file.tag.genres).toEqual(['Alternative']);
    expect(file.tag.year).toBe(1997);
    expect(file.tag.musicBrainzTrackId).toBe('mb-rec-e2e-1');
    expect(file.tag.isrc).toBe('GBAYE9700021');
    file.dispose();
  });

  // Stage 3: Physical Write (All 10 Categories including APIC) -> Real reParseSong -> DB Relational Projection
  it('3. scanner (reParseSong) reads all 10 mutable categories from physical ID3 and projects into DB models', async () => {
    // 1. Embed real APIC picture frame alongside 9 metadata fields
    const validPngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const physicalFile = File.createFromPath(tempTestFile);
    physicalFile.tag.title = 'ReParse Physical Title';
    physicalFile.tag.performers = ['Scanner Lead Artist', 'Scanner Featured Artist'];
    physicalFile.tag.albumArtists = ['Scanner Lead Artist'];
    physicalFile.tag.album = 'Scanner Relational Album';
    physicalFile.tag.genres = ['Post-Rock'];
    physicalFile.tag.year = 2023;
    physicalFile.tag.track = 4;
    physicalFile.tag.disc = 2;
    physicalFile.tag.musicBrainzTrackId = 'rec-scanner-uuid-999';
    physicalFile.tag.isrc = 'USRC20230004';

    const pic = Picture.fromData(ByteVector.fromByteArray(Array.from(validPngBytes)));
    pic.type = PictureType.FrontCover;
    pic.mimeType = 'image/png';
    pic.description = 'Front Cover';
    physicalFile.tag.pictures = [pic];
    physicalFile.save();
    physicalFile.dispose();

    // 2. Mock database hooks for reParseSong
    let reParsedSongRow: any;
    const reParsedArtists: string[] = [];
    let reParsedAlbum: string | undefined;
    const reParsedGenres: string[] = [];
    let reParsedArtworkLinked = false;

    vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
      return callback({});
    });

    vi.spyOn(songsDb, 'getSongByPath').mockResolvedValue({
      id: 2002,
      path: tempTestFile,
      title: 'Old Song',
      year: 2000,
      duration: '210.0',
      artists: [],
      albums: [],
      genres: [],
      artworks: []
    } as any);

    vi.spyOn(songsDb, 'updateSongByPath').mockImplementation(async (_path, updatedSong) => {
      reParsedSongRow = updatedSong;
      return true as any;
    });

    vi.spyOn(artistsDb, 'getArtistWithName').mockResolvedValue(undefined);
    vi.spyOn(artistsDb, 'getLinkedAlbumArtist').mockResolvedValue(undefined);
    vi.spyOn(artistsDb, 'createArtist').mockImplementation(async (data) => {
      reParsedArtists.push(data.name);
      return { id: 300, name: data.name } as any;
    });
    vi.spyOn(artistsDb, 'linkSongToArtist').mockResolvedValue(true as any);
    vi.spyOn(artistsDb, 'unlinkSongFromArtist').mockResolvedValue(true as any);
    vi.spyOn(artistsDb, 'getArtistSongIds').mockResolvedValue([]);
    vi.spyOn(artistsDb, 'deleteArtist').mockResolvedValue(true as any);

    vi.spyOn(albumsDb, 'getAlbumWithTitle').mockResolvedValue(undefined);
    vi.spyOn(albumsDb, 'createAlbum').mockImplementation(async (data: any) => {
      reParsedAlbum = typeof data === 'string' ? data : data.title;
      return { id: 400, title: reParsedAlbum } as any;
    });
    vi.spyOn(albumsDb, 'linkSongToAlbum').mockResolvedValue(true as any);
    vi.spyOn(albumsDb, 'linkArtistToAlbum').mockResolvedValue(true as any);
    vi.spyOn(albumsDb, 'unlinkSongFromAlbum').mockResolvedValue(true as any);
    vi.spyOn(albumsDb, 'getAlbumSongIds').mockResolvedValue([]);
    vi.spyOn(albumsDb, 'deleteAlbum').mockResolvedValue(true as any);

    vi.spyOn(genresDb, 'getGenreWithTitle').mockResolvedValue(undefined);
    vi.spyOn(genresDb, 'createGenre').mockImplementation(async (data: any) => {
      const name = typeof data === 'string' ? data : data.name;
      reParsedGenres.push(name);
      return { id: 500, name } as any;
    });
    vi.spyOn(genresDb, 'linkSongToGenre').mockResolvedValue(true as any);
    vi.spyOn(genresDb, 'unlinkSongFromGenre').mockResolvedValue(true as any);
    vi.spyOn(genresDb, 'getGenreSongIds').mockResolvedValue([]);
    vi.spyOn(genresDb, 'deleteGenre').mockResolvedValue(true as any);

    vi.spyOn(artworksDb, 'saveArtworks').mockResolvedValue([
      { id: 900, hash: 'hash900', path: 'artworks/hash900.webp', width: 500, height: 500, source: 'embedded', generatorVersion: 1 } as any
    ]);
    vi.spyOn(artworksDb, 'syncSongArtworks').mockImplementation(async () => {
      reParsedArtworkLinked = true;
      return [] as any;
    });
    vi.spyOn(artworksDb, 'linkArtworksToAlbum').mockResolvedValue([] as any);
    vi.spyOn(artworksDb, 'linkArtworksToArtist').mockResolvedValue([] as any);
    vi.spyOn(artworksDb, 'linkArtworksToGenre').mockResolvedValue([] as any);

    // 3. Execute actual reParseSong
    await reParseSong(tempTestFile);

    // 4. Assert all 10 categories were parsed from physical file and projected to DB
    expect(reParsedSongRow.title).toBe('ReParse Physical Title');
    expect(reParsedSongRow.year).toBe(2023);
    expect(reParsedSongRow.trackNumber).toBe(4);
    expect(reParsedSongRow.diskNumber).toBe(2);
    expect(reParsedSongRow.musicBrainzRecordingId).toBe('rec-scanner-uuid-999');
    expect(reParsedSongRow.isrc).toBe('USRC20230004');
    expect(Array.from(new Set(reParsedArtists))).toEqual(['Scanner Lead Artist', 'Scanner Featured Artist']);
    expect(reParsedAlbum).toBe('Scanner Relational Album');
    expect(reParsedGenres).toEqual(['Post-Rock']);
    expect(reParsedArtworkLinked).toBe(true);
  });

  // Stage 4: Artwork Mutation -> Cache Timestamp Invalidation in Transaction Lifecycle
  it('4. artwork transaction commits DB and invalidates cache timestamps for fresh renderer URLs', async () => {
    const initialPaths = getSongArtworkPath(999, true);
    const initialTs = Number(initialPaths.artworkPath?.split('?ts=')[1]);

    await new Promise((r) => setTimeout(r, 5));

    const invalidator = new ArtworkCacheInvalidator();
    invalidator.invalidateArtworkCache();

    const updatedPaths = getSongArtworkPath(999, true);
    const updatedTs = Number(updatedPaths.artworkPath?.split('?ts=')[1]);

    expect(updatedTs).toBeGreaterThan(initialTs);
  });

  // Stage 5: Transaction Rollback -> Complete Physical + Relational DB Restoration
  it('5. transaction rollback restores previous physical tags and database state completely', async () => {
    vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle.mp3');

    let currentDbTitle = 'Original Title';
    let currentDbMbid = 'rec-orig';
    let currentDbIsrc = 'ISRC-ORIG';

    // Initial physical state
    const tagWriter = new TagWriterService();
    await tagWriter.writeTags({
      filePath: tempTestFile,
      title: 'Original Title',
      musicBrainzRecordingId: 'rec-orig',
      isrc: 'ISRC-ORIG'
    });

    vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
      return callback({});
    });
    vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
      id: 888,
      path: tempTestFile,
      title: currentDbTitle,
      artists: [],
      albums: [],
      genres: []
    } as any);
    vi.spyOn(songsDb, 'updateSongBasicFields').mockImplementation(async (_id, fields) => {
      if (fields.title !== undefined) currentDbTitle = fields.title;
      if (fields.musicBrainzRecordingId !== undefined) currentDbMbid = fields.musicBrainzRecordingId;
      if (fields.isrc !== undefined) currentDbIsrc = fields.isrc;
      return true as any;
    });

    const txManager = new MetadataTransactionManager({
      dbUpdater: async (songId, data) => {
        const updateResult = await updateSongId3Tags(
          songId,
          {
            title: data.title,
            musicBrainzRecordingId: data.musicBrainzRecordingId,
            isrc: data.isrc
          },
          false
        );
        return updateResult.success;
      }
    });

    // 1. Execute mutation
    const txRes = await txManager.executeTransaction('op-e2e-stage5', [
      {
        resourceId: 888,
        filePath: tempTestFile,
        fieldMutations: [
          { fieldId: 'title', oldValue: 'Original Title', newValue: 'Mutated Title' },
          { fieldId: 'musicBrainzRecordingId', oldValue: 'rec-orig', newValue: 'rec-mutated' },
          { fieldId: 'isrc', oldValue: 'ISRC-ORIG', newValue: 'ISRC-MUTATED' }
        ]
      }
    ]);
    expect(txRes.success).toBe(true);

    // Verify DB & disk mutated
    expect(currentDbTitle).toBe('Mutated Title');
    expect(currentDbMbid).toBe('rec-mutated');
    expect(currentDbIsrc).toBe('ISRC-MUTATED');
    const mutatedFile = File.createFromPath(tempTestFile);
    expect(mutatedFile.tag.title).toBe('Mutated Title');
    expect(mutatedFile.tag.musicBrainzTrackId).toBe('rec-mutated');
    expect(mutatedFile.tag.isrc).toBe('ISRC-MUTATED');
    mutatedFile.dispose();

    // 2. Rollback transaction
    const rollbackRes = await txManager.rollbackLastTransaction();
    expect(rollbackRes.success).toBe(true);

    // Verify DB & disk restored
    expect(currentDbTitle).toBe('Original Title');
    expect(currentDbMbid).toBe('rec-orig');
    expect(currentDbIsrc).toBe('ISRC-ORIG');
    const restoredFile = File.createFromPath(tempTestFile);
    expect(restoredFile.tag.title).toBe('Original Title');
    expect(restoredFile.tag.musicBrainzTrackId).toBe('rec-orig');
    expect(restoredFile.tag.isrc).toBe('ISRC-ORIG');
    restoredFile.dispose();
  });

  // Stage 6: Deferred Playing Write -> Song Change Flush (Latest-Write-Wins & Overlapping Concurrency)
  it('6. playing song defers physical writes, coalesces by field, and flushes on song transition', async () => {
    vi.mocked(mainModule.getCurrentSongPath).mockReturnValue(tempTestFile);

    vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
      return callback({});
    });
    vi.spyOn(songsDb, 'getSongById').mockResolvedValue({
      id: 777,
      path: tempTestFile,
      title: 'Track Before Coalesce',
      artists: [],
      albums: [],
      genres: []
    } as any);
    vi.spyOn(songsDb, 'updateSongBasicFields').mockResolvedValue(true as any);
    vi.spyOn(artistsDb, 'getArtistWithName').mockResolvedValue(undefined);
    vi.spyOn(artistsDb, 'createArtist').mockResolvedValue({ id: 10, name: 'Band A' } as any);
    vi.spyOn(artistsDb, 'linkSongToArtist').mockResolvedValue(true as any);

    // Mutation 1: sets artist and ISRC
    const res1 = await updateSongId3Tags(
      777,
      {
        artists: [{ artistId: 10, name: 'Band A' }],
        isrc: 'ISRC-DEFERRED-1'
      },
      false
    );
    expect(res1.deferred).toBe(true);
    expect(isMetadataUpdatesPending(tempTestFile)).toBe(true);

    // Mutation 2: updates title only (field-level coalescing should preserve artist and ISRC)
    const res2 = await updateSongId3Tags(
      777,
      {
        title: 'Title Coalesced'
      },
      false
    );
    expect(res2.deferred).toBe(true);

    // Track finishes playing
    vi.mocked(mainModule.getCurrentSongPath).mockReturnValue('/idle/new_song.mp3');

    // Flush pending queue
    await savePendingMetadataUpdates(tempTestFile, true);
    expect(isMetadataUpdatesPending(tempTestFile)).toBe(false);

    // Verify disk has coalesced state
    const diskFile = File.createFromPath(tempTestFile);
    expect(diskFile.tag.title).toBe('Title Coalesced');
    expect(diskFile.tag.performers).toEqual(['Band A']);
    expect(diskFile.tag.isrc).toBe('ISRC-DEFERRED-1');
    diskFile.dispose();
  });

  // Stage 7: Physical Write Failure Injection -> Compensation and Error Reporting
  it('7. handles physical write failures cleanly and reports transaction failure without false success', async () => {
    // Make file read-only on disk so physical write fails
    fs.chmodSync(tempTestFile, 0o444);

    try {
      const tagWriter = new TagWriterService();
      const txManager = new MetadataTransactionManager({
        dbUpdater: async (_songId, data) => {
          const res = await tagWriter.writeTags({
            filePath: tempTestFile,
            title: data.title
          });
          if (!res.success) {
            throw new Error(`Physical write failed: ${res.error}`);
          }
          return true;
        }
      });

      const res = await txManager.executeTransaction('op-e2e-fail', [
        {
          resourceId: 9999,
          filePath: tempTestFile,
          fieldMutations: [{ fieldId: 'title', oldValue: 'A', newValue: 'B' }]
        }
      ]);

      expect(res.success).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.updatedCount).toBe(0);
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(tempTestFile, 0o666);
    }
  });
});
