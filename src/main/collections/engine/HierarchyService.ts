import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

export interface PlaylistNode {
  id: number;
  parentId: number | null;
  name: string;
  playlistType: string;
}

export class HierarchyService {
  /**
   * Internal cache map to support future optimization.
   * Format: Map<cacheKey, result>
   */
  private cache = new Map<string, any>();

  /**
   * Fetches all direct and indirect descendants of a given playlist/folder ID.
   * If the hierarchy is large, this retrieves all children in multiple queries.
   */
  public async getDescendants(playlistId: number): Promise<PlaylistNode[]> {
    const cacheKey = `descendants:${playlistId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const descendants: PlaylistNode[] = [];
    let currentLevelIds = [playlistId];

    while (currentLevelIds.length > 0) {
      const children = await db
        .select({
          id: playlists.id,
          parentId: playlists.parentId,
          name: playlists.name,
          playlistType: playlists.playlistType
        })
        .from(playlists)
        .where(inArray(playlists.parentId, currentLevelIds));

      if (children.length === 0) break;

      descendants.push(...children);
      currentLevelIds = children.map((c) => c.id);
    }

    this.cache.set(cacheKey, descendants);
    return descendants;
  }

  /**
   * Fetches the ancestor chain from the given playlist ID up to the root folder.
   */
  public async getAncestors(playlistId: number): Promise<PlaylistNode[]> {
    const cacheKey = `ancestors:${playlistId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const ancestors: PlaylistNode[] = [];
    let currentId: number | null = playlistId;

    // Hard limit to prevent infinite loops from bad data
    let depthCount = 0;
    const MAX_DEPTH = 50;

    while (currentId !== null && depthCount < MAX_DEPTH) {
      const [node] = await db
        .select({
          id: playlists.id,
          parentId: playlists.parentId,
          name: playlists.name,
          playlistType: playlists.playlistType
        })
        .from(playlists)
        .where(eq(playlists.id, currentId))
        .limit(1);

      if (!node) break;

      // Don't include the target node itself in its ancestor list
      if (node.id !== playlistId) {
        ancestors.push(node);
      }

      currentId = node.parentId;
      depthCount++;
    }

    this.cache.set(cacheKey, ancestors);
    return ancestors;
  }

  /**
   * Validates if a move is safe. Moving a node to its own descendant creates a cycle.
   * @param sourceId The folder/playlist being moved
   * @param targetParentId The destination folder
   * @throws Error if move would create a cycle
   */
  public async validateMove(sourceId: number, targetParentId: number | null): Promise<void> {
    if (targetParentId === null) {
      return; // Moving to root is always safe
    }

    if (sourceId === targetParentId) {
      throw new Error(`Cannot move folder ${sourceId} into itself.`);
    }

    // Check if the target is a descendant of the source
    const descendants = await this.getDescendants(sourceId);
    const descendantIds = descendants.map((d) => d.id);

    if (descendantIds.includes(targetParentId)) {
      throw new Error(`Cannot move folder ${sourceId} into its own descendant ${targetParentId}.`);
    }
  }

  /**
   * Returns nodes in topological order (parents before children).
   * Guarantees stable ordering between siblings (sorted by name case-insensitively, then id).
   */
  public topologicalOrder(nodes: PlaylistNode[]): PlaylistNode[] {
    // Sort nodes to guarantee deterministic ordering
    const sortedNodes = [...nodes].sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
      return a.id - b.id;
    });

    const nodeMap = new Map(sortedNodes.map(n => [n.id, n]));
    const result: PlaylistNode[] = [];
    const visited = new Set<number>();
    
    // Iterative approach to avoid call stack limits, and guarantees 
    // that a parent is always added before its children if the parent is in the set.
    const visit = (id: number) => {
      if (visited.has(id)) return;
      
      const node = nodeMap.get(id);
      if (!node) return; // parent is not part of the provided set

      if (node.parentId !== null) {
         visit(node.parentId);
      }
      
      visited.add(id);
      result.push(node);
    };

    for (const node of sortedNodes) {
      visit(node.id);
    }
    
    return result;
  }

  /**
   * Invalidate cached hierarchy data. 
   * @internal Designed to be called internally by operations that structurally mutate the hierarchy.
   */
  private invalidateCache(): void {
    this.cache.clear();
  }
}
