import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { playlists, playlistEntries, smartPlaylistRules } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { DuplicatePlanner } from './DuplicatePlanner';
import { DuplicateExecutor } from './DuplicateExecutor';

export interface DuplicateInput {
  playlistId: number;
}

const MAX_DEPTH = 50;

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

    // 1. Plan
    const plan = await this.planner.plan(playlistId);

    // 2. Execute
    const { rootNewId, affectedSongIds } = await this.executor.execute(
      ctx.trx,
      plan.nodes,
      plan.rootNode.id
    );

    return {
      data: rootNewId,
      collectionId: `local:playlist:${rootNewId}` as any,
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
