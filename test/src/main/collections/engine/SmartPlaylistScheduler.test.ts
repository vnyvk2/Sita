import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartPlaylistScheduler } from '../../../../../src/main/collections/engine/SmartPlaylistScheduler';
import { db } from '../../../../../src/main/db/db';
import { smartPlaylistRules, playlists } from '../../../../../src/main/db/schema';
import { SmartPlaylistEngine } from '../../../../../src/main/collections/engine/SmartPlaylistEngine';

describe('SmartPlaylistScheduler', () => {
  const scheduler = new SmartPlaylistScheduler();

  beforeEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);
  });

  afterEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);
  });

  it('should trigger regeneration for all smart playlists', async () => {
    const [pl1] = await db.insert(playlists).values({ name: 'P1', playlistType: 'smart' }).returning({ id: playlists.id });
    const [pl2] = await db.insert(playlists).values({ name: 'P2', playlistType: 'smart' }).returning({ id: playlists.id });

    await db.insert(smartPlaylistRules).values([
      { playlistId: pl1.id, ruleAst: {}, sortDefinition: [], ruleVersion: 1 },
      { playlistId: pl2.id, ruleAst: {}, sortDefinition: [], ruleVersion: 1 },
    ]);

    const regenerateSpy = vi.spyOn(SmartPlaylistEngine.prototype, 'regenerate').mockResolvedValue(true);

    try {
      const count = await scheduler.regenerateStalePlaylists();
      
      expect(count).toBe(2);
      expect(regenerateSpy).toHaveBeenCalledTimes(2);
      expect(regenerateSpy).toHaveBeenCalledWith(pl1.id);
      expect(regenerateSpy).toHaveBeenCalledWith(pl2.id);
    } finally {
      regenerateSpy.mockRestore();
    }
  });
});
