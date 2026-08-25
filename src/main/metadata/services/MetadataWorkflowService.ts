import { EventEmitter } from 'events';
import type {
  MetadataWorkflow,
  WorkflowCandidate,
  WorkflowPreview,
  WorkflowType
} from '../workflows/MetadataWorkflow';
import type { LocalSongInput } from './AlbumMetadataService';
import type { MetadataTransactionManager, TransactionExecutionOptions, TransactionResult } from '../transactions/MetadataTransactionManager';
import type { MetadataOperationManager } from '../operations/MetadataOperationManager';
import type { ProgressEventPayload } from '../models/AlbumTagPreview';
import type { ApplyResult } from './MetadataApplyService';
import { runExclusiveMetadataApply } from '../../utils/metadataApplyMutex';

export interface MetadataWorkflowServiceOptions {
  transactionManager: MetadataTransactionManager;
  operationManager?: MetadataOperationManager;
}

export class MetadataWorkflowService extends EventEmitter {
  private readonly workflows: Map<WorkflowType, MetadataWorkflow> = new Map();
  private readonly transactionManager: MetadataTransactionManager;
  private readonly activeOperations: Map<string, AbortController> = new Map();

  constructor(options: MetadataWorkflowServiceOptions) {
    super();
    this.transactionManager = options.transactionManager;
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
    return runExclusiveMetadataApply(() =>
      this.applyPreviewInternal(workflowType, preview, selectedFieldIds, options, operationId)
    );
  }

  private async applyPreviewInternal(
    workflowType: WorkflowType,
    preview: WorkflowPreview,
    selectedFieldIds?: string[],
    options?: TransactionExecutionOptions,
    operationId = 'default'
  ): Promise<ApplyResult> {
    const signal = this.createAbortSignal(operationId);
    const workflow = this.getWorkflow(workflowType);
    this.emitProgress('applying', `Applying updates for ${workflow.displayName}...`, 85, operationId);

    const mutations = workflow.buildMutations(preview, selectedFieldIds);
    const txResult: TransactionResult = await this.transactionManager.executeTransaction(
      operationId,
      mutations,
      options,
      signal
    );

    const result: ApplyResult = {
      success: txResult.success,
      updatedCount: txResult.updatedCount,
      failedCount: txResult.failedCount,
      errors: txResult.errors
    };

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
