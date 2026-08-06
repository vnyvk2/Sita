import type { MetadataOperation, OperationType, ExecutionMode, OperationState } from '../domain/MetadataOperation';
import type { MetadataPolicy } from '../domain/MetadataPolicy';
import type { MetadataResolutionManager } from '../resolution/MetadataResolutionManager';
import type { LookupQueryOptions } from '../resolution/MetadataLookupGateway';
import type { MetadataResolution } from '../domain/MetadataResolution';

export type OperationEventListener = (event: string, payload: unknown) => void;

export class MetadataOperationManager {
  private readonly operations: Map<string, MetadataOperation> = new Map();
  private readonly resolutionManager?: MetadataResolutionManager;
  private readonly listeners: Set<OperationEventListener> = new Set();

  constructor(resolutionManager?: MetadataResolutionManager) {
    this.resolutionManager = resolutionManager;
  }

  public subscribe(listener: OperationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: string, payload: unknown): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event, payload);
      } catch (_err) {
        // Ignore listener errors
      }
    });
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
    this.notify('operation:created', operation);
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
    this.notify('operation:state', updated);
    return updated;
  }

  public async executeResolution(
    id: string,
    options: LookupQueryOptions
  ): Promise<MetadataResolution | undefined> {
    const op = this.operations.get(id);
    if (!op) return undefined;

    this.updateState(id, 'Searching', 'Searching candidates across providers...', 20);

    if (!this.resolutionManager) {
      this.updateState(id, 'Failed', 'Resolution manager unavailable', 0);
      return undefined;
    }

    try {
      const resolution = await this.resolutionManager.resolveCandidates(
        id,
        op.targetResourceIds[0] ?? 0,
        options
      );

      this.updateState(id, 'Resolving', `Resolved ${resolution.candidates.length} candidates`, 60);
      this.updateState(id, 'PreviewReady', 'Preview ready for review', 80);
      return resolution;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateState(id, 'Failed', `Resolution failed: ${msg}`, 0);
      return undefined;
    }
  }

  public getOperation(id: string): MetadataOperation | undefined {
    return this.operations.get(id);
  }

  public listOperations(): MetadataOperation[] {
    return Array.from(this.operations.values());
  }
}
