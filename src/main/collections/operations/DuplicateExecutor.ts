import { playlists, playlistEntries, smartPlaylistRules } from '../../db/schema';
import { inArray } from 'drizzle-orm';
import type { PlannedNode } from './DuplicatePlanner';

export class DuplicateExecutor {
  public async execute(
    trx: any,
    plannedNodes: PlannedNode[],
    rootNodeId: number
  ): Promise<{ rootNewId: number; affectedSongIds: number[] }> {
    const nodeIds = plannedNodes.map(p => p.node.id);
    
    // 1. Fetch extra data
    const allEntries = await trx
      .select()
      .from(playlistEntries)
      .where(inArray(playlistEntries.playlistId, nodeIds));

    const allRules = await trx
      .select()
      .from(smartPlaylistRules)
      .where(inArray(smartPlaylistRules.playlistId, nodeIds));

    const fullNodes = await trx
      .select()
      .from(playlists)
      .where(inArray(playlists.id, nodeIds));

    // Map oldId -> fullNode
    const fullNodeMap = new Map<number, (typeof fullNodes)[number]>(
      fullNodes.map((n: (typeof fullNodes)[number]) => [n.id, n])
    );

    // 2. Insert nodes (since plannedNodes are topologically sorted, parents exist before children)
    const idMap = new Map<number, number>();
    let rootNewId: number | null = null;
    const affectedSongIds = new Set<number>();

    for (const plan of plannedNodes) {
      const fullNode = fullNodeMap.get(plan.node.id);
      if (!fullNode) continue;

      const { id, createdAt, updatedAt, ...rest } = fullNode;

      // Determine parentId: if it's the root being duplicated, keep original parent.
      // If it's a child, point to the newly inserted parent.
      const parentId = plan.node.id === rootNodeId 
        ? plan.node.parentId 
        : (plan.node.parentId !== null ? idMap.get(plan.node.parentId) ?? null : null);

      const [inserted] = await trx.insert(playlists).values({
        ...rest,
        name: plan.newName,
        parentId
      }).returning({ id: playlists.id });

      idMap.set(plan.node.id, inserted.id);

      if (plan.node.id === rootNodeId) {
        rootNewId = inserted.id;
      }

      // 3. Copy entries
      if (plan.node.playlistType === 'standard' || plan.node.playlistType === 'smart') {
        const entries = allEntries.filter((e: any) => e.playlistId === plan.node.id);
        if (entries.length > 0) {
          await trx.insert(playlistEntries).values(
            entries.map((e: any) => {
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

      // 4. Copy rules
      if (plan.node.playlistType === 'smart') {
        const rule = allRules.find((r: any) => r.playlistId === plan.node.id);
        if (rule) {
          const { playlistId: _pid, ...ruleRest } = rule;
          await trx.insert(smartPlaylistRules).values({
            ...ruleRest,
            playlistId: inserted.id
          });
        }
      }
    }

    if (rootNewId === null) throw new Error('Failed to duplicate root node');

    return { rootNewId, affectedSongIds: Array.from(affectedSongIds) };
  }
}
