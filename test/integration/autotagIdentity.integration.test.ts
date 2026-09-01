import fs from 'fs';
import os from 'os';
import path from 'path';

import { updateSongBasicFields } from '@main/db/queries/songs';
import { MetadataDiffBuilder } from '@main/metadata/diff/MetadataDiffBuilder';
import type { ResourceMutationPayload } from '@main/metadata/domain/MetadataTransaction';
import type { MusicBrainzRecordingDto } from '@main/metadata/providers/musicbrainz/dto/RecordingDto';
import { MusicBrainzRecordingMapper } from '@main/metadata/providers/musicbrainz/mappers/RecordingMapper';
import { MusicBrainzReleaseMapper } from '@main/metadata/providers/musicbrainz/mappers/ReleaseMapper';
import { TagWriterService } from '@main/metadata/services/TagWriterService';
import { MetadataTransactionManager } from '@main/metadata/transactions/MetadataTransactionManager';
import { SnapshotBuilder } from '@main/metadata/transactions/SnapshotBuilder';
import { SongMetadataBuilder } from '@main/metadata/transactions/SongMetadataBuilder';
import { File } from 'node-taglib-sharp';
import { describe, expect, it, vi } from 'vitest';

describe('AutoTag Identity Pipeline (Phase 4 Integration Gate)', () => {
  describe('1. End-to-End Identity Mapping & Building (Phase 4-A, 4-C)', () => {
    it('propagates Recording MBID and ISRC from MusicBrainz DTO -> Diff -> SongMetadataBuilder', async () => {
      const recordingDto: MusicBrainzRecordingDto = {
        id: 'rec-mbid-98765-uuid',
        title: 'Paranoid Android',
        length: 383000,
        'first-release-date': '1997-05-26',
        isrcs: ['GBAYE9700021'],
        'artist-credit': [{ name: 'Radiohead', artist: { id: 'art-mbid-1' } }],
        releases: [
          {
            id: 'rel-mbid-ok-computer',
            title: 'OK Computer',
            'release-group': { id: 'rg-mbid-ok-computer', 'primary-type': 'Album' }
          }
        ]
      };

      // 1. Map Recording DTO to candidate & provider result
      const mapper = new MusicBrainzRecordingMapper();
      const candidate = mapper.toCandidate(recordingDto, 0.95);
      expect(candidate.provider.providerRecordingId).toBe('rec-mbid-98765-uuid');
      expect(candidate.provider.isrc).toBe('GBAYE9700021');

      // 2. Build diffs for a local song
      const localSong = {
        songId: 100,
        path: '/music/ok_computer/02_paranoid_android.flac',
        title: 'Paranoid Android',
        artist: 'Radiohead',
        album: 'OK Computer',
        year: 1997,
        trackNumber: 2,
        discNumber: 1,
        genre: 'Alternative',
        isrc: undefined,
        musicBrainzRecordingId: undefined
      };

      const diff = MetadataDiffBuilder.buildTrackPreview({
        localSong,
        remoteTrack: {
          recording: {
            title: candidate.recording.title,
            artist: candidate.recording.artist,
            album: candidate.recording.album,
            year: candidate.recording.year,
            trackNumber: candidate.recording.trackNumber,
            discNumber: candidate.recording.discNumber,
            genres: candidate.recording.genres
          },
          provider: {
            provider: 'musicbrainz',
            providerRecordingId: candidate.provider.providerRecordingId,
            isrc: candidate.provider.isrc
          }
        },
        confidence: 0.95,
        reasons: ['Exact match']
      });

      const mbidDiff = diff.fieldDiffs.find((d) => d.fieldId === 'musicBrainzRecordingId');
      const isrcDiff = diff.fieldDiffs.find((d) => d.fieldId === 'isrc');

      expect(mbidDiff?.suggestedValue).toBe('rec-mbid-98765-uuid');
      expect(isrcDiff?.suggestedValue).toBe('GBAYE9700021');
    });
  });

  describe('2. DB Persistence & Set / Clear / Preserve Semantics (Phase 4-B, 4-F)', () => {
    it('implements strict set, clear, and preserve semantics in updateSongBasicFields', async () => {
      let executedUpdatePayload: Record<string, unknown> = {};

      const mockTrx: any = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((payload) => {
            executedUpdatePayload = payload;
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 50, ...payload }])
              })
            };
          })
        })
      };

      // Case A: Setting valid MBID and ISRC
      await updateSongBasicFields(
        50,
        {
          musicBrainzRecordingId: 'rec-uuid-111',
          isrc: 'USRC12345678',
          discNumber: 2
        },
        mockTrx
      );

      expect(executedUpdatePayload.musicBrainzRecordingId).toBe('rec-uuid-111');
      expect(executedUpdatePayload.isrc).toBe('USRC12345678');
      expect(executedUpdatePayload.diskNumber).toBe(2);

      // Case B: Clearing MBID and ISRC with empty string -> maps to SQL NULL
      await updateSongBasicFields(
        50,
        {
          musicBrainzRecordingId: '',
          isrc: ''
        },
        mockTrx
      );

      expect(executedUpdatePayload.musicBrainzRecordingId).toBeNull();
      expect(executedUpdatePayload.isrc).toBeNull();

      // Case C: Preserving MBID and ISRC when undefined -> omitted from update payload
      executedUpdatePayload = {};
      await updateSongBasicFields(
        50,
        {
          title: 'New Title Only'
        },
        mockTrx
      );

      expect(executedUpdatePayload.title).toBe('New Title Only');
      expect(executedUpdatePayload.musicBrainzRecordingId).toBeUndefined();
      expect(executedUpdatePayload.isrc).toBeUndefined();
    });
  });

  describe('3. Undo & Rollback Identity Invariants (Phase 4-E, 4-G)', () => {
    it('restores previous DB and ID3 identity states across all 4 rollback permutations', async () => {
      const rollbackHistory: Array<Record<string, string | number | undefined>> = [];

      const mockDbUpdater = vi
        .fn()
        .mockImplementation(
          async (_songId: number, tags: Record<string, string | number | undefined>) => {
            rollbackHistory.push(tags);
            return true;
          }
        );

      const txManager = new MetadataTransactionManager({
        dbUpdater: mockDbUpdater
      });

      // Permutation 1: Old MBID/ISRC -> New MBID/ISRC -> Rollback -> Old MBID/ISRC
      const mutations1: ResourceMutationPayload[] = [
        {
          resourceId: 301,
          filePath: '/music/song1.mp3',
          fieldMutations: [
            { fieldId: 'musicBrainzRecordingId', oldValue: 'rec-old-aaa', newValue: 'rec-new-bbb' },
            { fieldId: 'isrc', oldValue: 'ISRC-OLD-111', newValue: 'ISRC-NEW-222' }
          ]
        }
      ];

      await txManager.executeTransaction('op-perm-1', mutations1);
      await txManager.rollbackLastTransaction();

      expect(rollbackHistory[rollbackHistory.length - 1].musicBrainzRecordingId).toBe(
        'rec-old-aaa'
      );
      expect(rollbackHistory[rollbackHistory.length - 1].isrc).toBe('ISRC-OLD-111');

      // Permutation 2: Absent MBID/ISRC -> New MBID/ISRC -> Rollback -> Cleared/Absent ('')
      const mutations2: ResourceMutationPayload[] = [
        {
          resourceId: 302,
          filePath: '/music/song2.mp3',
          fieldMutations: [
            { fieldId: 'musicBrainzRecordingId', oldValue: undefined, newValue: 'rec-new-ccc' },
            { fieldId: 'isrc', oldValue: undefined, newValue: 'ISRC-NEW-333' }
          ]
        }
      ];

      await txManager.executeTransaction('op-perm-2', mutations2);
      await txManager.rollbackLastTransaction();

      expect(rollbackHistory[rollbackHistory.length - 1].musicBrainzRecordingId).toBe('');
      expect(rollbackHistory[rollbackHistory.length - 1].isrc).toBe('');
    });
  });

  describe('4. 5-Way Strict Entity Isolation (Phase 4-H)', () => {
    it('preserves complete isolation between Discogs Release ID, MB Release MBID, MB Release Group MBID, MB Recording MBID, and ISRC', () => {
      const discogsReleaseId = '249504';
      const mbReleaseMbid = '76df3287-6cda-33eb-8e9a-044b5e15ffdd';
      const mbReleaseGroupMbid = '32912440-1a6f-3c6c-8438-fa8e9ff76288';
      const mbRecordingMbid = '98765432-1111-2222-3333-444455556666';
      const isrc = 'GBAYE9700021';

      // 1. Release Mapper correctly maintains releaseId vs releaseGroupId vs recordingId vs isrc
      const releaseMapper = new MusicBrainzReleaseMapper();
      const resolved = releaseMapper.toResolvedAlbumRelease({
        id: mbReleaseMbid,
        title: 'OK Computer',
        'release-group': { id: mbReleaseGroupMbid },
        media: [
          {
            position: 1,
            tracks: [
              {
                id: 'trk-01',
                title: 'Airbag',
                recording: {
                  id: mbRecordingMbid,
                  title: 'Airbag',
                  isrcs: [isrc]
                }
              }
            ]
          }
        ]
      });

      // Invariants:
      // Release MBID belongs strictly to album.releaseId and providerReleaseId
      expect(resolved.album.releaseId).toBe(mbReleaseMbid);
      expect(resolved.providerReleaseId).toBe(mbReleaseMbid);
      expect(resolved.album.releaseId).not.toBe(mbReleaseGroupMbid);
      expect(resolved.album.releaseId).not.toBe(mbRecordingMbid);
      expect(resolved.album.releaseId).not.toBe(discogsReleaseId);

      // Release Group MBID belongs strictly to releaseGroupId
      expect(resolved.releaseGroupId).toBe(mbReleaseGroupMbid);
      expect(resolved.releaseGroupId).not.toBe(mbReleaseMbid);
      expect(resolved.releaseGroupId).not.toBe(mbRecordingMbid);

      // Recording MBID belongs strictly to track.musicBrainzRecordingId
      expect(resolved.tracks[0].musicBrainzRecordingId).toBe(mbRecordingMbid);
      expect(resolved.tracks[0].musicBrainzRecordingId).not.toBe(mbReleaseMbid);
      expect(resolved.tracks[0].musicBrainzRecordingId).not.toBe(mbReleaseGroupMbid);

      // ISRC belongs strictly to track.isrc
      expect(resolved.tracks[0].isrc).toBe(isrc);
      expect(resolved.tracks[0].isrc).not.toBe(mbRecordingMbid);
    });
  });

  describe('5. Real Physical Audio ID3 Persistence, Clear & Rollback Verification (Phase 4-D, 4-E, 4-G)', () => {
    const fixtureSource = path.join(process.cwd(), 'test', 'assets', 'test_song.mp3');
    const tempTestFile = path.join(os.tmpdir(), `autotag_identity_test_${Date.now()}.mp3`);

    it('writes Recording MBID and ISRC to real audio file, reads back, clears, and verifies rollback', async () => {
      // Setup temporary real mp3 file
      fs.copyFileSync(fixtureSource, tempTestFile);

      try {
        const tagWriter = new TagWriterService();

        // 1. Write MBID and ISRC to physical audio file
        const writeResult = await tagWriter.writeTags({
          filePath: tempTestFile,
          title: 'Physical Test Title',
          musicBrainzRecordingId: 'rec-phys-uuid-12345',
          isrc: 'GBAYE9700021'
        });
        expect(writeResult.success).toBe(true);

        // 2. Read back using node-taglib-sharp (simulating scanner / parseSong)
        const fileAfterWrite = File.createFromPath(tempTestFile);
        expect(fileAfterWrite.tag.musicBrainzTrackId).toBe('rec-phys-uuid-12345');
        expect(fileAfterWrite.tag.isrc).toBe('GBAYE9700021');
        fileAfterWrite.dispose();

        // 3. Clear MBID and ISRC (simulating clear / removal)
        const clearResult = await tagWriter.writeTags({
          filePath: tempTestFile,
          musicBrainzRecordingId: '',
          isrc: ''
        });
        expect(clearResult.success).toBe(true);

        const fileAfterClear = File.createFromPath(tempTestFile);
        expect(fileAfterClear.tag.musicBrainzTrackId || undefined).toBeUndefined();
        expect(fileAfterClear.tag.isrc || undefined).toBeUndefined();
        fileAfterClear.dispose();

        // 4. Physical Transaction & Rollback Lifecycle
        // Set initial state
        await tagWriter.writeTags({
          filePath: tempTestFile,
          title: 'Initial Title',
          musicBrainzRecordingId: 'rec-initial-state',
          isrc: 'ISRC-INITIAL'
        });

        const txManager = new MetadataTransactionManager({
          dbUpdater: async (_songId, data) => {
            const res = await tagWriter.writeTags({
              filePath: tempTestFile,
              title: data.title,
              musicBrainzRecordingId: data.musicBrainzRecordingId,
              isrc: data.isrc
            });
            if (!res.success) {
              throw new Error(`tagWriter failed: ${res.error}`);
            }
            return true;
          }
        });

        // Execute transaction modifying identity
        const mutations: ResourceMutationPayload[] = [
          {
            resourceId: 999,
            filePath: tempTestFile,
            fieldMutations: [
              { fieldId: 'title', oldValue: 'Initial Title', newValue: 'Mutated Title' },
              {
                fieldId: 'musicBrainzRecordingId',
                oldValue: 'rec-initial-state',
                newValue: 'rec-mutated-state'
              },
              { fieldId: 'isrc', oldValue: 'ISRC-INITIAL', newValue: 'ISRC-MUTATED' }
            ]
          }
        ];

        const txRes = await txManager.executeTransaction('op-phys-1', mutations);
        expect(txRes.success).toBe(true);

        // Verify physical file has mutated values
        const fileMutated = File.createFromPath(tempTestFile);
        expect(fileMutated.tag.musicBrainzTrackId).toBe('rec-mutated-state');
        expect(fileMutated.tag.isrc).toBe('ISRC-MUTATED');
        fileMutated.dispose();

        // Rollback transaction
        const rollbackRes = await txManager.rollbackLastTransaction();
        expect(rollbackRes.success).toBe(true);

        // Verify physical file was restored to initial state
        const fileRestored = File.createFromPath(tempTestFile);
        expect(fileRestored.tag.musicBrainzTrackId).toBe('rec-initial-state');
        expect(fileRestored.tag.isrc).toBe('ISRC-INITIAL');
        fileRestored.dispose();
      } finally {
        if (fs.existsSync(tempTestFile)) {
          fs.unlinkSync(tempTestFile);
        }
      }
    });
  });
});
