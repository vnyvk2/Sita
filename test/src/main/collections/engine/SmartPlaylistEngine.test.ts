import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../../../../src/main/db/db';
import { songs, playlists, smartPlaylistRules, playlistEntries } from '../../../../../src/main/db/schema';
import { eq } from 'drizzle-orm';
import { SmartPlaylistEngine } from '../../../../../src/main/collections/engine/SmartPlaylistEngine';
import type { SmartPlaylistDefinition } from '../../../../../src/main/collections/query/ast';

describe('SmartPlaylistEngine', () => {
  const engine = new SmartPlaylistEngine();
  let playlistId: number;

  beforeEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);

    // Insert songs
    await db.insert(songs).values([
      { id: 1, title: 'Test Song 1', duration: '120.000', path: '/path/1', fileCreatedAt: new Date(), fileModifiedAt: new Date() },
      { id: 2, title: 'Another Song', duration: '180.000', path: '/path/2', fileCreatedAt: new Date(), fileModifiedAt: new Date() },
      { id: 3, title: 'Test Song 3', duration: '200.000', path: '/path/3', fileCreatedAt: new Date(), fileModifiedAt: new Date() },
    ]);

    // Create smart playlist
    const [pl] = await db.insert(playlists).values({
      name: 'Smart Test',
      playlistType: 'smart'
    }).returning({ id: playlists.id });
    playlistId = pl.id;
  });

  afterEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);
  });

  it('should regenerate playlist entries based on rules', async () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'title', operator: 'contains', value: 'Test' }
        ]
      },
      orderBy: [
        { field: 'duration', direction: 'asc' }
      ]
    };

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: def.rule,
      sortDefinition: def.orderBy,
      ruleVersion: 1
    });

    const success = await engine.regenerate(playlistId);
    expect(success).toBe(true);

    const entries = await db.select().from(playlistEntries).where(eq(playlistEntries.playlistId, playlistId)).orderBy(playlistEntries.position);
    
    // Should only have "Test Song 1" and "Test Song 3"
    expect(entries.length).toBe(2);
    // Ordered by duration ascending: Song 1 (120) then Song 3 (200)
    expect(entries[0].songId).toBe(1);
    expect(entries[1].songId).toBe(3);

    const [updatedPl] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
    expect(updatedPl.itemCount).toBe(2);
    expect(updatedPl.totalDuration).toBe('320.000');
  });

  it('should be idempotent on repeated regenerations', async () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'title', operator: 'contains', value: 'Song' }
        ]
      },
      orderBy: []
    };

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: def.rule,
      sortDefinition: def.orderBy
    });

    await engine.regenerate(playlistId);
    const entries1 = await db.select().from(playlistEntries).where(eq(playlistEntries.playlistId, playlistId));
    
    await engine.regenerate(playlistId);
    const entries2 = await db.select().from(playlistEntries).where(eq(playlistEntries.playlistId, playlistId));

    const cleanEntries = (entries: any[]) => entries.map(e => ({ songId: e.songId, position: e.position }));
    expect(cleanEntries(entries1)).toEqual(cleanEntries(entries2));
  });

  it('should rollback and preserve original state if regeneration fails midway', async () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'title', operator: 'contains', value: 'Test' }
        ]
      },
      orderBy: []
    };

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: def.rule,
      sortDefinition: def.orderBy
    });

    // Populate initial state
    await engine.regenerate(playlistId);
    const initialEntries = await db.select().from(playlistEntries).where(eq(playlistEntries.playlistId, playlistId));
    const [initialPl] = await db.select().from(playlists).where(eq(playlists.id, playlistId));

    // Force an error during the next regeneration by spying on the compiler
    // We will spy on the internal QueryPlanner to throw an error during the transaction
    const mockError = new Error('Simulated Database Error');
    const EnginePrototype = SmartPlaylistEngine.prototype as any;
    const originalRegenerate = EnginePrototype.regenerate;
    
    // We can just throw an error inside the transaction by overriding a method
    const plannerSpy = vi.spyOn(engine as any, 'planner', 'get').mockReturnValue({
      plan: () => { throw mockError; }
    });

    try {
      await expect(engine.regenerate(playlistId)).rejects.toThrow('Simulated Database Error');
    } finally {
      plannerSpy.mockRestore();
    }

    // Verify state is completely unchanged
    const finalEntries = await db.select().from(playlistEntries).where(eq(playlistEntries.playlistId, playlistId));
    const [finalPl] = await db.select().from(playlists).where(eq(playlists.id, playlistId));

    expect(finalEntries).toEqual(initialEntries);
    expect(finalPl.itemCount).toBe(initialPl.itemCount);
    expect(finalPl.totalDuration).toBe(initialPl.totalDuration);
  });
});
