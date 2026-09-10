import { eq, and } from 'drizzle-orm';

// Mock DB
vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

import type {
  CreateSmartPlaylistInput,
  UpdateSmartPlaylistInput
} from '@common/collections/operationInputs';
import type {
  RuleCondition,
  SmartPlaylistDefinition,
  SmartPlaylistRuleAST
} from '@common/collections/smartPlaylist';
import { HierarchyService } from '@main/collections/engine/HierarchyService';
import { PlaylistEngine } from '@main/collections/engine/PlaylistEngine';
import type { SmartPlaylistEngine } from '@main/collections/engine/SmartPlaylistEngine';
import { MembershipService } from '@main/collections/membership/MembershipService';
import { OperationExecutor } from '@main/collections/operations/OperationExecutor';
import { OperationJournalWriter } from '@main/collections/operations/OperationJournalWriter';
import { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import { db } from '@main/db/db';
import {
  playlists,
  playlistEntries,
  operationJournal,
  smartPlaylistRules,
  songs
} from '@main/db/schema';

describe('SmartPlaylist Atomic Regeneration & Transaction Propagation', () => {
  let engine: PlaylistEngine;
  let repository: PlaylistRepository;
  let membershipService: MembershipService;

  beforeEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(operationJournal);
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);

    repository = new PlaylistRepository();
    const journalWriter = new OperationJournalWriter();
    const executor = new OperationExecutor(journalWriter);

    membershipService = {
      invalidateSongs: vi.fn(),
      getCollectionsForSong: vi.fn()
    } as unknown as MembershipService;

    engine = new PlaylistEngine(repository, membershipService, executor, new HierarchyService());
  });

  afterEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(operationJournal);
    await db.delete(playlistEntries);
    await db.delete(playlists);
    await db.delete(songs);
    vi.restoreAllMocks();
  });

  const validDefA: SmartPlaylistDefinition = {
    rule: {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Alpha' }]
    },
    orderBy: [{ field: 'title', direction: 'asc' }]
  };

  const validDefB: SmartPlaylistDefinition = {
    rule: {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'Beta' }]
    },
    orderBy: [{ field: 'title', direction: 'asc' }]
  };

  it('proves real SmartPlaylistEngine.regenerate executes inside outer trx and completely rolls back on post-regenerate error', async () => {
    const now = new Date();
    await db.insert(songs).values([
      {
        title: 'Alpha Song 1',
        path: '/music/alpha1.mp3',
        duration: 120,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Alpha Song 2',
        path: '/music/alpha2.mp3',
        duration: 180,
        fileCreatedAt: now,
        fileModifiedAt: now
      }
    ]);

    const input: CreateSmartPlaylistInput = {
      name: 'Real Trx Test Playlist',
      definition: validDefA,
      maxEntries: 50
    };

    // Execute through a transaction that runs the REAL createSmartPlaylistOp and REAL regenerate,
    // and deliberately throws at the commit boundary.
    await expect(
      db.transaction(async (trx) => {
        const ctx = { trx, membershipService };
        const op = (engine as unknown as { createSmartPlaylistOp: any }).createSmartPlaylistOp;
        const executor = (engine as unknown as { executor: OperationExecutor }).executor;
        const result = await executor.execute(op, input, ctx);
        const playlistId = result.data;

        // Run REAL SmartPlaylistEngine.regenerate using trx (NO MOCKING!)
        const smartEngine = (engine as unknown as { smartEngine: SmartPlaylistEngine }).smartEngine;
        await smartEngine.regenerate(playlistId, trx);

        // Verify that inside the transaction, entries were actually generated:
        const inTrxEntries = await trx
          .select()
          .from(playlistEntries)
          .where(eq(playlistEntries.playlistId, playlistId));
        expect(inTrxEntries.length).toBe(2);

        // Abort the transaction after real mutations were performed
        throw new Error('Simulated transaction commit failure');
      })
    ).rejects.toThrow('Simulated transaction commit failure');

    // Outside the rolled-back transaction:
    // If real regenerate used the global db instead of trx, inTrxEntries would be committed to SQLite!
    // Because it used trx, ALL entries, rules, and playlist rows MUST be completely rolled back:
    const remainingPlaylists = await db.select().from(playlists);
    const remainingRules = await db.select().from(smartPlaylistRules);
    const remainingEntries = await db.select().from(playlistEntries);

    expect(remainingPlaylists.length).toBe(0);
    expect(remainingRules.length).toBe(0);
    expect(remainingEntries.length).toBe(0);
  });

  it('proves real SmartPlaylistEngine.regenerate rolls back entry replacements and restores previous state when update fails mid-flight', async () => {
    const now = new Date();
    const [songAlpha1] = await db
      .insert(songs)
      .values({
        title: 'Alpha Track 1',
        path: '/music/a1.mp3',
        duration: 100,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songAlpha2] = await db
      .insert(songs)
      .values({
        title: 'Alpha Track 2',
        path: '/music/a2.mp3',
        duration: 100,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songBeta1] = await db
      .insert(songs)
      .values({
        title: 'Beta Track 1',
        path: '/music/b1.mp3',
        duration: 150,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songManual] = await db
      .insert(songs)
      .values({
        title: 'Manual Pinned Track',
        path: '/music/m.mp3',
        duration: 80,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // 1. Create a successful smart playlist with definition A (matches Alpha 1 & Alpha 2)
    const playlistId = await engine.createSmartPlaylist({
      name: 'Alpha Playlist',
      definition: validDefA,
      maxEntries: 50
    });

    // 2. Add a manual pinned entry (source: 'manual') at position 2
    const [manualEntry] = await db
      .insert(playlistEntries)
      .values({
        playlistId,
        songId: songManual.id,
        position: 2,
        source: 'manual'
      })
      .returning();

    await db
      .update(playlists)
      .set({ itemCount: 3, totalDuration: 280 })
      .where(eq(playlists.id, playlistId));

    // Verify pre-update state:
    // Positions: 0 (Alpha 1), 1 (Alpha 2), 2 (Manual)
    const preEntries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId))
      .orderBy(playlistEntries.position);

    expect(preEntries.length).toBe(3);
    expect(preEntries[0].songId).toBe(songAlpha1.id);
    expect(preEntries[0].source).toBe('smart');
    expect(preEntries[1].songId).toBe(songAlpha2.id);
    expect(preEntries[1].source).toBe('smart');
    expect(preEntries[2].songId).toBe(songManual.id);
    expect(preEntries[2].source).toBe('manual');

    // 3. Force failure during updateSmartPlaylist while real SmartPlaylistEngine.regenerate is executing:
    // We spy on repository.updatePositionsBulk (step 8 of regenerate) to throw AFTER smart entries have
    // been deleted and new Beta entries have already been inserted into playlistEntries!
    const smartEngine = (engine as unknown as { smartEngine: SmartPlaylistEngine }).smartEngine;
    const internalRepo = (smartEngine as unknown as { repository: PlaylistRepository }).repository;

    vi.spyOn(internalRepo, 'updatePositionsBulk').mockImplementationOnce(async () => {
      throw new Error('Simulated mid-flight failure during manual entry renumbering');
    });

    const updateInput: UpdateSmartPlaylistInput = {
      playlistId,
      definition: validDefB,
      maxEntries: 100
    };

    await expect(engine.updateSmartPlaylist(updateInput)).rejects.toThrow(
      'Simulated mid-flight failure during manual entry renumbering'
    );

    // 4. Assert: Everything was rolled back cleanly by the transaction!
    // - Original rule restored
    const rules = await db
      .select()
      .from(smartPlaylistRules)
      .where(eq(smartPlaylistRules.playlistId, playlistId));
    expect(rules.length).toBe(1);
    const ast = rules[0].ruleAst as SmartPlaylistRuleAST;
    expect((ast.rules[0] as RuleCondition).value).toBe('Alpha');
    expect(rules[0].maxEntries).toBe(50);

    // - Original playlist statistics restored
    const [playlistRow] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
    expect(playlistRow.itemCount).toBe(3);
    expect(playlistRow.totalDuration).toBe(280);

    // - Original entries & positions restored (Alpha 1, Alpha 2, Manual Pinned Track)
    const postEntries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId))
      .orderBy(playlistEntries.position);

    expect(postEntries.length).toBe(3);
    expect(postEntries[0].songId).toBe(songAlpha1.id);
    expect(postEntries[0].position).toBe(0);
    expect(postEntries[0].source).toBe('smart');

    expect(postEntries[1].songId).toBe(songAlpha2.id);
    expect(postEntries[1].position).toBe(1);
    expect(postEntries[1].source).toBe('smart');

    expect(postEntries[2].songId).toBe(songManual.id);
    expect(postEntries[2].position).toBe(2);
    expect(postEntries[2].source).toBe('manual');

    // - Beta Track 1 must NOT be in playlist entries
    const betaEntries = await db
      .select()
      .from(playlistEntries)
      .where(
        and(eq(playlistEntries.playlistId, playlistId), eq(playlistEntries.songId, songBeta1.id))
      );
    expect(betaEntries.length).toBe(0);
  });
});
