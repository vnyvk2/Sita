import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { eq, inArray, or } from 'drizzle-orm';

export interface PlaylistNode {
  id: number;
  parentId: number | null;
  name: string;
  playlistType: string;
}

export class RelationshipResolver {
  /**
   * Fetches all direct and indirect descendants of a given playlist/folder ID.
   * If the hierarchy is large, this retrieves all children in multiple queries.
   */
  public async getDescendants(playlistId: number): Promise<PlaylistNode[]> {
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

    return descendants;
  }

  /**
   * Fetches the ancestor chain from the given playlist ID up to the root folder.
   */
  public async getAncestors(playlistId: number): Promise<PlaylistNode[]> {
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
}
