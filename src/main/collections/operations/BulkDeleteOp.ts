import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { DeleteOp } from './DeleteOp';
import { RestorePlaylistOp, RestorePlaylistInput } from './RestorePlaylistOp';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { HierarchyService } from '../engine/HierarchyService';

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
      const descendants = await this.resolver.getDescendants(id);
      for (const d of descendants) {
        allIdsToDelete.add(d.id);
      }
    }

    const idsArray = Array.from(allIdsToDelete);
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
      collectionId: 'local:playlist:0' as any,
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

  constructor(repository: PlaylistRepository = new PlaylistRepository()) {
    this.repository = repository;
  }

  public async execute(
    input: BulkRestoreInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const restoreOp = new RestorePlaylistOp(this.repository);
    const allAffectedSongIds = new Set<number>();

    // 1. Build a map of parentId -> children from the input to perform topological sort
    const childrenMap = new Map<number | null, RestorePlaylistInput[]>();
    const allInputIds = new Set(input.restores.map(r => r.playlist.id));

    for (const restore of input.restores) {
      // If a node's parent is not in this restore batch, treat it as a root for this batch
      const effectiveParentId = (restore.playlist.parentId !== null && allInputIds.has(restore.playlist.parentId))
        ? restore.playlist.parentId
        : null;
      
      const children = childrenMap.get(effectiveParentId) || [];
      children.push(restore);
      childrenMap.set(effectiveParentId, children);
    }

    // 2. Traverse and execute restores top-down
    const executeTopDown = async (parentId: number | null) => {
      const nodes = childrenMap.get(parentId) || [];
      for (const node of nodes) {
        const result = await restoreOp.execute(node, ctx);
        if (result.affectedSongIds) {
          for (const songId of result.affectedSongIds) {
            allAffectedSongIds.add(songId);
          }
        }
        await executeTopDown(node.playlist.id);
      }
    };

    await executeTopDown(null);

    return {
      data: undefined,
      collectionId: 'local:playlist:0' as any,
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
