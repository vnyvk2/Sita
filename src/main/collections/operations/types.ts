import type { MembershipService } from '../membership/MembershipService';
import type { CollectionId } from '../../../common/collections/types';

export type OperationType =
  | 'playlist.addSongs'
  | 'playlist.removeSongs'
  | 'playlist.rename'
  | 'playlist.reorder'
  | 'playlist.delete'
  | 'playlist.restore'
  | 'playlist.restoreSongs'
  | 'playlist.updateSmartRule';

export interface OperationContext {
  trx: DBTransaction;
  membershipService: MembershipService;
}

export interface OperationInverseInput {
  operationType: OperationType;
  input: unknown;
}

export interface OperationResult<T> {
  data: T;
  collectionId: CollectionId;
  operationType: OperationType;
  operationInput: Record<string, unknown>;
  inverseInput: OperationInverseInput;
  version: number;
  affectedSongIds: readonly number[];
}

export interface CollectionOperation<TInput, TResult> {
  execute(
    input: TInput,
    ctx: OperationContext
  ): Promise<OperationResult<TResult>>;
}
