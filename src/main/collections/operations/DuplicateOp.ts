import { createCollectionId } from '../../../common/collections/id';
import type { DuplicateInput } from '../../../common/collections/operationInputs';
import { DuplicateExecutor } from './DuplicateExecutor';
import { DuplicatePlanner } from './DuplicatePlanner';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export class DuplicateOp implements CollectionOperation<DuplicateInput, number> {
  private planner: DuplicatePlanner;
  private executor: DuplicateExecutor;

  constructor(
    planner: DuplicatePlanner = new DuplicatePlanner(),
    executor: DuplicateExecutor = new DuplicateExecutor()
  ) {
    this.planner = planner;
    this.executor = executor;
  }

  public async execute(
    input: DuplicateInput,
    ctx: OperationContext
  ): Promise<OperationResult<number>> {
    const { playlistId } = input;

    // 1. Plan - ctx.trx is mandatory: planning queries the hierarchy, and the
    // global connection is held by this transaction on PGlite (single-connection
    // engine) - using it would self-deadlock.
    const plan = await this.planner.plan(playlistId, ctx.trx);

    // 2. Execute
    const { rootNewId, affectedSongIds } = await this.executor.execute(
      ctx.trx,
      plan.nodes,
      plan.rootNode.id
    );

    return {
      data: rootNewId,
      collectionId: createCollectionId('local', 'playlist', rootNewId),
      operationType: 'playlist.duplicate',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.delete',
        input: { playlistId: rootNewId }
      },
      version: 1,
      affectedSongIds
    };
  }
}
