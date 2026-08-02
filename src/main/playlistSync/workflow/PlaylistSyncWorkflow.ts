import type { PlaylistImportPipeline } from '../../playlistImport/pipeline/PlaylistImportPipeline';
import type { PlaylistSourceTracker } from '../services/PlaylistSourceTracker';
import type { PlaylistSyncPlanner } from '../planner/PlaylistSyncPlanner';
import type { PlaylistConflictAnalyzer } from '../analyzer/PlaylistConflictAnalyzer';
import type { ConflictResolutionPlanner, ResolvedSyncPlanResult } from '../planner/ConflictResolutionPlanner';
import type { PlaylistSyncExecutor, SyncExecutionResult } from '../executor/PlaylistSyncExecutor';
import type { PlaylistLink } from '../models/PlaylistLink';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';
import type { ConflictAnalysis } from '../models/ConflictAnalysis';

export interface SyncPreviewResult {
  rawPlan: PlaylistSyncPlan;
  resolvedPlan: PlaylistSyncPlan;
  analysis: ConflictAnalysis;
  conflictSummary: ResolvedSyncPlanResult['conflictSummary'];
}

export class PlaylistSyncWorkflow {
  constructor(
    private tracker: PlaylistSourceTracker,
    private importPipeline: PlaylistImportPipeline,
    private syncPlanner: PlaylistSyncPlanner,
    private syncExecutor: PlaylistSyncExecutor,
    private analyzer?: PlaylistConflictAnalyzer,
    private resolutionPlanner?: ConflictResolutionPlanner
  ) {}

  async previewSync(
    link: PlaylistLink,
    currentPlaylistSongIds: number[]
  ): Promise<SyncPreviewResult | null> {
    const hasChanged = await this.tracker.hasSourceChanged(link);
    if (!hasChanged && link.fileHash) {
      return null;
    }

    const importPlan = await this.importPipeline.generatePlan(link.sourceFile);
    const rawPlan = this.syncPlanner.createSyncPlan(link, importPlan, currentPlaylistSongIds);

    let resolvedPlan = rawPlan;
    let analysis: ConflictAnalysis = { conflicts: [], hasConflicts: false, hasManualConflicts: false };
    let conflictSummary = { totalConflicts: 0, resolvedAutomatically: 0, manualConflicts: 0, ignoredConflicts: 0 };

    if (this.analyzer) {
      analysis = this.analyzer.analyzePlan(rawPlan, currentPlaylistSongIds);
      if (this.resolutionPlanner && analysis.hasConflicts) {
        const resolution = this.resolutionPlanner.resolveConflicts(rawPlan, analysis);
        resolvedPlan = resolution.resolvedPlan;
        conflictSummary = resolution.conflictSummary;
      }
    }

    return {
      rawPlan,
      resolvedPlan,
      analysis,
      conflictSummary
    };
  }

  async executeSyncPlan(plan: PlaylistSyncPlan): Promise<SyncExecutionResult> {
    return await this.syncExecutor.executeSync(plan);
  }
}
