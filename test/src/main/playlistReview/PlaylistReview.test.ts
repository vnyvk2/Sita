import { describe, it, expect } from 'vitest';
import { PlaylistReviewService } from '@main/playlistReview/services/PlaylistReviewService';
import { ReviewValidator } from '@main/playlistReview/validator/ReviewValidator';
import type { PlaylistImportPlan } from '@main/playlistImport/models/PlaylistImportPlan';

describe('Phase 13 — Interactive Review & Decision Framework', () => {
  it('should create a review session and apply candidate selection overrides', () => {
    const validator = new ReviewValidator();
    const service = new PlaylistReviewService(validator);

    const initialPlan: PlaylistImportPlan = {
      playlistName: 'Rock Classics',
      statistics: {
        totalEntries: 2,
        importedEntries: 1,
        skippedEntries: 1,
        missingEntries: 0,
        notInLibraryEntries: 1,
        invalidEntries: 0,
        warningCount: 0,
        plannedImportPercentage: 50
      },
      warnings: [],
      entries: [
        {
          decision: 'IMPORT',
          source: {
            position: 1,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'bohemian.mp3' }, resolution: { originalReference: 'bohemian.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 101 }
            }
          }
        },
        {
          decision: 'SKIP_NOT_IN_LIBRARY',
          source: {
            position: 2,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'stairway.mp3' }, resolution: { originalReference: 'stairway.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'NOT_IN_LIBRARY', confidence: 0 }
            }
          }
        }
      ]
    };

    const session = service.createSession(initialPlan);
    expect(session.isValid).toBe(true);
    expect(session.currentPlan.statistics.importedEntries).toBe(1);

    const updatedSession = service.applyOverride(session.id, {
      id: 'ov_1',
      entryPosition: 2,
      type: 'SELECT_CANDIDATE',
      selectedSongId: 999,
      reason: 'User selected Stairway to Heaven'
    });

    expect(updatedSession.isValid).toBe(true);
    expect(updatedSession.currentPlan.statistics.importedEntries).toBe(2);
    expect(updatedSession.currentPlan.entries[1].decision).toBe('IMPORT');
    expect(updatedSession.currentPlan.entries[1].source.trackReference.libraryMatch.matchedSongId).toBe(999);
  });

  it('should support FORCE_SKIP user overrides', () => {
    const validator = new ReviewValidator();
    const service = new PlaylistReviewService(validator);

    const initialPlan: PlaylistImportPlan = {
      playlistName: 'Rock Classics',
      statistics: {
        totalEntries: 1,
        importedEntries: 1,
        skippedEntries: 0,
        missingEntries: 0,
        notInLibraryEntries: 0,
        invalidEntries: 0,
        warningCount: 0,
        plannedImportPercentage: 100
      },
      warnings: [],
      entries: [
        {
          decision: 'IMPORT',
          source: {
            position: 1,
            trackReference: {
              resolvedTrack: { track: { originalLocation: 'bohemian.mp3' }, resolution: { originalReference: 'bohemian.mp3', resolutionStatus: 'RESOLVED', verificationStatus: 'FOUND' } },
              libraryMatch: { status: 'MATCHED', confidence: 100, matchedSongId: 101 }
            }
          }
        }
      ]
    };

    const session = service.createSession(initialPlan);
    const updatedSession = service.applyOverride(session.id, {
      id: 'ov_2',
      entryPosition: 1,
      type: 'FORCE_SKIP',
      reason: 'User decided to skip this track'
    });

    expect(updatedSession.currentPlan.entries[0].decision).toBe('SKIP_MISSING');
    expect(updatedSession.currentPlan.statistics.importedEntries).toBe(0);
  });
});
