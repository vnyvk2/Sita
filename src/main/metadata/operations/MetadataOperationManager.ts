import { EventEmitter } from 'events';
import type { MetadataOperation, OperationType, ExecutionMode, OperationState } from '../domain/MetadataOperation';
import type { MetadataPolicy } from '../domain/MetadataPolicy';
import type { MetadataResolutionManager, ResolutionOptions } from '../resolution/MetadataResolutionManager';
import type { MetadataResolution } from '../domain/MetadataResolution';

export class MetadataOperationManager extends EventEmitter {
  private readonly operations: Map<string, MetadataOperation> = new Map();
  private readonly resolutionManager?: MetadataResolutionManager;

  constructor(resolutionManager?: MetadataResolutionManager) {
    super();
    this.resolutionManager = resolutionManager;
  }

  public createOperation(
    id: string,
    type: OperationType,
    targetResourceIds: (string | number)[],
    mode: ExecutionMode = 'Interactive',
    policy?: MetadataPolicy
  ): MetadataOperation {
    const operation: MetadataOperation = {
      id,
      type,
      mode,
      targetResourceIds,
      policy,
      state: 'Created',
      progressMessage: 'Operation created',
      progressPercent: 0,
      createdAt: Date.now()
    };

    this.operations.set(id, operation);
    this.emit('operation:created', operation);
    return operation;
  }

  public updateState(
    id: string,
    nextState: OperationState,
    message?: string,
    percent?: number
  ): MetadataOperation | undefined {
    const existing = this.operations.get(id);
    if (!existing) return undefined;

    const updated: MetadataOperation = {
      ...existing,
      state: nextState,
      progressMessage: message ?? existing.progressMessage,
      progressPercent: percent ?? existing.progressPercent,
      startedAt: nextState === 'Searching' && !existing.startedAt ? Date.now() : existing.startedAt,
      completedAt:
        nextState === 'Completed' || nextState === 'Failed' || nextState === 'Cancelled' || nextState === 'Undone'
          ? Date.now()
          : existing.completedAt
    };

    this.operations.set(id, updated);
    this.emit('operation:state', updated);
    return updated;
  }

  public async executeResolution(
    id: string,
    options: ResolutionOptions
  ): Promise<MetadataResolution | undefined> {
    const op = this.operations.get(id);
    if (!op) return undefined;

    this.updateState(id, 'Searching', 'Searching candidates across providers...', 20);

    if (!this.resolutionManager) {
      this.updateState(id, 'Resolving', 'Candidate resolution complete', 50);
      return {
        operationId: id,
        resourceId: op.targetResourceIds[0] ?? 0,
        candidates: [],
        resolvedAt: Date.now()
      };
    }

    const resolution = await this.resolutionManager.resolveCandidates(
      id,
      op.targetResourceIds[0] ?? 0,
      options
    );

    this.updateState(id, 'Resolving', `Resolved ${resolution.candidates.length} candidates`, 60);
    this.updateState(id, 'PreviewReady', 'Preview ready for review', 80);

    return resolution;
  }

  public getOperation(id: string): MetadataOperation | undefined {
    return this.operations.get(id);
  }

  public listOperations(): MetadataOperation[] {
    return Array.from(this.operations.values());
  }
}
