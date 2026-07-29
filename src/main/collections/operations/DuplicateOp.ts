import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { playlists, playlistEntries, smartPlaylistRules } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { RelationshipResolver } from '../engine/RelationshipResolver';

export interface DuplicateInput {
  playlistId: number;
}

const MAX_DEPTH = 50;

export class DuplicateOp implements CollectionOperation<DuplicateInput, number> {
  private resolver: RelationshipResolver;

  constructor(resolver: RelationshipResolver = new RelationshipResolver()) {
    this.resolver = resolver;
  }

  public async execute(
    input: DuplicateInput,
    ctx: OperationContext
  ): Promise<OperationResult<number>> {
    const { playlistId } = input;

    // 1. Resolve all items to duplicate
    const descendants = await this.resolver.getDescendants(playlistId);
    
    // We also need the root node itself
    const [rootNode] = await ctx.trx
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!rootNode) throw new Error(`Playlist ${playlistId} not found`);

    const nodesToDuplicate = [rootNode, ...descendants];
    const nodeIds = nodesToDuplicate.map(n => n.id);

    // Fetch all extra data
    const allEntries = await ctx.trx
      .select()
      .from(playlistEntries)
      .where(inArray(playlistEntries.playlistId, nodeIds));

    const allRules = await ctx.trx
      .select()
      .from(smartPlaylistRules)
      .where(inArray(smartPlaylistRules.playlistId, nodeIds));

    // 2. Perform duplication. 
    // We must map oldIds to newIds to maintain the hierarchy.
    const idMap = new Map<number, number>();
    
    // Build a map of parentId -> children to optimize traversal
    const childrenMap = new Map<number, typeof rootNode[]>();
    for (const node of descendants) {
      if (node.parentId !== null) {
        const children = childrenMap.get(node.parentId) || [];
        children.push(node);
        childrenMap.set(node.parentId, children);
      }
    }

    let rootNewId: number | null = null;
    const affectedSongIds = new Set<number>();
    
    const insertNode = async (node: typeof rootNode, parentId: number | null, depth: number) => {
      if (depth > MAX_DEPTH) {
        throw new Error(`Exceeded maximum folder depth of ${MAX_DEPTH} during duplication.`);
      }

      // Modify identity fields
      const { id, createdAt, updatedAt, ...rest } = node;
      const copyName = node.id === playlistId ? `${node.name} (Copy)` : node.name;
      
      const [inserted] = await ctx.trx.insert(playlists).values({
        ...rest,
        name: copyName,
        parentId
      }).returning({ id: playlists.id });

      idMap.set(node.id, inserted.id);

      if (node.id === playlistId) {
        rootNewId = inserted.id;
      }

      // Copy entries if standard playlist
      if (node.playlistType === 'standard' || node.playlistType === 'smart') {
        const entries = allEntries.filter(e => e.playlistId === node.id);
        if (entries.length > 0) {
          await ctx.trx.insert(playlistEntries).values(
            entries.map(e => {
              affectedSongIds.add(e.songId);
              return {
                playlistId: inserted.id,
                songId: e.songId,
                position: e.position,
                addedAt: new Date()
              };
            })
          );
        }
      }

      // Copy rules if smart playlist
      if (node.playlistType === 'smart') {
        const rule = allRules.find(r => r.playlistId === node.id);
        if (rule) {
          const { playlistId: _pid, ...ruleRest } = rule;
          await ctx.trx.insert(smartPlaylistRules).values({
            ...ruleRest,
            playlistId: inserted.id
          });
        }
      }

      // Recursively insert children
      const children = childrenMap.get(node.id) || [];
      for (const child of children) {
        await insertNode(child, inserted.id, depth + 1);
      }
    };

    await insertNode(rootNode, rootNode.parentId, 0);

    return {
      data: rootNewId!,
      collectionId: `local:playlist:${rootNewId}` as any,
      operationType: 'playlist.duplicate',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.delete',
        input: { playlistId: rootNewId! }
      },
      version: 1,
      affectedSongIds: Array.from(affectedSongIds)
    };
  }
}
