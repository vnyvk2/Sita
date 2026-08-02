import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { createCollectionId } from '../../../common/collections/id';
import { DeleteOp } from './DeleteOp';
import { RestorePlaylistOp, type RestorePlaylistInput } from './RestorePlaylistOp';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { HierarchyService } from '../engine/HierarchyService';

import logger from '../../logger';

export interface BulkDeleteInput {
  playlistIds: number[];
}

export class BulkDeleteOp implements CollectionOperation<BulkDeleteInput, void> {
  private repository: PlaylistRepository;
  private resolver: HierarchyService;

  constructor(
    repository: PlaylistRepository = new PlaylistRepository(),
    resolver: HierarchyService = new HierarchyService()
  ) {
    this.repository = repository;
    this.resolver = resolver;
  }

  public async execute(
    input: BulkDeleteInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistIds } = input;

    // 1. Gather all descendants (flatten the tree)
    const allIdsToDelete = new Set<number>();
    
    for (const id of playlistIds) {
      allIdsToDelete.add(id);
      const descendants = await this.resolver.getDescendants(id, ctx.trx);
      for (const d of descendants) {
        allIdsToDelete.add(d.id);
      }
    }

    const idsArray = Array.from(allIdsToDelete);
    logger.info('[BulkDeleteOp] Executing bulk delete', { playlistIds, idsArray });
    const deleteOp = new DeleteOp(this.repository);
    const inverseInputs: RestorePlaylistInput[] = [];
    const allAffectedSongIds = new Set<number>();

    // 2. Delete bottom-up (simplifies constraint handling, though DB cascade handles it)
    // Actually we can just rely on the DB, but to get all the data for restore we iterate.
    for (const id of idsArray) {
      // Execute individual DeleteOps and aggregate their inverses
      const result = await deleteOp.execute({ playlistId: id }, ctx);
      
      const restoreInput = result.inverseInput as { input: RestorePlaylistInput };
      inverseInputs.push(restoreInput.input);
      
      if (result.affectedSongIds) {
        for (const songId of result.affectedSongIds) {
          allAffectedSongIds.add(songId);
        }
      }
    }

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', 0),
      operationType: 'playlist.bulkDelete',
      operationInput: { playlistIds: idsArray } as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.bulkRestore',
        input: { restores: inverseInputs }
      },
      version: 1,
      affectedSongIds: Array.from(allAffectedSongIds)
    };
  }
}

export interface BulkRestoreInput {
  restores: RestorePlaylistInput[];
}

export class BulkRestoreOp implements CollectionOperation<BulkRestoreInput, void> {
  private repository: PlaylistRepository;
  private resolver: HierarchyService;

  constructor(
    repository: PlaylistRepository = new PlaylistRepository(),
    resolver: HierarchyService = new HierarchyService()
  ) {
    this.repository = repository;
    this.resolver = resolver;
  }

  public async execute(
    input: BulkRestoreInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const restoreOp = new RestorePlaylistOp(this.repository);
    const allAffectedSongIds = new Set<number>();

    // 1. Use HierarchyService to determine topological order
    const nodes = input.restores.map(r => ({
      id: r.playlist.id,
      parentId: r.playlist.parentId,
      name: r.playlist.name,
      playlistType: r.playlist.playlistType
    }));
    
    const sortedNodes = this.resolver.topologicalOrder(nodes);
    
    // Create a map for quick lookup
    const restoreMap = new Map(input.restores.map(r => [r.playlist.id, r]));

    // 2. Execute restores top-down sequentially
    for (const node of sortedNodes) {
      const restoreNode = restoreMap.get(node.id)!;
      const result = await restoreOp.execute(restoreNode, ctx);
      if (result.affectedSongIds) {
        for (const songId of result.affectedSongIds) {
          allAffectedSongIds.add(songId);
        }
      }
    }

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', 0),
      operationType: 'playlist.bulkRestore',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.bulkDelete',
        input: { playlistIds: input.restores.map(r => r.playlist.id) }
      },
      version: 1,
      affectedSongIds: Array.from(allAffectedSongIds)
    };
  }
}
