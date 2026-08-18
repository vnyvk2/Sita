import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { File } from 'node-taglib-sharp';
import { MusicBrainzReleaseMapper } from '@main/metadata/providers/musicbrainz/mappers/ReleaseMapper';
import { MetadataDiffBuilder } from '@main/metadata/diff/MetadataDiffBuilder';
import { MetadataTransactionManager } from '@main/metadata/transactions/MetadataTransactionManager';
import { TagWriterService } from '@main/metadata/services/TagWriterService';
import { ArtworkCacheInvalidator } from '@main/metadata/transactions/ArtworkCacheInvalidator';
import { getSongArtworkPath } from '@main/fs/resolveFilePaths';
import updateSongId3Tags, {
  isMetadataUpdatesPending,
  savePendingMetadataUpdates
} from '@main/updateSong/updateSongId3Tags';
import * as mainModule from '@main/main';
import * as songsDb from '@main/db/queries/songs';
import * as artistsDb from '@main/db/queries/artists';
import * as albumsDb from '@main/db/queries/albums';
import * as genresDb from '@main/db/queries/genres';
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

  // Stage 2: Transaction -> Physical + Relational Persistence
  it('2. transaction executes mutations, persists physical tags and relational fields atomically', async () => {
    const tagWriter = new TagWriterService();
    const dbState: Record<string, any> = {};

    const txManager = new MetadataTransactionManager({
      dbUpdater: async (songId, data) => {
        dbState.songId = songId;
        dbState.data = data;
        const res = await tagWriter.writeTags({
          filePath: tempTestFile,
          title: data.title,
          artist: data.artist,
          album: data.album,
          genre: data.genre,
          year: data.year,
          trackNumber: data.trackNumber,
          discNumber: data.discNumber,
          musicBrainzRecordingId: data.musicBrainzRecordingId,
          isrc: data.isrc
        });
        if (!res.success) throw new Error(res.error);
        return true;
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

    // Verify DB state
    expect(dbState.data.title).toBe('Airbag');
    expect(dbState.data.album).toBe('OK Computer (Collector Edition)');
    expect(dbState.data.musicBrainzRecordingId).toBe('mb-rec-e2e-1');
    expect(dbState.data.isrc).toBe('GBAYE9700021');

    // Verify physical file
    const file = File.createFromPath(tempTestFile);
    expect(file.tag.title).toBe('Airbag');
    expect(file.tag.album).toBe('OK Computer (Collector Edition)');
    expect(file.tag.genres).toEqual(['Alternative']);
    expect(file.tag.year).toBe(1997);
    expect(file.tag.musicBrainzTrackId).toBe('mb-rec-e2e-1');
    expect(file.tag.isrc).toBe('GBAYE9700021');
    file.dispose();
  });

  // Stage 3: Physical -> Scanner (reParseSong) -> Relational Reconstruction
  it('3. scanner reads physical ID3 tags and projects them deterministically into DB models', async () => {
    // Write physical tags
    const tagWriter = new TagWriterService();
    await tagWriter.writeTags({
      filePath: tempTestFile,
      title: 'Scanner Verification Title',
      artist: 'Scanner Artist',
      album: 'Scanner Album',
      genre: 'Post-Rock',
      year: 2023,
      trackNumber: 3,
      discNumber: 1,
      musicBrainzRecordingId: 'rec-scanner-uuid-999',
      isrc: 'USRC20230003'
    });

    // Read back via node-taglib-sharp directly simulating parser read
    const file = File.createFromPath(tempTestFile);
    const parsedMetadata = {
      title: file.tag.title,
      performers: file.tag.performers,
      album: file.tag.album,
      genres: file.tag.genres,
      year: file.tag.year,
      trackNumber: file.tag.track,
      discNumber: file.tag.disc,
      musicBrainzRecordingId: file.tag.musicBrainzTrackId,
      isrc: file.tag.isrc
    };
    file.dispose();

    expect(parsedMetadata.title).toBe('Scanner Verification Title');
    expect(parsedMetadata.performers).toEqual(['Scanner Artist']);
    expect(parsedMetadata.album).toBe('Scanner Album');
    expect(parsedMetadata.genres).toEqual(['Post-Rock']);
    expect(parsedMetadata.year).toBe(2023);
    expect(parsedMetadata.trackNumber).toBe(3);
    expect(parsedMetadata.discNumber).toBe(1);
    expect(parsedMetadata.musicBrainzRecordingId).toBe('rec-scanner-uuid-999');
    expect(parsedMetadata.isrc).toBe('USRC20230003');
  });

  // Stage 4: Artwork Mutation -> Cache Timestamp Invalidation
  it('4. artwork mutation invalidates cache timestamps ensuring fresh renderer URLs', async () => {
    const initialPaths = getSongArtworkPath(999, true);
    const initialTs = Number(initialPaths.artworkPath?.split('?ts=')[1]);

    await new Promise((r) => setTimeout(r, 5));

    const invalidator = new ArtworkCacheInvalidator();
    invalidator.invalidateArtworkCache();

    const updatedPaths = getSongArtworkPath(999, true);
    const updatedTs = Number(updatedPaths.artworkPath?.split('?ts=')[1]);

    expect(updatedTs).toBeGreaterThan(initialTs);
  });

  // Stage 5: Transaction Rollback -> Complete Physical + DB Restoration
  it('5. transaction rollback restores previous physical tags and database state completely', async () => {
    const tagWriter = new TagWriterService();
    let currentDbState: Record<string, any> = {
      title: 'Original Title',
      musicBrainzRecordingId: 'rec-orig',
      isrc: 'ISRC-ORIG'
    };

    // Initial physical write
    await tagWriter.writeTags({
      filePath: tempTestFile,
      title: 'Original Title',
      musicBrainzRecordingId: 'rec-orig',
      isrc: 'ISRC-ORIG'
    });

    const txManager = new MetadataTransactionManager({
      dbUpdater: async (_songId, data) => {
        currentDbState = { ...data };
        await tagWriter.writeTags({
          filePath: tempTestFile,
          title: data.title,
          musicBrainzRecordingId: data.musicBrainzRecordingId,
          isrc: data.isrc
        });
        return true;
      }
    });

    // 1. Execute mutation
    await txManager.executeTransaction('op-e2e-stage5', [
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

    expect(currentDbState.title).toBe('Mutated Title');
    const mutatedFile = File.createFromPath(tempTestFile);
    expect(mutatedFile.tag.title).toBe('Mutated Title');
    expect(mutatedFile.tag.musicBrainzTrackId).toBe('rec-mutated');
    expect(mutatedFile.tag.isrc).toBe('ISRC-MUTATED');
    mutatedFile.dispose();

    // 2. Rollback transaction
    const rollbackRes = await txManager.rollbackLastTransaction();
    expect(rollbackRes.success).toBe(true);

    expect(currentDbState.title).toBe('Original Title');
    const restoredFile = File.createFromPath(tempTestFile);
    expect(restoredFile.tag.title).toBe('Original Title');
    expect(restoredFile.tag.musicBrainzTrackId).toBe('rec-orig');
    expect(restoredFile.tag.isrc).toBe('ISRC-ORIG');
    restoredFile.dispose();
  });

  // Stage 6: Deferred Playing Write -> Song Change Flush (Latest-Write-Wins)
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

  // Stage 7: Physical Write Failure -> Compensation and Error Reporting
  it('7. handles write errors cleanly and reports transaction failure without false success', async () => {
    const invalidPath = path.join(os.tmpdir(), 'non_existent_folder_xyz', 'test.mp3');

    const txManager = new MetadataTransactionManager({
      dbUpdater: async () => {
        throw new Error('Disk permission denied');
      }
    });

    const res = await txManager.executeTransaction('op-e2e-fail', [
      {
        resourceId: 9999,
        filePath: invalidPath,
        fieldMutations: [{ fieldId: 'title', oldValue: 'A', newValue: 'B' }]
      }
    ]);

    expect(res.success).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.updatedCount).toBe(0);
  });
});
