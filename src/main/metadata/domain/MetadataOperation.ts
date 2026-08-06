import type { MetadataPolicy } from './MetadataPolicy';
import type { MetadataContext } from './MetadataContext';

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

export interface MetadataOperation {
  readonly id: string;
  readonly type: OperationType;
  readonly mode: ExecutionMode;
  readonly targetResourceIds: (string | number)[];
  readonly context: MetadataContext;
  readonly policy?: MetadataPolicy;
  readonly state: OperationState;
  readonly progressMessage: string;
  readonly progressPercent: number;
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
}
