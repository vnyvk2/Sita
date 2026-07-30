import { HierarchyService } from './HierarchyService';
import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';

export class FolderStatisticsService {
  constructor(private hierarchyService: HierarchyService = new HierarchyService()) {}

  /**
   * Propagates stat deltas up the ancestor chain.
   * This ensures folders incrementally track the total item count and duration 
   * of all their descendant playlists.
   */
  public async propagateStats(
    playlistId: number,
    deltaCount: number,
    deltaDuration: number,
    trx: any = db
  ): Promise<void> {
    if (deltaCount === 0 && deltaDuration === 0) return;

    const ancestors = await this.hierarchyService.getAncestors(playlistId);
    if (ancestors.length === 0) return;

    for (const ancestor of ancestors) {
      // In PostgreSQL, to incrementally update a decimal safely, we cast it to decimal
      await trx
        .update(playlists)
        .set({
          itemCount: sql`${playlists.itemCount} + ${deltaCount}`,
          totalDuration: sql`(${playlists.totalDuration} + ${deltaDuration})::decimal(12,3)`,
          updatedAt: new Date()
        })
        .where(eq(playlists.id, ancestor.id));
    }
  }
}
