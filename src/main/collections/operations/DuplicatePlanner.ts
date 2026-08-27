import { eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { HierarchyService, type PlaylistNode } from '../engine/HierarchyService';
import { CollectionNamingStrategy } from './CollectionNamingStrategy';

export interface PlannedNode {
  node: PlaylistNode;
  newName: string;
}

export class DuplicatePlanner {
  constructor(
    private hierarchyService: HierarchyService = new HierarchyService(),
    private namingStrategy: CollectionNamingStrategy = new CollectionNamingStrategy()
  ) {}

  /**
   * @param trx Transaction-scoped connection. MUST be provided when planning inside an open
   *   transaction - PGlite has a single connection, so global-db queries here would self-deadlock.
   */
  public async plan(
    playlistId: number,
    trx: any = db
  ): Promise<{ nodes: PlannedNode[]; rootNode: PlaylistNode }> {
    const descendants = await this.hierarchyService.getDescendants(playlistId, trx);

    // Fetch the root node itself to start the plan
    const [rootNode] = await trx
      .select({
        id: playlists.id,
        parentId: playlists.parentId,
        name: playlists.name,
        playlistType: playlists.playlistType
      })
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!rootNode) throw new Error(`Playlist ${playlistId} not found`);

    const nodesToDuplicate = [rootNode, ...descendants];

    // Use topological sort to ensure parents are processed before children
    const sortedNodes = this.hierarchyService.topologicalOrder(nodesToDuplicate);

    const plannedNodes: PlannedNode[] = sortedNodes.map((node) => {
      // Only rename the root node
      const newName =
        node.id === playlistId ? this.namingStrategy.generateDuplicateName(node.name) : node.name;

      return {
        node,
        newName
      };
    });

    return { nodes: plannedNodes, rootNode };
  }
}
