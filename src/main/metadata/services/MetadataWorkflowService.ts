import { EventEmitter } from 'events';

import type { ApplyFieldId } from '../apply/contract';
import type { MetadataApplyOrchestrator } from '../apply/MetadataApplyOrchestrator';
import type { ProgressEventPayload } from '../models/AlbumTagPreview';
import type { MetadataOperationManager } from '../operations/MetadataOperationManager';
import type {
  MetadataTransactionManager,
  TransactionExecutionOptions
} from '../transactions/MetadataTransactionManager';
import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowPreview,
  WorkflowType
} from '../workflows/MetadataWorkflow';
import type { LocalSongInput } from './AlbumMetadataService';
import type { CoverArtBufferService } from './CoverArtBufferService';
import type { ApplyResult } from './MetadataApplyService';

export interface MetadataWorkflowServiceOptions {
  transactionManager: MetadataTransactionManager;
  operationManager?: MetadataOperationManager;
  orchestrator?: MetadataApplyOrchestrator;
  coverArtBufferService?: CoverArtBufferService;
  /**
   * DEF-TAG-06: workflow applies journal through the orchestrator into the shared
   * MetadataHistoryService. Undo must read that same journal, so the shared apply service (which
   * owns the undo path) is injected here instead of consulting the transaction manager's untouched
   * stack.
   */
  applyService?: {
    undoLastAutoTag: () => Promise<{ success: boolean; restoredCount: number; errors?: string[] }>;
  };
}

export class MetadataWorkflowService extends EventEmitter {
  private readonly workflows: Map<WorkflowType, MetadataWorkflow> = new Map();
  private readonly transactionManager: MetadataTransactionManager;
  private readonly activeOperations: Map<string, AbortController> = new Map();
  private readonly orchestrator?: MetadataApplyOrchestrator;
  private readonly coverArtBufferService?: CoverArtBufferService;
  private readonly applyService?: MetadataWorkflowServiceOptions['applyService'];

  constructor(options: MetadataWorkflowServiceOptions) {
    super();
    this.transactionManager = options.transactionManager;
    this.orchestrator = options.orchestrator;
    this.coverArtBufferService = options.coverArtBufferService;
    this.applyService = options.applyService;
  }

  public registerWorkflow(workflow: MetadataWorkflow): void {
    this.workflows.set(workflow.type, workflow);
  }

  public getWorkflow(type: WorkflowType): MetadataWorkflow {
    const workflow = this.workflows.get(type);
    if (!workflow) {
      throw new Error(`[MetadataWorkflowService] Unsupported workflow type: ${type}`);
    }
    return workflow;
  }

  public createAbortSignal(operationId: string): AbortSignal {
    this.cancel(operationId);
    const controller = new AbortController();
    this.activeOperations.set(operationId, controller);
    return controller.signal;
  }

  public cancel(operationId: string): void {
    const active = this.activeOperations.get(operationId);
    if (active) {
      active.abort();
      this.activeOperations.delete(operationId);
    }
  }

  public async search(
    workflowType: WorkflowType,
    query: { title?: string; artist?: string; album?: string; limit?: number },
    operationId = 'default'
  ): Promise<WorkflowCandidate[]> {
    const signal = this.createAbortSignal(operationId);
    const workflow = this.getWorkflow(workflowType);
    this.emitProgress(
      'search',
      `Searching metadata for ${workflow.displayName}...`,
      10,
      operationId
    );

    const candidates = await workflow.search(query, signal);
    this.emitProgress(
      'search_completed',
      `Found ${candidates.length} candidates.`,
      40,
      operationId
    );
    return candidates;
  }

  public async buildPreview(
    workflowType: WorkflowType,
    localSongs: LocalSongInput[],
    candidateId: string,
    providerId?: string,
    operationId = 'default'
  ): Promise<WorkflowPreview> {
    const signal = this.createAbortSignal(operationId);
    const workflow = this.getWorkflow(workflowType);
    this.emitProgress(
      'diffing',
      `Building preview diffs for ${workflow.displayName}...`,
      60,
      operationId
    );

    const preview = await workflow.buildPreview(localSongs, candidateId, providerId as any, signal);
    this.emitProgress('diff_completed', 'Preview diff generated.', 80, operationId);
    return preview;
  }

  public async applyPreview(
    workflowType: WorkflowType,
    preview: WorkflowPreview,
    selectedFieldIds?: string[],
    options?: TransactionExecutionOptions,
    operationId = 'default'
  ): Promise<ApplyResult> {
    // Mutex ownership belongs solely to MetadataApplyOrchestrator.execute -
    // wrapping here too self-rejected every workflow apply (audit P0 #1).
    return this.applyPreviewInternal(workflowType, preview, selectedFieldIds, options, operationId);
  }

  private async applyPreviewInternal(
    workflowType: WorkflowType,
    preview: WorkflowPreview,
    selectedFieldIds?: string[],
    _options?: TransactionExecutionOptions,
    operationId = 'default'
  ): Promise<ApplyResult> {
    const signal = this.createAbortSignal(operationId);
    const workflow = this.getWorkflow(workflowType);
    this.emitProgress(
      'applying',
      `Applying updates for ${workflow.displayName}...`,
      85,
      operationId
    );

    // 2c P2: workflow mutations flow through the single authoritative
    // orchestrator. Legacy TransactionManager remains for direct engine tests
    // until P4 cleanup.
    if (!this.orchestrator) {
      throw new Error('[MetadataWorkflowService] Orchestrator not configured');
    }

    const rawMutations = workflow.buildMutations(preview, selectedFieldIds);

    if (this.coverArtBufferService) {
      for (const rm of rawMutations) {
        if (!rm.artworkBuffer) {
          const artField = rm.fieldMutations.find(
            (fm) =>
              (fm.fieldId === 'artworkUrl' || fm.fieldId === 'artworkPath') &&
              typeof fm.newValue === 'string' &&
              fm.newValue.startsWith('http')
          );
          const targetUrl =
            (artField?.newValue as string | undefined) ?? preview.primaryCandidate?.coverArtUrl;
          if (targetUrl) {
            const buf = await this.coverArtBufferService.fetchBuffer(targetUrl);
            if (buf) {
              rm.artworkBuffer = buf;
            }
          }
        }
      }
    }

    const normalized = rawMutations.map((rm, idx) => {
      const artField = rm.fieldMutations.find(
        (fm) => fm.fieldId === 'artworkUrl' || fm.fieldId === 'artworkPath'
      );
      const targetUrl =
        (artField?.newValue as string | undefined) ?? preview.primaryCandidate?.coverArtUrl;

      return {
        mutationId: `${operationId}:${String(rm.resourceId)}:${idx}`,
        operationId,
        songId: Number(rm.resourceId),
        filePath: rm.filePath ?? '',
        // DEF-TAG-11/12: mirror the album-path contract - empty values never travel
        // as field mutations (Number('') === 0 would write track 0/year 0). The
        // normalized contract carries no explicit clear sentinel, so empties mean
        // "leave untouched" on every path.
        fields: rm.fieldMutations
          .filter((fm) => fm.newValue !== undefined && String(fm.newValue).trim() !== '')
          .map((fm) => ({
            fieldId: fm.fieldId as ApplyFieldId,
            oldValue: fm.oldValue ?? null,
            newValue: fm.newValue as string | number,
            providerId: fm.providerId,
            confidenceScore: fm.confidenceScore
          })),
        ...(rm.artworkBuffer !== undefined && { artwork: { buffer: rm.artworkBuffer } }),
        ...(targetUrl !== undefined && { artworkUrl: targetUrl }),
        fileWrite: { deferredIfPlaying: true },
        undo: { description: `Workflow ${workflowType} apply (${operationId})` }
      };
    });

    const orchRes = await this.orchestrator.execute(normalized);

    const result: ApplyResult = {
      success: orchRes.success,
      updatedCount: orchRes.updatedCount,
      failedCount: orchRes.failedCount,
      errors: orchRes.errors
    };
    void signal;

    if (result.success) {
      this.emitProgress(
        'completed',
        `Successfully updated ${result.updatedCount} items.`,
        100,
        operationId
      );
    } else {
      this.emitProgress('failed', `Apply failed: ${result.errors.join('; ')}`, 100, operationId);
    }

    return result;
  }

  public async undoLastAutoTag(
    _operationId = 'default'
  ): Promise<{ success: boolean; revertedCount: number; errors: string[] }> {
    // DEF-TAG-06: applyPreview journals via the orchestrator into the shared
    // history service, so undo delegates to the shared apply service (same
    // journal). The transaction manager's stack is only a fallback for legacy
    // direct-transaction callers.
    if (this.applyService) {
      const res = await this.applyService.undoLastAutoTag();
      return { success: res.success, revertedCount: res.restoredCount, errors: res.errors ?? [] };
    }
    return this.transactionManager.rollbackLastTransaction();
  }

  private emitProgress(
    stage: string,
    message: string,
    progress: number,
    operationId: string
  ): void {
    const payload: ProgressEventPayload = {
      stage: stage as any,
      message,
      progressPercent: progress,
      operationId
    };
    this.emit('progress', payload);
  }
}
