// Mock DB
vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

import { smartPlaylistScheduler } from '@main/collections/engine/SmartPlaylistScheduler';
import { db } from '@main/db/db';
import { playlists, smartPlaylistRules } from '@main/db/schema';
import { libraryEventBus } from '@main/events/LibraryEventBus';
import { libraryScheduler } from '@main/workers/jobScheduler';
import type { MockInstance } from 'vitest';

describe('SmartPlaylistScheduler Integration', () => {
  let enqueueSpy: MockInstance;

  beforeEach(async () => {
    vi.useFakeTimers();
    smartPlaylistScheduler.cleanup();
    smartPlaylistScheduler.setupListeners();
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);

    enqueueSpy = vi.spyOn(libraryScheduler, 'enqueue').mockImplementation(() => {});
  });

  afterEach(async () => {
    smartPlaylistScheduler.cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);
    vi.restoreAllMocks();
  });

  it('selectively enqueues regeneration jobs only for playlists dependent on changed metadata fields', async () => {
    // Playlist 1: Depends on 'genre' and 'duration'
    const [p1] = await db
      .insert(playlists)
      .values({ name: 'Rock 3min+', playlistType: 'smart' })
      .returning();

    await db.insert(smartPlaylistRules).values({
      playlistId: p1.id,
      ruleAst: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'genre', operator: 'eq', value: 'Rock' },
          { type: 'condition', field: 'duration', operator: 'gt', value: 180 }
        ]
      },
      sortDefinition: [],
      dependencies: ['genre', 'duration'],
      ruleVersion: 1
    });

    // Playlist 2: Depends strictly on 'artist'
    const [p2] = await db
      .insert(playlists)
      .values({ name: 'Queen Tracks', playlistType: 'smart' })
      .returning();

    await db.insert(smartPlaylistRules).values({
      playlistId: p2.id,
      ruleAst: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'artist', operator: 'eq', value: 'Queen' }]
      },
      sortDefinition: [],
      dependencies: ['artist'],
      ruleVersion: 1
    });

    // Fire event: genre modified on a track
    libraryEventBus.emitEvent('SongMetadataChanged', {
      songId: 42,
      changedFields: ['genre']
    });

    // Fast-forward debounce timeout (5000ms) while flushing async microtasks
    await vi.advanceTimersByTimeAsync(5000);

    // Only Playlist 1 should be queued for regeneration
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const queuedJob = enqueueSpy.mock.calls[0][0];
    expect(queuedJob.id).toBe(`smart_playlist_regenerate_${p1.id}`);
  });

  it('enqueues all smart playlists on structural changes like SongAdded', async () => {
    const [p1] = await db
      .insert(playlists)
      .values({ name: 'Playlist One', playlistType: 'smart' })
      .returning();

    await db.insert(smartPlaylistRules).values({
      playlistId: p1.id,
      ruleAst: { type: 'group', logicalOperator: 'and', rules: [] },
      sortDefinition: [],
      dependencies: ['year'],
      ruleVersion: 1
    });

    const [p2] = await db
      .insert(playlists)
      .values({ name: 'Playlist Two', playlistType: 'smart' })
      .returning();

    await db.insert(smartPlaylistRules).values({
      playlistId: p2.id,
      ruleAst: { type: 'group', logicalOperator: 'and', rules: [] },
      sortDefinition: [],
      dependencies: ['bitRate'],
      ruleVersion: 1
    });

    // Fire SongAdded event
    libraryEventBus.emitEvent('SongAdded', { songId: 99 });
    await vi.advanceTimersByTimeAsync(5000);

    // Both playlists should be queued
    expect(enqueueSpy).toHaveBeenCalledTimes(2);
    const queuedIds = enqueueSpy.mock.calls.map((call) => (call[0] as { id: string }).id);
    expect(queuedIds).toContain(`smart_playlist_regenerate_${p1.id}`);
    expect(queuedIds).toContain(`smart_playlist_regenerate_${p2.id}`);
  });

  it('handles full lifecycle: create -> update dependencies -> delete -> scheduler restart', async () => {
    const { HierarchyService } = await import('@main/collections/engine/HierarchyService');
    const { PlaylistEngine } = await import('@main/collections/engine/PlaylistEngine');
    const { MembershipService } = await import('@main/collections/membership/MembershipService');
    const { OperationExecutor } = await import('@main/collections/operations/OperationExecutor');
    const { OperationJournalWriter } =
      await import('@main/collections/operations/OperationJournalWriter');
    const { PlaylistRepository } =
      await import('@main/collections/repositories/PlaylistRepository');

    const repository = new PlaylistRepository();
    const journalWriter = new OperationJournalWriter();
    const executor = new OperationExecutor(journalWriter);
    const membershipService = {
      invalidateSongs: vi.fn(),
      getCollectionsForSong: vi.fn()
    } as unknown as MembershipService;
    const engine = new PlaylistEngine(
      repository,
      membershipService,
      executor,
      new HierarchyService()
    );

    // 1. Create smart playlist with dependency on 'genre'
    const playlistId = await engine.createSmartPlaylist({
      name: 'Genre Filtered',
      definition: {
        rule: {
          type: 'group',
          logicalOperator: 'and',
          rules: [{ type: 'condition', field: 'genre', operator: 'eq', value: 'Jazz' }]
        },
        orderBy: [{ field: 'title', direction: 'asc' }]
      }
    });

    // 2. Emit genre changed -> should enqueue
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['genre'] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy.mock.calls[0][0].id).toBe(`smart_playlist_regenerate_${playlistId}`);

    enqueueSpy.mockClear();

    // 3. Update smart playlist to depend on 'bitRate' instead of 'genre'
    await engine.updateSmartPlaylist({
      playlistId,
      definition: {
        rule: {
          type: 'group',
          logicalOperator: 'and',
          rules: [{ type: 'condition', field: 'bitRate', operator: 'gte', value: 320 }]
        },
        orderBy: [{ field: 'title', direction: 'asc' }]
      }
    });

    // 4. Emit old dependency 'genre' -> should NOT enqueue!
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['genre'] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(enqueueSpy).not.toHaveBeenCalled();

    // 5. Emit new dependency 'bitRate' -> should enqueue!
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['bitRate'] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy.mock.calls[0][0].id).toBe(`smart_playlist_regenerate_${playlistId}`);

    enqueueSpy.mockClear();

    // 6. Delete playlist
    await engine.deletePlaylist({ playlistId });

    // 7. Emit 'bitRate' -> should NO LONGER enqueue!
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['bitRate'] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(enqueueSpy).not.toHaveBeenCalled();

    // 8. Restart / recreate scheduler (simulating app reload)
    const p2Id = await engine.createSmartPlaylist({
      name: 'Reconstructed Playlist',
      definition: {
        rule: {
          type: 'group',
          logicalOperator: 'and',
          rules: [{ type: 'condition', field: 'year', operator: 'eq', value: 2024 }]
        },
        orderBy: [{ field: 'title', direction: 'asc' }]
      }
    });

    smartPlaylistScheduler.cleanup();
    smartPlaylistScheduler.setupListeners();
    libraryEventBus.emitEvent('SongMetadataChanged', { songId: 1, changedFields: ['year'] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy.mock.calls[0][0].id).toBe(`smart_playlist_regenerate_${p2Id}`);
  });
});
