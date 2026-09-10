import type { CollectionId } from '../../../common/collections/types';
import type { MembershipService } from '../membership/MembershipService';

export type OperationType =
  | 'playlist.addSongs'
  | 'playlist.removeSongs'
  | 'playlist.rename'
  | 'playlist.reorder'
  | 'playlist.delete'
  | 'playlist.restore'
  | 'playlist.restoreSongs'
  | 'playlist.updateSmartRule'
  | 'playlist.createFolder'
  | 'playlist.createPlaylist'
  | 'playlist.createSmartPlaylist'
  | 'playlist.move'
  | 'playlist.restoreMove'
  | 'playlist.bulkDelete'
  | 'playlist.bulkRestore'
  | 'playlist.duplicate'
  | 'playlist.merge'
  | 'playlist.snapshot'
  | 'playlist.setArtwork'
  | 'playlist.updateSidebarPositions'
  | 'playlist.restoreSidebarPositions'
  | 'playlist.pin'
  | 'playlist.unpin';

export interface OperationContext {
  trx: DBTransaction;
  membershipService: MembershipService;
}

export interface OperationInverseInput {
  operationType: OperationType;
  input: unknown;
}

export interface OperationStatsDelta {
  targetPlaylistId: number;
  itemCountDelta: number;
  durationDelta: number;
}

export interface OperationResult<T> {
  data: T;
  collectionId: CollectionId;
  operationType: OperationType;
  operationInput: Record<string, unknown>;
  inverseInput: OperationInverseInput;
  version: number;
  affectedSongIds: readonly number[];
  statsDelta?: OperationStatsDelta;
}

export interface CollectionOperation<TInput, TResult> {
  execute(input: TInput, ctx: OperationContext): Promise<OperationResult<TResult>>;
}
