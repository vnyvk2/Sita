import { eq } from 'drizzle-orm';

import { createCollectionId } from '../../../common/collections/id';
import type { BulkDeleteInput } from '../../../common/collections/operationInputs';
import { smartPlaylistRules } from '../../db/schema';
import logger from '../../logger';
import { HierarchyService } from '../engine/HierarchyService';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { DeleteOp } from './DeleteOp';
import { RestorePlaylistOp, type RestorePlaylistInput } from './RestorePlaylistOp';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export interface BulkRestoreInput {
  restores: RestorePlaylistInput[];
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
    const allAffectedSongIds = new Set<number>();

    // Phase 1 - capture pristine pre-delete state for EVERY id before any
    // destructive statement runs. Deleting a parent fires FK `ON DELETE SET NULL`
    // against its children, so per-delete snapshots (captured during the delete
    // loop) recorded already-null parentIds and undo flattened hierarchies.
    // The journal inverse must reflect the database as it existed immediately
    // before the operation, not after FK side effects.
    const inverseInputs: RestorePlaylistInput[] = [];
    for (const id of idsArray) {
      const playlist = await this.repository.getById(id, ctx.trx);
      if (!playlist) continue;
      const entries = await this.repository.getEntries(id, {}, ctx.trx);
      let smartRule: any = undefined;
      if (playlist.playlistType === 'smart') {
        const [rule] = await ctx.trx
          .select()
          .from(smartPlaylistRules)
          .where(eq(smartPlaylistRules.playlistId, id));
        if (rule) {
          smartRule = {
            ruleAst: rule.ruleAst,
            sortDefinition: rule.sortDefinition,
            maxEntries: rule.maxEntries,
            ruleVersion: rule.ruleVersion
          };
        }
      }
      inverseInputs.push({
        playlist,
        entries: entries.map((e) => e.entry),
        smartRule
      } as unknown as RestorePlaylistInput);
    }

    // Phase 2 - perform deletions. Stats propagation and song aggregation
    // behavior is intentionally unchanged from DeleteOp's original contract.
    for (const id of idsArray) {
      const result = await deleteOp.execute({ playlistId: id }, ctx);

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
    const nodes = input.restores.map((r) => ({
      id: r.playlist.id,
      parentId: r.playlist.parentId ?? null,
      name: r.playlist.name,
      playlistType: r.playlist.playlistType
    }));

    const sortedNodes = this.resolver.topologicalOrder(nodes);

    // Create a map for quick lookup
    const restoreMap = new Map(input.restores.map((r) => [r.playlist.id, r]));

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
        input: { playlistIds: input.restores.map((r) => r.playlist.id) }
      },
      version: 1,
      affectedSongIds: Array.from(allAffectedSongIds)
    };
  }
}
