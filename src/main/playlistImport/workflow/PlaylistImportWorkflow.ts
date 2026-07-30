import type { PlaylistImportPipeline, ProgressListener } from '../pipeline/PlaylistImportPipeline';
import type { PlaylistImportExecutor } from '../executor/PlaylistImportExecutor';
import type { PlaylistImportHistoryRepository } from '../interfaces/PlaylistImportHistoryRepository';
import type { PlaylistImportOptions } from '../interfaces/PlaylistImporter';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportProgress } from '../models/PlaylistImportProgress';
import type { PlaylistImportStage } from '../models/PlaylistImportStage';
import type { PlaylistImportSession } from '../models/PlaylistImportSession';
import type { RepairSummary } from '../models/RepairSummary';

export class PlaylistImportWorkflow {
  constructor(
    private pipeline: PlaylistImportPipeline,
    private executor: PlaylistImportExecutor,
    private historyRepository?: PlaylistImportHistoryRepository
  ) {}

  async createPlanFromFile(
    filePath: string,
    options?: PlaylistImportOptions,
    onProgress?: ProgressListener
  ): Promise<PlaylistImportPlan> {
    return await this.pipeline.generatePlan(filePath, options, onProgress);
  }

  async executePlan(
    plan: PlaylistImportPlan,
    onProgress?: ProgressListener
  ): Promise<PlaylistImportExecutionResult> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = new Date();

    let session: PlaylistImportSession | null = null;
    if (this.historyRepository) {
      const repairSummary = this.computeRepairSummary(plan);
      session = {
        id: sessionId,
        sourceFile: plan.sourceFile ?? plan.playlistName,
        playlistName: plan.playlistName,
        startedAt,
        status: 'IN_PROGRESS',
        statistics: plan.statistics,
        warnings: plan.warnings,
        repairSummary
      };
      await this.historyRepository.saveSession(session);
    }

    try {
      this.emitProgress(onProgress, 'EXECUTING_IMPORT', 'Persisting imported playlist...', 50);

      const executionResult = await this.executor.execute(plan);

      this.emitProgress(onProgress, 'COMPLETED', 'Playlist imported successfully', 100);

      if (this.historyRepository && session) {
        await this.historyRepository.updateSession({
          ...session,
          status: 'COMPLETED',
          completedAt: new Date(),
          execution: executionResult
        });
      }

      return executionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitProgress(onProgress, 'FAILED', `Import execution failed: ${errorMessage}`, 0);

      if (this.historyRepository && session) {
        await this.historyRepository.updateSession({
          ...session,
          status: 'FAILED',
          completedAt: new Date()
        });
      }

      throw error;
    }
  }

  private computeRepairSummary(plan: PlaylistImportPlan): RepairSummary {
    let exactMatches = 0;
    let repairedMatches = 0;
    let highestConfidence = 0;
    let lowestConfidence = 100;
    const strategiesUsed = new Set<string>();

    for (const entry of plan.entries) {
      const match = entry.source.trackReference.libraryMatch;
      if (match.status === 'MATCHED') {
        if (match.matchType === 'REPAIRED') {
          repairedMatches++;
          if (match.confidence > highestConfidence) highestConfidence = match.confidence;
          if (match.confidence < lowestConfidence) lowestConfidence = match.confidence;

          for (const diag of match.diagnostics ?? []) {
            if (typeof diag === 'object' && diag.strategyName) {
              strategiesUsed.add(diag.strategyName);
            }
          }
        } else {
          exactMatches++;
        }
      }
    }

    return {
      repairedCount: repairedMatches,
      exactMatches,
      repairedMatches,
      highestConfidence: repairedMatches > 0 ? highestConfidence : 0,
      lowestConfidence: repairedMatches > 0 ? lowestConfidence : 0,
      strategiesUsed: Array.from(strategiesUsed)
    };
  }

  private emitProgress(
    listener: ProgressListener | undefined,
    stage: PlaylistImportStage,
    message: string,
    percentage: number
  ): void {
    if (listener) {
      listener({ stage, message, percentage });
    }
  }
}
