import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { SmartPlaylistEngine } from '../../../../../src/main/collections/engine/SmartPlaylistEngine';
import type { SmartPlaylistDefinition } from '../../../../../src/main/collections/query/ast';
import { db } from '../../../../../src/main/db/db';
import {
  songs,
  playlists,
  smartPlaylistRules,
  playlistEntries,
  artists,
  albums,
  artistsSongs,
  albumsSongs
} from '../../../../../src/main/db/schema';

describe('SmartPlaylistEngine', () => {
  const engine = new SmartPlaylistEngine();
  let playlistId: number;
  let testSongs: { id: number }[];

  beforeEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);

    // Insert songs
    testSongs = await db
      .insert(songs)
      .values([
        {
          title: 'Test Song 1',
          duration: '120.000',
          path: '/path/1',
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        },
        {
          title: 'Another Song',
          duration: '180.000',
          path: '/path/2',
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        },
        {
          title: 'Test Song 3',
          duration: '200.000',
          path: '/path/3',
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        }
      ])
      .returning({ id: songs.id });

    // Insert artists and albums for join testing
    const insertedArtists = await db
      .insert(artists)
      .values([{ name: 'Artist A' }, { name: 'Artist B' }])
      .returning({ id: artists.id });
    const insertedAlbums = await db
      .insert(albums)
      .values([{ title: 'Album X' }, { title: 'Album Y' }])
      .returning({ id: albums.id });

    // Link songs to artists and albums
    await db.insert(artistsSongs).values([
      { artistId: insertedArtists[0].id, songId: testSongs[0].id }, // Song 1 is by Artist A
      { artistId: insertedArtists[1].id, songId: testSongs[1].id }, // Song 2 is by Artist B
      { artistId: insertedArtists[0].id, songId: testSongs[2].id } // Song 3 is by Artist A
    ]);
    await db.insert(albumsSongs).values([
      { albumId: insertedAlbums[0].id, songId: testSongs[0].id }, // Song 1 is in Album X
      { albumId: insertedAlbums[1].id, songId: testSongs[1].id }, // Song 2 is in Album Y
      { albumId: insertedAlbums[1].id, songId: testSongs[2].id } // Song 3 is in Album Y
    ]);

    // Create smart playlist
    const [pl] = await db
      .insert(playlists)
      .values({
        name: 'Smart Test',
        playlistType: 'smart'
      })
      .returning({ id: playlists.id });
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
        rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Test' }]
      },
      orderBy: [{ field: 'duration', direction: 'asc' }]
    };

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: def.rule,
      sortDefinition: def.orderBy,
      ruleVersion: 1
    });

    const success = await engine.regenerate(playlistId);
    expect(success).toBe(true);

    const entries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId))
      .orderBy(playlistEntries.position);

    // Should only have "Test Song 1" and "Test Song 3"
    expect(entries.length).toBe(2);
    // Ordered by duration ascending: Song 1 (120) then Song 3 (200)
    expect(entries[0].songId).toBe(testSongs[0].id);
    expect(entries[1].songId).toBe(testSongs[2].id);

    const [updatedPl] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
    expect(updatedPl.itemCount).toBe(2);
    expect(updatedPl.totalDuration).toBe('320.000');
  });

  it('should be idempotent on repeated regenerations', async () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Song' }]
      },
      orderBy: []
    };

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: def.rule,
      sortDefinition: def.orderBy
    });

    await engine.regenerate(playlistId);
    const entries1 = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));

    await engine.regenerate(playlistId);
    const entries2 = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));

    const cleanEntries = (entries: any[]) =>
      entries.map((e) => ({ songId: e.songId, position: e.position }));
    expect(cleanEntries(entries1)).toEqual(cleanEntries(entries2));
  });

  it('should rollback and preserve original state if regeneration fails midway', async () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Test' }]
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
    const initialEntries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));
    const [initialPl] = await db.select().from(playlists).where(eq(playlists.id, playlistId));

    // Force an error during the next regeneration by spying on the compiler
    // We will spy on the internal QueryPlanner to throw an error during the transaction
    const mockError = new Error('Simulated Database Error');
    const EnginePrototype = SmartPlaylistEngine.prototype as any;
    const originalRegenerate = EnginePrototype.regenerate;

    // We can just throw an error inside the transaction by overriding a method
    const plannerSpy = vi.spyOn(engine as any, 'planner', 'get').mockReturnValue({
      plan: () => {
        throw mockError;
      }
    });

    try {
      await expect(engine.regenerate(playlistId)).rejects.toThrow('Simulated Database Error');
    } finally {
      plannerSpy.mockRestore();
    }

    // Verify state is completely unchanged
    const finalEntries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));
    const [finalPl] = await db.select().from(playlists).where(eq(playlists.id, playlistId));

    expect(finalEntries).toEqual(initialEntries);
    expect(finalPl.itemCount).toBe(initialPl.itemCount);
    expect(finalPl.totalDuration).toBe(initialPl.totalDuration);
  });

  it('should successfully evaluate queries requiring multiple joins', async () => {
    // We want songs by "Artist A" AND in "Album Y".
    // From our test data:
    // Song 1: Artist A, Album X
    // Song 2: Artist B, Album Y
    // Song 3: Artist A, Album Y (Match!)
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'artist', operator: 'eq', value: 'Artist A' },
          { type: 'condition', field: 'album', operator: 'eq', value: 'Album Y' }
        ]
      },
      orderBy: []
    };

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: def.rule,
      sortDefinition: def.orderBy
    });

    const success = await engine.regenerate(playlistId);
    expect(success).toBe(true);

    const entries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));

    // Should only have Song 3
    expect(entries.length).toBe(1);
    expect(entries[0].songId).toBe(testSongs[2].id);
  });
});
