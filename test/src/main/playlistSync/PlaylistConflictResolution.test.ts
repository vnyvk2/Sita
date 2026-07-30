import { describe, it, expect } from 'vitest';
import { PlaylistConflictAnalyzer } from '@main/playlistSync/analyzer/PlaylistConflictAnalyzer';
import { ConflictResolutionPlanner } from '@main/playlistSync/planner/ConflictResolutionPlanner';
import { SourceWinsConflictStrategy } from '@main/playlistSync/strategies/SourceWinsConflictStrategy';
import { KeepLocalConflictStrategy } from '@main/playlistSync/strategies/KeepLocalConflictStrategy';
import type { PlaylistSyncPlan } from '@main/playlistSync/models/PlaylistSyncPlan';

describe('Phase 11 — Conflict Detection & Resolution Framework', () => {
  it('should detect duplicate entry additions and resolve automatically via SourceWinsConflictStrategy', () => {
    const analyzer = new PlaylistConflictAnalyzer();
    const planner = new ConflictResolutionPlanner([new SourceWinsConflictStrategy()]);

    const plan: PlaylistSyncPlan = {
      linkId: 'link_1',
      playlistId: 10,
      sourceFile: 'rock.m3u',
      syncPolicy: 'ONE_WAY_SOURCE_WINS',
      hasChanges: true,
      additionsCount: 2,
      removalsCount: 0,
      operations: [
        { type: 'ADD_SONG', songId: 101, reason: 'Source addition' },
        { type: 'ADD_SONG', songId: 101, reason: 'Duplicate source addition' }
      ]
    };

    const analysis = analyzer.analyzePlan(plan, [200]);
    expect(analysis.hasConflicts).toBe(true);
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.conflicts[0].type).toBe('DUPLICATE_ENTRY');
    expect(analysis.conflicts[0].requiresUserDecision).toBe(false);

    const { resolvedPlan, conflictSummary } = planner.resolveConflicts(plan, analysis);
    expect(resolvedPlan.operations).toHaveLength(1);
    expect(resolvedPlan.additionsCount).toBe(1);
    expect(conflictSummary.resolvedAutomatically).toBe(1);
  });

  it('should detect local removal conflicts and flag for user decision under KEEP_LOCAL_CHANGES', () => {
    const analyzer = new PlaylistConflictAnalyzer();
    const planner = new ConflictResolutionPlanner([new KeepLocalConflictStrategy()]);

    const plan: PlaylistSyncPlan = {
      linkId: 'link_1',
      playlistId: 10,
      sourceFile: 'rock.m3u',
      syncPolicy: 'KEEP_LOCAL_CHANGES',
      hasChanges: true,
      additionsCount: 0,
      removalsCount: 1,
      operations: [
        { type: 'REMOVE_SONG', songId: 999, reason: 'Absent from source' }
      ]
    };

    const analysis = analyzer.analyzePlan(plan, [999]);
    expect(analysis.hasConflicts).toBe(true);
    expect(analysis.hasManualConflicts).toBe(true);
    expect(analysis.conflicts[0].requiresUserDecision).toBe(true);

    const { conflictSummary } = planner.resolveConflicts(plan, analysis);
    expect(conflictSummary.manualConflicts).toBe(1);
  });
});
