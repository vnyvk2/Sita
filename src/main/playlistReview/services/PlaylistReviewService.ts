import type { ReviewValidator } from '../validator/ReviewValidator';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { PlaylistImportPlanEntry } from '../../playlistImport/models/PlaylistImportPlanEntry';
import type { ReviewSession } from '../models/ReviewSession';
import type { UserOverride } from '../models/UserOverride';

export class PlaylistReviewService {
  private sessions = new Map<string, ReviewSession>();

  constructor(private validator: ReviewValidator) {}

  createSession(originalPlan: PlaylistImportPlan): ReviewSession {
    const id = `review_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const session: ReviewSession = {
      id,
      originalPlan: JSON.parse(JSON.stringify(originalPlan)),
      currentPlan: JSON.parse(JSON.stringify(originalPlan)),
      userOverrides: [],
      isValid: true,
      validationErrors: []
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): ReviewSession | null {
    const session = this.sessions.get(id);
    return session ? JSON.parse(JSON.stringify(session)) : null;
  }

  applyOverride(sessionId: string, override: UserOverride): ReviewSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Review session ${sessionId} not found`);
    }

    const validation = this.validator.validateOverride(session.currentPlan, override);
    if (!validation.isValid) {
      session.isValid = false;
      session.validationErrors.push(...validation.errors);
      return JSON.parse(JSON.stringify(session));
    }

    session.userOverrides.push(override);
    session.currentPlan = this.regeneratePlan(session.originalPlan, session.userOverrides);
    session.isValid = true;
    session.validationErrors = [];

    return JSON.parse(JSON.stringify(session));
  }

  private regeneratePlan(originalPlan: PlaylistImportPlan, overrides: UserOverride[]): PlaylistImportPlan {
    const updatedEntries: PlaylistImportPlanEntry[] = originalPlan.entries.map((entry) => {
      const override = overrides.find((o) => o.entryPosition === entry.source.position);
      if (!override) return entry;

      if (override.type === 'FORCE_SKIP') {
        return {
          ...entry,
          decision: 'SKIP_MISSING',
          notes: override.reason ?? 'Skipped by user override'
        };
      }

      if (override.type === 'SELECT_CANDIDATE' && override.selectedSongId !== undefined) {
        return {
          ...entry,
          decision: 'IMPORT',
          notes: override.reason ?? 'Selected manually by user',
          source: {
            ...entry.source,
            trackReference: {
              ...entry.source.trackReference,
              libraryMatch: {
                matchedSongId: override.selectedSongId,
                status: 'MATCHED',
                matchType: 'REPAIRED',
                confidence: 100,
                diagnostics: ['Selected manually via review dialog']
              }
            }
          }
        };
      }

      if (override.type === 'FORCE_IMPORT') {
        return {
          ...entry,
          decision: 'IMPORT',
          notes: override.reason ?? 'Forced import by user'
        };
      }

      return entry;
    });

    const importedEntries = updatedEntries.filter((e) => e.decision === 'IMPORT').length;
    const skippedEntries = updatedEntries.filter((e) => e.decision !== 'IMPORT').length;

    return {
      ...originalPlan,
      entries: updatedEntries,
      statistics: {
        ...originalPlan.statistics,
        importedEntries,
        skippedEntries,
        plannedImportPercentage: Math.round((importedEntries / originalPlan.statistics.totalEntries) * 100)
      }
    };
  }
}
