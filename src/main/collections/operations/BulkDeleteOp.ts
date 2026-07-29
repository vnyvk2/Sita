import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { DeleteOp } from './DeleteOp';
import { RestorePlaylistOp, RestorePlaylistInput } from './RestorePlaylistOp';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { RelationshipResolver } from '../engine/RelationshipResolver';

export interface BulkDeleteInput {
  playlistIds: number[];
}

export class BulkDeleteOp implements CollectionOperation<BulkDeleteInput, void> {
  private repository: PlaylistRepository;
  private resolver: RelationshipResolver;

  constructor(
    repository: PlaylistRepository = new PlaylistRepository(),
    resolver: RelationshipResolver = new RelationshipResolver()
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
      data: undefined as void, // Fix for TypeScript expecting data
      operationType: 'playlist.bulkDelete',
      operationInput: { playlistIds: idsArray } as any,
      inverseInput: {
        operationType: 'playlist.bulkRestore',
        input: { restores: inverseInputs }
      },
      version: 1,
      affectedSongIds: Array.from(allAffectedSongIds)
    } as any; // Cast for now until types converge
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

    // We must restore parent-first (top-down) to avoid FK constraint violations
    // Sort by parentId: nulls first, then those whose parents exist
    // A topological sort would be safest. For now, simple sort based on creation order or assuming inputs were bottom-up, so we reverse it.
    const sortedRestores = [...input.restores].reverse();

    for (const restore of sortedRestores) {
      const result = await restoreOp.execute(restore, ctx);
      if (result.affectedSongIds) {
        for (const songId of result.affectedSongIds) {
          allAffectedSongIds.add(songId);
        }
      }
    }

    return {
      data: undefined as void,
      operationType: 'playlist.bulkRestore',
      operationInput: {} as any,
      inverseInput: {
        operationType: 'playlist.bulkDelete',
        input: { playlistIds: input.restores.map(r => r.playlist.id) }
      },
      version: 1,
      affectedSongIds: Array.from(allAffectedSongIds)
    } as any;
  }
}
