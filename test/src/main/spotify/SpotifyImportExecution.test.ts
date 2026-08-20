import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@main/db/db';
import { playlistEntries, playlists, songs } from '@main/db/schema';
import { PlaylistImportExecutor } from '@main/playlistImport/executor/PlaylistImportExecutor';
import type { PlaylistImportPlan } from '@main/playlistImport/models/PlaylistImportPlan';
import { importExecutor } from '@main/playlistImport/setup';
import { SpotifyImportValidator } from '@main/spotify/ipc/SpotifyImportValidator';

describe('SpotifyImportExecution (Validation, Persistence & Transaction Rollback)', () => {
  let testSongId1: number;
  let testSongId2: number;

  beforeEach(async () => {
    // Clean up test playlists
    await db.delete(playlists).where(eq(playlists.name, 'Test Spotify Imported Playlist'));
    await db.delete(playlists).where(eq(playlists.name, 'Rollback Test Playlist'));

    // Insert or find test songs in the database
    const existingSongs = await db.select().from(songs).limit(2);
    if (existingSongs.length >= 2) {
      testSongId1 = existingSongs[0].id;
      testSongId2 = existingSongs[1].id;
    } else {
      const inserted1 = await db
        .insert(songs)
        .values({
          title: 'Execution Test Song 1',
          duration: '200.000',
          path: '/test/music/exec_test_song_1.mp3',
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .onConflictDoNothing()
        .returning();

      const inserted2 = await db
        .insert(songs)
        .values({
          title: 'Execution Test Song 2',
          duration: '300.000',
          path: '/test/music/exec_test_song_2.mp3',
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .onConflictDoNothing()
        .returning();

      const reselected = await db.select().from(songs).limit(2);
      testSongId1 = inserted1[0]?.id ?? reselected[0].id;
      testSongId2 = inserted2[0]?.id ?? reselected[1].id;
    }
  });

  describe('SpotifyImportValidator', () => {
    it('should reject malformed plans and empty playlistName', async () => {
      await expect(
        SpotifyImportValidator.validateAndSanitizePlan(null as unknown as PlaylistImportPlan)
      ).rejects.toThrow(/invalid playlist import plan/i);

      await expect(
        SpotifyImportValidator.validateAndSanitizePlan({
          playlistName: '   ',
          entries: [],
          statistics: { totalEntries: 0, importedEntries: 0, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 0, repairedEntries: 0 },
          warnings: []
        })
      ).rejects.toThrow(/playlistName must be a non-empty string/i);
    });

    it('should reject unrecognized decisions', async () => {
      const badDecisionPlan = {
        playlistName: 'Bad Decision',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId1, confidence: 1 }
              }
            },
            decision: 'UNKNOWN_DECISION_TYPE'
          }
        ],
        statistics: { totalEntries: 1, importedEntries: 1, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      await expect(
        SpotifyImportValidator.validateAndSanitizePlan(badDecisionPlan as unknown as PlaylistImportPlan)
      ).rejects.toThrow(/unrecognized decision/i);
    });

    it('should reject decision vs libraryMatch status mismatches', async () => {
      // Decision is IMPORT but status is NOT_IN_LIBRARY
      const mismatchPlan: PlaylistImportPlan = {
        playlistName: 'Mismatch',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'UNRESOLVED', verificationStatus: 'MISSING' } },
                libraryMatch: { status: 'NOT_IN_LIBRARY', matchedSongId: testSongId1, confidence: 0 }
              }
            },
            decision: 'IMPORT'
          }
        ],
        statistics: { totalEntries: 1, importedEntries: 1, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      await expect(SpotifyImportValidator.validateAndSanitizePlan(mismatchPlan)).rejects.toThrow(
        /inconsistent decision/i
      );
    });

    it('should reject non-sequential or out-of-order entry positions', async () => {
      const invalidOrderPlan: PlaylistImportPlan = {
        playlistName: 'Bad Order',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId1, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          },
          {
            source: {
              position: 3, // Out of order: expected 2
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId2, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          }
        ],
        statistics: { totalEntries: 2, importedEntries: 2, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      await expect(SpotifyImportValidator.validateAndSanitizePlan(invalidOrderPlan)).rejects.toThrow(
        /entry at index 1 has position 3, expected 2/i
      );
    });

    it('should reject IMPORT entries with invalid or non-integer matchedSongId', async () => {
      const badIdPlan: PlaylistImportPlan = {
        playlistName: 'Bad ID',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: -5, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          }
        ],
        statistics: { totalEntries: 1, importedEntries: 1, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      await expect(SpotifyImportValidator.validateAndSanitizePlan(badIdPlan)).rejects.toThrow(
        /matchedSongId must be a positive integer/i
      );
    });

    it('should reject SKIP entries containing a matchedSongId', async () => {
      const badSkipPlan: PlaylistImportPlan = {
        playlistName: 'Bad Skip',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'UNRESOLVED', verificationStatus: 'MISSING' } },
                libraryMatch: { status: 'NOT_IN_LIBRARY', matchedSongId: 99, confidence: 0 }
              }
            },
            decision: 'SKIP_NOT_IN_LIBRARY'
          }
        ],
        statistics: { totalEntries: 1, importedEntries: 0, skippedEntries: 1, missingEntries: 0, notInLibraryEntries: 1, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 0, repairedEntries: 0 },
        warnings: []
      };

      await expect(SpotifyImportValidator.validateAndSanitizePlan(badSkipPlan)).rejects.toThrow(
        /non-import entries must not have a matchedSongId/i
      );
    });

    it('should enforce referential integrity and reject non-existent song IDs', async () => {
      const nonExistentSongId = 99999999;
      const fakeIdPlan: PlaylistImportPlan = {
        playlistName: 'Fake Song ID',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: nonExistentSongId, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          }
        ],
        statistics: { totalEntries: 1, importedEntries: 1, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      await expect(SpotifyImportValidator.validateAndSanitizePlan(fakeIdPlan)).rejects.toThrow(
        /referential integrity violation: matched song ID\(s\) \[99999999\] do not exist/i
      );
    });

    it('should discard client-tampered statistics and recompute true counts on the backend', async () => {
      const tamperedPlan: PlaylistImportPlan = {
        playlistName: 'Tampered Stats',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId1, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          },
          {
            source: {
              position: 2,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'UNRESOLVED', verificationStatus: 'MISSING' } },
                libraryMatch: { status: 'NOT_IN_LIBRARY', confidence: 0 }
              }
            },
            decision: 'SKIP_NOT_IN_LIBRARY'
          }
        ],
        statistics: { totalEntries: 999, importedEntries: 999, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 999, repairedEntries: 0 },
        warnings: []
      };

      const sanitized = await SpotifyImportValidator.validateAndSanitizePlan(tamperedPlan);
      expect(sanitized.statistics.totalEntries).toBe(2);
      expect(sanitized.statistics.importedEntries).toBe(1);
      expect(sanitized.statistics.notInLibraryEntries).toBe(1);
      expect(sanitized.statistics.plannedImportPercentage).toBe(50);
    });
  });

  describe('PlaylistImportExecutor End-to-End Execution & Transaction Safety', () => {
    it('should create playlist and insert matched entries preserving duplicate multiplicity and exact order in database', async () => {
      const validPlan: PlaylistImportPlan = {
        playlistName: 'Test Spotify Imported Playlist',
        description: 'Imported from Spotify bridge',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId1, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          },
          {
            source: {
              position: 2,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId2, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          },
          {
            source: {
              position: 3,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId1, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          }
        ],
        statistics: { totalEntries: 3, importedEntries: 3, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      const validatedPlan = await SpotifyImportValidator.validateAndSanitizePlan(validPlan);
      const result = await importExecutor.execute(validatedPlan, { mode: 'create' });

      expect(result.success).toBe(true);
      expect(result.playlistId).toBeDefined();

      const createdPlaylistId = result.playlistId;

      // Verify playlist row exists in DB
      const plRow = await db.query.playlists.findFirst({
        where: eq(playlists.id, createdPlaylistId)
      });
      expect(plRow).toBeDefined();
      expect(plRow?.name).toBe('Test Spotify Imported Playlist');

      // Verify entries and multiplicity [testSongId1, testSongId2, testSongId1]
      const entries = await db
        .select()
        .from(playlistEntries)
        .where(eq(playlistEntries.playlistId, createdPlaylistId));

      expect(entries.length).toBe(3);
      expect(entries.map((e) => e.songId)).toEqual([testSongId1, testSongId2, testSongId1]);

      // Clean up created playlist
      await db.delete(playlists).where(eq(playlists.id, createdPlaylistId));
    });

    it('should roll back completely on transaction failure leaving zero orphaned playlists or entries', async () => {
      const failingPlan: PlaylistImportPlan = {
        playlistName: 'Rollback Test Playlist',
        entries: [
          {
            source: {
              position: 1,
              trackReference: {
                resolvedTrack: { track: { originalLocation: '' }, resolution: { originalReference: '', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
                libraryMatch: { status: 'MATCHED', matchedSongId: testSongId1, confidence: 1 }
              }
            },
            decision: 'IMPORT'
          }
        ],
        statistics: { totalEntries: 1, importedEntries: 1, skippedEntries: 0, missingEntries: 0, notInLibraryEntries: 0, invalidEntries: 0, warningCount: 0, plannedImportPercentage: 100, repairedEntries: 0 },
        warnings: []
      };

      let txInstance: unknown;
      const transactionalPersistence = {
        createPlaylist: async (name: string) => {
          const res = await (txInstance as typeof db).insert(playlists).values({ name }).returning();
          return res[0].id;
        },
        addEntries: async () => {
          throw new Error('Simulated database write failure during batch insert');
        }
      };

      const realTxRunner = {
        runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
          return await db.transaction(async (tx) => {
            txInstance = tx;
            return await work();
          });
        }
      };

      const rollbackExecutor = new PlaylistImportExecutor(
        transactionalPersistence as never,
        realTxRunner
      );

      await expect(rollbackExecutor.execute(failingPlan)).rejects.toThrow(
        /simulated database write failure/i
      );

      // Assert rollback: no playlist with name 'Rollback Test Playlist' exists in DB!
      const orphanedPlaylists = await db
        .select()
        .from(playlists)
        .where(eq(playlists.name, 'Rollback Test Playlist'));

      expect(orphanedPlaylists.length).toBe(0);
    });
  });
});
