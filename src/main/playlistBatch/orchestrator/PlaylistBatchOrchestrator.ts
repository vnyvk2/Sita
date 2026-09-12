import path from 'path';

import type { BatchImportProgressPayload } from '../../../common/collections/types';
import type { CollectionEventBus } from '../../collections/events/CollectionEventBus';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import type { PlaylistImportWorkflow } from '../../playlistImport/workflow/PlaylistImportWorkflow';
import type { PlaylistSyncWorkflow } from '../../playlistSync/workflow/PlaylistSyncWorkflow';
import type { BatchExecutionPlan } from '../models/BatchExecutionPlan';
import type { BatchExecutionSummary } from '../models/BatchExecutionSummary';
import type { BatchSession } from '../models/BatchSession';

export interface BatchOrchestrationOptions {
  concurrency?: number;
  onProgress?: (progress: BatchImportProgressPayload) => void;
}

export class PlaylistBatchOrchestrator {
  private activeSessions = new Map<string, BatchSession>();
  private sessionProgressCallbacks = new Map<string, (progress: BatchImportProgressPayload) => void>();

  constructor(
    private importWorkflow?: PlaylistImportWorkflow,
    private syncWorkflow?: PlaylistSyncWorkflow,
    private playlistRepository?: PlaylistRepository,
    private eventBus?: CollectionEventBus
  ) {}

  async executeBatchPlan(
    plan: BatchExecutionPlan,
    options?: BatchOrchestrationOptions
  ): Promise<BatchExecutionSummary> {
    // Guard against concurrent batch runs
    for (const active of this.activeSessions.values()) {
      if (active.status === 'RUNNING' || active.status === 'CANCELLING') {
        throw new Error('A playlist batch import is already in progress.');
      }
    }

    const startTime = Date.now();
    const sessionId = `batch_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const session: BatchSession = {
      id: sessionId,
      plan,
      status: 'RUNNING',
      startedAt: new Date(),
      currentProcessed: 0,
      currentPlaylistName: ''
    };
    this.activeSessions.set(sessionId, session);

    if (options?.onProgress) {
      this.sessionProgressCallbacks.set(sessionId, options.onProgress);
    }

    const emitProgress = (payload: BatchImportProgressPayload) => {
      const cb = this.sessionProgressCallbacks.get(sessionId);
      if (cb) {
        try {
          cb(payload);
        } catch {
          // Progress listener error should not break the batch
        }
      }
    };

    // Initial progress event at t=0 so Cancel button and indicator are active immediately
    const firstFileName =
      plan.items.length > 0
        ? path.basename(plan.items[0].sourceFile, path.extname(plan.items[0].sourceFile))
        : '';
    session.currentPlaylistName = firstFileName;

    emitProgress({
      sessionId,
      current: 0,
      total: plan.items.length,
      currentPlaylistName: firstFileName,
      status: 'RUNNING'
    });

    let successfulCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let pausedCount = 0;
    let importedSongsCount = 0;
    const conflictNames: string[] = [];
    const failedDetails: { file: string; reason: string }[] = [];

    const itemMap = new Map(plan.items.map((i) => [i.id, i]));

    // Wrap loop in eventBus mute/unmute to prevent event storms
    this.eventBus?.mute();

    try {
      for (let i = 0; i < plan.executionOrder.length; i++) {
        const itemId = plan.executionOrder[i];
        const item = itemMap.get(itemId);
        if (!item) continue;

        if (session.status === 'CANCELLING' || session.status === 'CANCELLED') {
          item.status = 'SKIPPED';
          skippedCount++;
          continue;
        }

        if (session.status === 'PAUSED') {
          item.status = 'PAUSED';
          pausedCount++;
          continue;
        }

        item.status = 'RUNNING';
        const currentDisplayName = path.basename(item.sourceFile, path.extname(item.sourceFile));
        session.currentPlaylistName = currentDisplayName;
        session.currentProcessed = i;

        emitProgress({
          sessionId,
          current: i + 1,
          total: plan.items.length,
          currentPlaylistName: currentDisplayName,
          status: 'RUNNING'
        });

        try {
          if (item.action === 'IMPORT' && this.importWorkflow) {
            // Step 1: Single parse
            const importPlan = await this.importWorkflow.createPlanFromFile(item.sourceFile);

            // Step 2: Empty check (structural 0 tracks)
            if (!importPlan.entries || importPlan.entries.length === 0) {
              item.status = 'SKIPPED';
              item.error = 'Empty playlist';
              skippedCount++;
              failedDetails.push({ file: item.sourceFile, reason: 'Empty playlist (0 tracks)' });
              continue;
            }

            const playlistName = (importPlan.playlistName || currentDisplayName).trim();

            // Step 3: Conflict check (case-insensitive)
            if (this.playlistRepository) {
              const exists = await this.playlistRepository.existsByName(playlistName);
              if (exists) {
                item.status = 'SKIPPED';
                item.error = `Name conflict: '${playlistName}' already exists`;
                skippedCount++;
                conflictNames.push(playlistName);
                continue;
              }
            }

            // Step 4: Execute Plan
            const result = await this.importWorkflow.executePlan(importPlan);
            importedSongsCount += result.importedSongIds.length;
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
          const errorMsg = error instanceof Error ? error.message : String(error);
          item.error = errorMsg;
          failedCount++;
          failedDetails.push({ file: item.sourceFile, reason: errorMsg });

          if (plan.policy === 'STOP_ON_ERROR') {
            session.status = 'FAILED';
            break;
          }
        }
      }
    } finally {
      // Unmute and emit exactly one consolidated CollectionChanged event
      this.eventBus?.unmute(true);
    }

    // Terminal Status Decision Table:
    // FAILED iff successfulCount === 0 && failedCount > 0
    let finalStatus: 'COMPLETED' | 'CANCELLED' | 'FAILED';
    if (session.status === 'CANCELLING' || session.status === 'CANCELLED') {
      finalStatus = 'CANCELLED';
      session.status = 'CANCELLED';
    } else if (successfulCount === 0 && failedCount > 0) {
      finalStatus = 'FAILED';
      session.status = 'FAILED';
    } else {
      finalStatus = 'COMPLETED';
      session.status = 'COMPLETED';
    }
    session.completedAt = new Date();

    const summary: BatchExecutionSummary = {
      sessionId,
      batchId: plan.id,
      totalPlaylists: plan.items.length,
      successfulCount,
      failedCount,
      skippedCount,
      pausedCount,
      importedSongsCount,
      conflictNames,
      failedDetails,
      status: finalStatus,
      durationMs: Date.now() - startTime
    };

    session.summary = summary;

    // Terminal progress event for hook cleanup
    emitProgress({
      sessionId,
      current: plan.items.length,
      total: plan.items.length,
      currentPlaylistName: '',
      status: finalStatus
    });

    this.sessionProgressCallbacks.delete(sessionId);
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
      session.status = 'CANCELLING';
      // Instant progress event with CANCELLING status so UI updates immediately
      const cb = this.sessionProgressCallbacks.get(id);
      if (cb) {
        try {
          cb({
            sessionId: id,
            current: session.currentProcessed ?? 0,
            total: session.plan.items.length,
            currentPlaylistName: session.currentPlaylistName ?? '',
            status: 'CANCELLING'
          });
        } catch {
          // Ignore
        }
      }
      return true;
    }
    return false;
  }

  getActiveSession(): BatchSession | null {
    for (const session of this.activeSessions.values()) {
      if (
        session.status === 'RUNNING' ||
        session.status === 'PAUSED' ||
        session.status === 'CANCELLING'
      ) {
        return session;
      }
    }
    return null;
  }

  cancelActiveSession(): boolean {
    const active = this.getActiveSession();
    if (active) {
      return this.cancelSession(active.id);
    }
    return false;
  }
}

