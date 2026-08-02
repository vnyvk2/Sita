import type { PlaylistImportWorkflow } from '../../playlistImport/workflow/PlaylistImportWorkflow';
import type { PlaylistSyncWorkflow } from '../../playlistSync/workflow/PlaylistSyncWorkflow';
import type { BatchExecutionPlan } from '../models/BatchExecutionPlan';
import type { BatchSession } from '../models/BatchSession';
import type { BatchExecutionSummary } from '../models/BatchExecutionSummary';
import type { BatchItem } from '../models/BatchItem';

export interface BatchOrchestrationOptions {
  concurrency?: number;
}

export class PlaylistBatchOrchestrator {
  private activeSessions = new Map<string, BatchSession>();

  constructor(
    private importWorkflow?: PlaylistImportWorkflow,
    private syncWorkflow?: PlaylistSyncWorkflow
  ) {}

  async executeBatchPlan(
    plan: BatchExecutionPlan,
    options?: BatchOrchestrationOptions
  ): Promise<BatchExecutionSummary> {
    const startTime = Date.now();
    const sessionId = `batch_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const session: BatchSession = {
      id: sessionId,
      plan,
      status: 'RUNNING',
      startedAt: new Date()
    };
    this.activeSessions.set(sessionId, session);

    let successfulCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let pausedCount = 0;
    let importedSongsCount = 0;

    const itemMap = new Map(plan.items.map((i) => [i.id, i]));

    for (const itemId of plan.executionOrder) {
      const item = itemMap.get(itemId);
      if (!item) continue;

      if (session.status === 'PAUSED') {
        item.status = 'PAUSED';
        pausedCount++;
        continue;
      }

      if (session.status === 'CANCELLED') {
        item.status = 'SKIPPED';
        skippedCount++;
        continue;
      }

      item.status = 'RUNNING';

      try {
        if (item.action === 'IMPORT' && this.importWorkflow) {
          const importPlan = await this.importWorkflow.createPlanFromFile(item.sourceFile);
          const result = await this.importWorkflow.executePlan(importPlan);
          importedSongsCount += result.importedEntriesCount;
          item.status = 'COMPLETED';
          successfulCount++;
        } else if (item.action === 'SYNC' && this.syncWorkflow && item.playlistId !== undefined) {
          const link = {
            id: `link_${item.playlistId}`,
            playlistId: item.playlistId,
            sourceFile: item.sourceFile,
            format: 'm3u',
            lastImportedAt: new Date(),
            syncPolicy: 'ONE_WAY_SOURCE_WINS' as const
          };

          const preview = await this.syncWorkflow.previewSync(link, []);
          if (preview?.resolvedPlan) {
            const syncResult = await this.syncWorkflow.executeSyncPlan(preview.resolvedPlan);
            importedSongsCount += syncResult.appliedAdditionsCount;
          }

          item.status = 'COMPLETED';
          successfulCount++;
        } else {
          item.status = 'COMPLETED';
          successfulCount++;
        }
      } catch (error) {
        item.status = 'FAILED';
        item.error = error instanceof Error ? error.message : String(error);
        failedCount++;

        if (plan.policy === 'STOP_ON_ERROR') {
          session.status = 'FAILED';
          break;
        }
      }
    }

    if (session.status !== 'FAILED' && session.status !== 'CANCELLED') {
      session.status = 'COMPLETED';
    }
    session.completedAt = new Date();

    const summary: BatchExecutionSummary = {
      batchId: plan.id,
      totalPlaylists: plan.items.length,
      successfulCount,
      failedCount,
      skippedCount,
      pausedCount,
      importedSongsCount,
      durationMs: Date.now() - startTime
    };

    session.summary = summary;
    return summary;
  }

  getSession(id: string): BatchSession | null {
    const session = this.activeSessions.get(id);
    return session ? JSON.parse(JSON.stringify(session)) : null;
  }

  pauseSession(id: string): boolean {
    const session = this.activeSessions.get(id);
    if (session && session.status === 'RUNNING') {
      session.status = 'PAUSED';
      return true;
    }
    return false;
  }

  resumeSession(id: string): boolean {
    const session = this.activeSessions.get(id);
    if (session && session.status === 'PAUSED') {
      session.status = 'RUNNING';
      return true;
    }
    return false;
  }

  cancelSession(id: string): boolean {
    const session = this.activeSessions.get(id);
    if (session && (session.status === 'RUNNING' || session.status === 'PAUSED')) {
      session.status = 'CANCELLED';
      return true;
    }
    return false;
  }
}
