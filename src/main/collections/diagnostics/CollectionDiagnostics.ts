import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { sql } from 'drizzle-orm';

export interface DuplicateNameDiagnostic {
  name: string;
  parentId: number | null;
  count: number;
  playlistIds: number[];
}

export class CollectionDiagnostics {
  /**
   * Finds folders that contain 0 children (no sub-folders and no playlists).
   */
  public async findEmptyFolders(): Promise<number[]> {
    // A folder is empty if no playlist has it as parentId
    const result = await db.execute(sql`
      SELECT id FROM playlists p
      WHERE playlist_type = 'folder'
      AND NOT EXISTS (
        SELECT 1 FROM playlists c WHERE c.parent_id = p.id
      )
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows;
    return rows.map((r: any) => r.id as number);
  }

  /**
   * Finds standard or smart playlists that contain 0 items.
   * For standard playlists, this means 0 entries in playlist_entries.
   * For smart playlists, this means the generated result has 0 items.
   * We can rely on the cached itemCount for performance.
   */
  public async findEmptyPlaylists(): Promise<number[]> {
    const rows = await db
      .select({ id: playlists.id })
      .from(playlists)
      .where(sql`${playlists.itemCount} = 0 AND ${playlists.playlistType} IN ('standard', 'smart')`);
    
    return rows.map(r => r.id);
  }

  /**
   * Detects duplicate names within the same parent folder (or root).
   */
  public async findDuplicateNames(parentId?: number | null): Promise<DuplicateNameDiagnostic[]> {
    const parentCondition = parentId === undefined 
      ? sql`1=1` 
      : parentId === null 
        ? sql`parent_id IS NULL` 
        : sql`parent_id = ${parentId}`;

    const result = await db.execute(sql`
      SELECT name, parent_id, COUNT(*) as count, array_agg(id) as playlist_ids
      FROM playlists
      WHERE ${parentCondition}
      GROUP BY name, parent_id
      HAVING COUNT(*) > 1
    `);
    
    const rows = Array.isArray(result) ? result : (result as any).rows;

    return rows.map((r: any) => ({
      name: r.name,
      parentId: r.parent_id,
      count: Number(r.count),
      playlistIds: r.playlist_ids
    }));
  }

  /**
   * Detects orphaned collections where the parentId points to a non-existent playlist.
   */
  public async findOrphanedCollections(): Promise<number[]> {
    const result = await db.execute(sql`
      SELECT p.id 
      FROM playlists p
      LEFT JOIN playlists parent ON p.parent_id = parent.id
      WHERE p.parent_id IS NOT NULL AND parent.id IS NULL
    `);
    
    const rows = Array.isArray(result) ? result : (result as any).rows;
    return rows.map((r: any) => r.id as number);
  }
}
