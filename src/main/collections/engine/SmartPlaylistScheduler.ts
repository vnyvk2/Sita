import { db } from '../../db/db';
import { smartPlaylistRules } from '../../db/schema';
import { SmartPlaylistEngine } from './SmartPlaylistEngine';

export class SmartPlaylistScheduler {
  private engine = new SmartPlaylistEngine();

  /**
   * Identifies all smart playlists and regenerates them.
   * Currently triggers regeneration for all smart playlists.
   * Future optimization: track which playlists are actually stale based on library events.
   */
  public async regenerateStalePlaylists(): Promise<number> {
    let regeneratedCount = 0;

    // For now, we consider all smart playlists as potentially stale
    // since we do not yet have fine-grained library invalidation tracking.
    const allRules = await db.select({ playlistId: smartPlaylistRules.playlistId }).from(smartPlaylistRules);

    for (const rule of allRules) {
      try {
        const success = await this.engine.regenerate(rule.playlistId);
        if (success) {
          regeneratedCount++;
        }
      } catch (error) {
        console.error(`Failed to regenerate smart playlist ${rule.playlistId}`, error);
      }
    }

    return regeneratedCount;
  }
}
