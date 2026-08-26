import { EventEmitter } from 'events';
import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowPreview,
  WorkflowType
} from '../workflows/MetadataWorkflow';
import type { LocalSongInput } from './AlbumMetadataService';
import type { MetadataTransactionManager, TransactionExecutionOptions } from '../transactions/MetadataTransactionManager';
import type { MetadataOperationManager } from '../operations/MetadataOperationManager';
import type { ProgressEventPayload } from '../models/AlbumTagPreview';
import type { ApplyResult } from './MetadataApplyService';
import type { MetadataApplyOrchestrator } from '../apply/MetadataApplyOrchestrator';
import type { ApplyFieldId } from '../apply/contract';

export interface MetadataWorkflowServiceOptions {
  transactionManager: MetadataTransactionManager;
  operationManager?: MetadataOperationManager;
  orchestrator?: MetadataApplyOrchestrator;
}

export class MetadataWorkflowService extends EventEmitter {
  private readonly workflows: Map<WorkflowType, MetadataWorkflow> = new Map();
  private readonly transactionManager: MetadataTransactionManager;
  private readonly activeOperations: Map<string, AbortController> = new Map();
  private readonly orchestrator?: MetadataApplyOrchestrator;

  constructor(options: MetadataWorkflowServiceOptions) {
    super();
    this.transactionManager = options.transactionManager;
    this.orchestrator = options.orchestrator;
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
    this.emitProgress('search', `Searching metadata for ${workflow.displayName}...`, 10, operationId);

    const candidates = await workflow.search(query, signal);
    this.emitProgress('search_completed', `Found ${candidates.length} candidates.`, 40, operationId);
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
    this.emitProgress('diffing', `Building preview diffs for ${workflow.displayName}...`, 60, operationId);

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
    this.emitProgress('applying', `Applying updates for ${workflow.displayName}...`, 85, operationId);

    // 2c P2: workflow mutations flow through the single authoritative
    // orchestrator. Legacy TransactionManager remains for direct engine tests
    // until P4 cleanup.
    if (!this.orchestrator) {
      throw new Error('[MetadataWorkflowService] Orchestrator not configured');
    }

    const rawMutations = workflow.buildMutations(preview, selectedFieldIds);
    const normalized = rawMutations.map((rm, idx) => ({
      mutationId: `${operationId}:${String(rm.resourceId)}:${idx}`,
      operationId,
      songId: Number(rm.resourceId),
      filePath: rm.filePath ?? '',
      fields: rm.fieldMutations
        .filter((fm) => fm.newValue !== undefined)
        .map((fm) => ({
          fieldId: fm.fieldId as ApplyFieldId,
          oldValue: fm.oldValue ?? null,
          newValue: fm.newValue as string | number,
          providerId: fm.providerId,
          confidenceScore: fm.confidenceScore
        })),
      ...(rm.artworkBuffer !== undefined && { artwork: { buffer: rm.artworkBuffer } }),
      fileWrite: { deferredIfPlaying: true },
      undo: { description: `Workflow ${workflowType} apply (${operationId})` }
    }));

    const orchRes = await this.orchestrator.execute(normalized);

    const result: ApplyResult = {
      success: orchRes.success,
      updatedCount: orchRes.updatedCount,
      failedCount: orchRes.failedCount,
      errors: orchRes.errors
    };
    void signal;

    if (result.success) {
      this.emitProgress('completed', `Successfully updated ${result.updatedCount} items.`, 100, operationId);
    } else {
      this.emitProgress('failed', `Apply failed: ${result.errors.join('; ')}`, 100, operationId);
    }

    return result;
  }

  public async undoLastAutoTag(_operationId = 'default'): Promise<{ success: boolean; revertedCount: number; errors: string[] }> {
    return this.transactionManager.rollbackLastTransaction();
  }

  private emitProgress(stage: string, message: string, progress: number, operationId: string): void {
    const payload: ProgressEventPayload = {
      stage: stage as any,
      message,
      progressPercent: progress,
      operationId
    };
    this.emit('progress', payload);
  }
}
