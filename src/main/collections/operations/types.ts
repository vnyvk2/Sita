import type { MembershipService } from '../membership/MembershipService';
import type { CollectionId } from '../../../common/collections/types';

export type OperationType =
  | 'playlist.addSongs'
  | 'playlist.removeSongs'
  | 'playlist.rename'
  | 'playlist.reorder'
  | 'playlist.delete';

export interface OperationContext {
  trx: DBTransaction;
  membershipService: MembershipService;
}

export type OperationReverseData = Record<string, unknown>;

export interface OperationResult<T> {
  data: T;
  collectionId: CollectionId;
  operationType: OperationType;
  operationInput: Record<string, unknown>;
  reverseData: OperationReverseData;
  version: number;
  affectedSongIds: readonly number[];
}

export interface CollectionOperation<TInput, TResult> {
  execute(
    input: TInput,
    ctx: OperationContext
  ): Promise<OperationResult<TResult>>;
}
