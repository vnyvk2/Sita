import type { MetadataPolicy } from './MetadataPolicy';

export type OperationType =
  | 'ManualEdit'
  | 'AlbumResolution'
  | 'TrackResolution'
  | 'BatchEdit'
  | 'ArtworkReplace'
  | 'GenreCleanup'
  | 'DuplicateResolution'
  | 'BackgroundEnrichment'
  | 'LibraryScan';

export type OperationState =
  | 'Created'
  | 'Searching'
  | 'Resolving'
  | 'Merging'
  | 'PreviewReady'
  | 'Validating'
  | 'Applying'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'Undone';

export type ExecutionMode = 'Interactive' | 'Batch' | 'Background' | 'Scheduled';

export class MetadataOperation {
  public readonly id: string;
  public readonly type: OperationType;
  public readonly mode: ExecutionMode;
  public readonly policy: MetadataPolicy;
  public state: OperationState;
  public progressMessage: string;
  public progressPercent: number;
  public readonly createdAt: number;
  public startedAt?: number;
  public completedAt?: number;

  constructor(
    id: string,
    type: OperationType,
    mode: ExecutionMode = 'Interactive',
    policy: MetadataPolicy
  ) {
    this.id = id;
    this.type = type;
    this.mode = mode;
    this.policy = policy;
    this.state = 'Created';
    this.progressMessage = 'Operation initialized';
    this.progressPercent = 0;
    this.createdAt = Date.now();
  }

  public transitionTo(nextState: OperationState, message?: string, percent?: number): void {
    this.state = nextState;
    if (message !== undefined) this.progressMessage = message;
    if (percent !== undefined) this.progressPercent = percent;

    if (nextState === 'Searching' && !this.startedAt) {
      this.startedAt = Date.now();
    }
    if (nextState === 'Completed' || nextState === 'Failed' || nextState === 'Cancelled' || nextState === 'Undone') {
      this.completedAt = Date.now();
    }
  }
}
