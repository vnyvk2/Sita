import { eq } from 'drizzle-orm';

// Mock DB
vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

import type { SmartPlaylistDefinition } from '@common/collections/smartPlaylist';
import { HierarchyService } from '@main/collections/engine/HierarchyService';
import { PlaylistEngine } from '@main/collections/engine/PlaylistEngine';
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

describe('PlaylistEngine.previewSmartPlaylist', () => {
  let engine: PlaylistEngine;
  let repository: PlaylistRepository;
  let membershipService: MembershipService;

  beforeEach(async () => {
    // Clean up
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
    vi.clearAllMocks();
  });

  it('verifies all 5 preview assertions: totalMatches, limitedMatches, limitedDuration, 100-row cap, and dry-run invariant', async () => {
    const now = new Date();
    // Insert 120 matching songs (duration = 100) and 10 non-matching songs (duration = 10)
    const matchingSongsData = Array.from({ length: 120 }, (_, i) => ({
      title: `Matching Track ${String(i).padStart(3, '0')}`,
      path: `/music/track_${i}.mp3`,
      duration: 100,
      fileCreatedAt: now,
      fileModifiedAt: now
    }));

    const nonMatchingSongsData = Array.from({ length: 10 }, (_, i) => ({
      title: `Other Track ${i}`,
      path: `/music/other_${i}.mp3`,
      duration: 10,
      fileCreatedAt: now,
      fileModifiedAt: now
    }));

    await db.insert(songs).values([...matchingSongsData, ...nonMatchingSongsData]);

    const definition: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          {
            type: 'condition',
            field: 'duration',
            operator: 'gt',
            value: 50
          }
        ]
      },
      orderBy: [{ field: 'title', direction: 'asc' }]
    };

    // --- Invariant 1, 2, 3: With maxEntries = 25 ---
    const limitedPreview = await engine.previewSmartPlaylist(definition, 25);

    // Invariant 1: totalMatches accurately reflects ALL 120 matches
    expect(limitedPreview.totalMatches).toBe(120);

    // Invariant 2: limitedMatches is clamped to maxEntries (25)
    expect(limitedPreview.limitedMatches).toBe(25);

    // Invariant 3: limitedDuration computed strictly across the 25 items (25 * 100 = 2500)
    expect(limitedPreview.limitedDuration).toBe(2500);

    // Returned previewSongs length matches limitedMatches (25)
    expect(limitedPreview.previewSongs.length).toBe(25);

    // --- Invariant 4: 100-row cap on previewSongs when matches exceed 100 ---
    const uncappedPreview = await engine.previewSmartPlaylist(definition, null);
    expect(uncappedPreview.totalMatches).toBe(120);
    expect(uncappedPreview.limitedMatches).toBe(120);
    expect(uncappedPreview.limitedDuration).toBe(120 * 100);
    // Even though 120 matched, previewSongs is capped at 100 to protect IPC payload
    expect(uncappedPreview.previewSongs.length).toBe(100);

    // --- Invariant 5: Dry-run invariant (writes nothing to database) ---
    const currentPlaylists = await db.select().from(playlists);
    const currentEntries = await db.select().from(playlistEntries);
    const currentRules = await db.select().from(smartPlaylistRules);
    const currentJournal = await db.select().from(operationJournal);

    expect(currentPlaylists.length).toBe(0);
    expect(currentEntries.length).toBe(0);
    expect(currentRules.length).toBe(0);
    expect(currentJournal.length).toBe(0);
    expect(membershipService.invalidateSongs).not.toHaveBeenCalled();
  });

  it('handles 0 matches gracefully without errors or unneeded queries', async () => {
    const definition: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'title', operator: 'eq', value: 'Non-existent Song' }]
      },
      orderBy: [{ field: 'title', direction: 'asc' }]
    };

    const preview = await engine.previewSmartPlaylist(definition, 50);
    expect(preview.totalMatches).toBe(0);
    expect(preview.limitedMatches).toBe(0);
    expect(preview.limitedDuration).toBe(0);
    expect(preview.previewSongs).toEqual([]);
  });

  it('strictly preserves SQL ORDER BY sequence in previewSongs hydrated by getSongInfo', async () => {
    const now = new Date();
    // Insert 5 songs with non-monotonic durations out of ID insertion order
    const testSongs = [
      {
        title: 'Song Alpha',
        path: '/music/alpha.mp3',
        duration: 100,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song Beta',
        path: '/music/beta.mp3',
        duration: 500,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song Gamma',
        path: '/music/gamma.mp3',
        duration: 300,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song Delta',
        path: '/music/delta.mp3',
        duration: 900,
        fileCreatedAt: now,
        fileModifiedAt: now
      },
      {
        title: 'Song Epsilon',
        path: '/music/epsilon.mp3',
        duration: 200,
        fileCreatedAt: now,
        fileModifiedAt: now
      }
    ];

    const inserted = await db
      .insert(songs)
      .values(testSongs)
      .returning({ id: songs.id, duration: songs.duration });
    const idMap = new Map(inserted.map((s) => [s.duration, s.id]));

    // 1. Test Descending Duration
    const descDef: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'duration', operator: 'gt', value: 0 }]
      },
      orderBy: [{ field: 'duration', direction: 'desc' }]
    };

    const descPreview = await engine.previewSmartPlaylist(descDef, 10);
    const expectedDescIds = [900, 500, 300, 200, 100].map((d) => idMap.get(d)!);
    expect(descPreview.previewSongs.map((s) => s.songId)).toEqual(expectedDescIds);

    // 2. Test Ascending Duration
    const ascDef: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'duration', operator: 'gt', value: 0 }]
      },
      orderBy: [{ field: 'duration', direction: 'asc' }]
    };

    const ascPreview = await engine.previewSmartPlaylist(ascDef, 10);
    const expectedAscIds = [100, 200, 300, 500, 900].map((d) => idMap.get(d)!);
    expect(ascPreview.previewSongs.map((s) => s.songId)).toEqual(expectedAscIds);
  });
});
