import type { PlaylistImportPipeline, ProgressListener } from '../pipeline/PlaylistImportPipeline';
import type { PlaylistImportExecutor } from '../executor/PlaylistImportExecutor';
import type { PlaylistImportSessionService } from '../services/PlaylistImportSessionService';
import type { PlaylistImportOptions } from '../interfaces/PlaylistImporter';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportStage } from '../models/PlaylistImportStage';
import type { PlaylistImportSession } from '../models/PlaylistImportSession';

export interface ImportExecutionSummary {
  playlistId: number;
  playlistName: string;
  importedCount: number;
  repairedCount: number;
  skippedCount: number;
  totalPlanned: number;
}

export class PlaylistImportWorkflow {
  constructor(
    private pipeline: PlaylistImportPipeline,
    private executor: PlaylistImportExecutor,
    private sessionService?: PlaylistImportSessionService
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
    onProgress?: ProgressListener,
    options?: PlaylistImportOptions
  ): Promise<PlaylistImportExecutionResult> {
    let session: PlaylistImportSession | undefined;

    if (this.sessionService) {
      session = await this.sessionService.startSession(plan);
    }

    try {
      this.emitProgress(onProgress, 'EXECUTING_IMPORT', 'Persisting imported playlist...', 50);

      const executionResult = await this.executor.execute(plan, options);

      this.emitProgress(onProgress, 'COMPLETED', 'Playlist imported successfully', 100);

      if (this.sessionService && session) {
        await this.sessionService.completeSession(session.id, executionResult);
      }

      return executionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitProgress(onProgress, 'FAILED', `Import execution failed: ${errorMessage}`, 0);

      if (this.sessionService && session) {
        await this.sessionService.failSession(session.id);
      }

      throw error;
    }
  }

  async importFile(
    filePath: string,
    options?: PlaylistImportOptions,
    onProgress?: ProgressListener
  ): Promise<ImportExecutionSummary> {
    const plan = await this.createPlanFromFile(filePath, options, onProgress);
    const executionResult = await this.executePlan(plan, onProgress, options);

    return {
      playlistId: executionResult.playlistId,
      playlistName: executionResult.playlistName,
      importedCount: executionResult.statistics.importedEntriesCount,
      repairedCount: plan.statistics.repairedEntries,
      skippedCount: executionResult.statistics.skippedEntriesCount,
      totalPlanned: plan.statistics.totalEntries
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
