import { inArray } from 'drizzle-orm';

import { db } from '../../db/db';
import { songs } from '../../db/schema';
import type { ImportDecision } from '../../playlistImport/models/ImportDecision';
import type { ImportStatistics } from '../../playlistImport/models/ImportStatistics';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';

const VALID_DECISIONS = new Set<ImportDecision>([
  'IMPORT',
  'SKIP_NOT_IN_LIBRARY',
  'SKIP_MISSING',
  'SKIP_INVALID'
]);

export class SpotifyImportValidator {
  /**
   * Deeply validates an untrusted PlaylistImportPlan from the renderer before persistence. Enforces
   * structural integrity, strictly sequential 1..N ordering, exhaustive decision validation,
   * decision <-> libraryMatch status consistency, database referential integrity, and recomputes
   * all statistics on the backend.
   */
  public static async validateAndSanitizePlan(
    untrustedPlan: PlaylistImportPlan
  ): Promise<PlaylistImportPlan> {
    if (!untrustedPlan || typeof untrustedPlan !== 'object') {
      throw new Error('Invalid playlist import plan: payload is empty or not an object.');
    }

    if (typeof untrustedPlan.playlistName !== 'string' || !untrustedPlan.playlistName.trim()) {
      throw new Error('Invalid playlist import plan: playlistName must be a non-empty string.');
    }

    if (!Array.isArray(untrustedPlan.entries)) {
      throw new Error('Invalid playlist import plan: entries must be an array.');
    }

    const uniqueSongIds = new Set<number>();
    let matchedCount = 0;
    let unmatchedCount = 0;
    let missingCount = 0;
    let invalidCount = 0;
    let repairedCount = 0;

    // 1. Structural, Sequential Ordering, Exhaustive Decisions, and Status Consistency Checks
    for (let i = 0; i < untrustedPlan.entries.length; i++) {
      const entry = untrustedPlan.entries[i];
      const expectedPosition = i + 1;

      if (!entry || typeof entry !== 'object' || !entry.source) {
        throw new Error(`Invalid playlist entry at index ${i}: malformed entry object.`);
      }

      if (entry.source.position !== expectedPosition) {
        throw new Error(
          `Invalid playlist ordering: entry at index ${i} has position ${entry.source.position}, expected ${expectedPosition}.`
        );
      }

      if (!VALID_DECISIONS.has(entry.decision)) {
        throw new Error(
          `Invalid playlist entry at position ${expectedPosition}: unrecognized decision '${entry.decision}'.`
        );
      }

      const match = entry.source.trackReference?.libraryMatch;
      if (!match) {
        throw new Error(
          `Invalid playlist entry at position ${expectedPosition}: missing libraryMatch object.`
        );
      }

      if (entry.decision === 'IMPORT') {
        if (match.status !== 'MATCHED') {
          throw new Error(
            `Inconsistent decision at position ${expectedPosition}: decision is IMPORT but libraryMatch.status is '${match.status}' (expected 'MATCHED').`
          );
        }

        const songId = match.matchedSongId;
        if (
          typeof songId !== 'number' ||
          !Number.isInteger(songId) ||
          songId <= 0 ||
          Number.isNaN(songId)
        ) {
          throw new Error(
            `Invalid IMPORT entry at position ${expectedPosition}: matchedSongId must be a positive integer, received ${songId}.`
          );
        }

        matchedCount++;
        uniqueSongIds.add(songId);
        if (match.matchType === 'REPAIRED') {
          repairedCount++;
        }
      } else {
        if (match.matchedSongId !== undefined && match.matchedSongId !== null) {
          throw new Error(
            `Invalid ${entry.decision} entry at position ${expectedPosition}: non-import entries must not have a matchedSongId.`
          );
        }

        if (entry.decision === 'SKIP_NOT_IN_LIBRARY') {
          if (match.status !== 'NOT_IN_LIBRARY') {
            throw new Error(
              `Inconsistent decision at position ${expectedPosition}: decision is SKIP_NOT_IN_LIBRARY but libraryMatch.status is '${match.status}'.`
            );
          }
          unmatchedCount++;
        } else if (entry.decision === 'SKIP_MISSING') {
          if (match.status !== 'MISSING') {
            throw new Error(
              `Inconsistent decision at position ${expectedPosition}: decision is SKIP_MISSING but libraryMatch.status is '${match.status}'.`
            );
          }
          missingCount++;
        } else if (entry.decision === 'SKIP_INVALID') {
          if (match.status !== 'INVALID_URI') {
            throw new Error(
              `Inconsistent decision at position ${expectedPosition}: decision is SKIP_INVALID but libraryMatch.status is '${match.status}'.`
            );
          }
          invalidCount++;
        }
      }
    }

    // 2. Referential Integrity Check against Local Database
    if (uniqueSongIds.size > 0) {
      const songIdArray = Array.from(uniqueSongIds);
      const existingRows = await db
        .select({ id: songs.id })
        .from(songs)
        .where(inArray(songs.id, songIdArray));

      if (existingRows.length !== uniqueSongIds.size) {
        const existingSet = new Set(existingRows.map((r) => r.id));
        const missingIds = songIdArray.filter((id) => !existingSet.has(id));
        throw new Error(
          `Referential integrity violation: matched song ID(s) [${missingIds.join(', ')}] do not exist in the local database.`
        );
      }
    }

    // 3. Backend Recomputed Statistics (Discards any client-tampered values)
    const recomputedStatistics: ImportStatistics = {
      totalEntries: untrustedPlan.entries.length,
      importedEntries: matchedCount,
      repairedEntries: repairedCount,
      skippedEntries: unmatchedCount + missingCount + invalidCount,
      missingEntries: missingCount,
      notInLibraryEntries: unmatchedCount,
      invalidEntries: invalidCount,
      warningCount: 0,
      plannedImportPercentage:
        untrustedPlan.entries.length > 0
          ? Math.round((matchedCount / untrustedPlan.entries.length) * 100)
          : 0
    };

    return {
      playlistName: untrustedPlan.playlistName.trim(),
      description:
        typeof untrustedPlan.description === 'string'
          ? untrustedPlan.description.trim() || undefined
          : undefined,
      entries: untrustedPlan.entries,
      statistics: recomputedStatistics,
      warnings: Array.isArray(untrustedPlan.warnings) ? untrustedPlan.warnings : [],
      sourceFormat: 'spotify',
      createdByImporter: 'spotify'
    };
  }
}
