import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

import { db } from '../../../db/db';
import { songs } from '../../../db/schema';
import type { TagWritePayload, TagWriterService } from '../../services/TagWriterService';
import { MetadataApplyOrchestrator } from '../MetadataApplyOrchestrator';
import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import { MetadataHistoryRepository } from '../../history/MetadataHistoryRepository';
import { MetadataPendingWritesRepository } from '../../history/MetadataPendingWritesRepository';
import { isMetadataUpdatesPending, clearPendingMetadataUpdates } from '@main/updateSong/updateSongId3Tags';
import { getCurrentSongPath } from '@main/main';

vi.mock('@main/main', () => ({
  getCurrentSongPath: vi.fn(() => undefined),
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

const seedSong = async (title: string, filePath: string): Promise<number> => {
  const [row] = await db
    .insert(songs)
    .values({
      title,
      duration: '180.000',
      path: filePath,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    })
    .returning();
  return row.id;
};

const makeFixture = (): string => {
  const p = path.join(os.tmpdir(), `durability_fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
  fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), p);
  return p;
};

const tinyArtworkBuffer = async (): Promise<Buffer> =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } } })
    .jpeg()
    .toBuffer();

/** Minimal always-succeeding writer so tests can focus on DB/journal phases. */
class TagWriterServiceShim {
  lastPayload?: TagWritePayload;
  async writeTags(payload: TagWritePayload) {
    this.lastPayload = payload;
    return { filePath: payload.filePath, success: true };
  }
}

describe('Durability regressions (P0 #1/#2/#3/#4 - single-transaction design)', () => {
  let history: MetadataHistoryService;
  let pendingRepo: MetadataPendingWritesRepository;
  let fixtures: string[];

  beforeEach(() => {
    history = new MetadataHistoryService(new MetadataHistoryRepository(db));
    pendingRepo = new MetadataPendingWritesRepository();
    fixtures = [];
    // Real signature returns `string` (never undefined); "nothing playing" is
    // simulated with a value that can never equal a fixture path. Individual
    // tests override this via mockReturnValue(<fixture>) when simulating playback.
    vi.mocked(getCurrentSongPath).mockReturnValue(undefined as unknown as string);
  });

  afterEach(async () => {
    clearPendingMetadataUpdates();
    await pendingRepo.clearAll().catch(() => undefined);
    for (const f of fixtures) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    vi.restoreAllMocks();
  });
  // P0 #4 + #3: a deferred (currently-playing) apply must persist the COMPLETE
  // physical-file intent (incl. albumArtist + artwork) and commit the undo
  // journal ATOMICALLY with the DB mutation.
  it('deferred apply commits complete intent (albumArtist+artwork) and journal in one transaction', async () => {
    const fixture = makeFixture();
    fixtures.push(fixture);
    const songId = await seedSong('Deferred Intent Seed', fixture);
    // Simulate "currently playing" for BOTH the orchestrator and the
    // coalescing queue (otherwise the queue force-flushes immediately).
    vi.mocked(getCurrentSongPath).mockReturnValue(fixture);
    const artwork = await tinyArtworkBuffer();

    const neverWriter = {
      writeTags: async (): Promise<never> => {
        throw new Error('deferred mutation must never reach the immediate writer');
      }
    } as unknown as TagWriterService;

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: neverWriter,
      historyService: history,
      getCurrentPlayingPath: () => fixture
    });

    const result = await orchestrator.execute([
      {
        mutationId: 'dur-defer:1',
        operationId: 'dur-defer',
        songId,
        filePath: fixture,
        fields: [
          { fieldId: 'title', oldValue: 'Deferred Intent Seed', newValue: 'Deferred Intent New' },
          { fieldId: 'artist', oldValue: null, newValue: 'Deferred Artist' }
        ],
        albumArtistNewValue: 'Various Artists',
        artwork: { buffer: artwork },
        fileWrite: { deferredIfPlaying: true },
        undo: { description: 'deferred durability' }
      }
    ]);

    expect(result.errors).toEqual([]);
    expect(result.deferredCount).toBe(1);

    // Complete physical intent persisted durably
    const items = await pendingRepo.listAll();
    const item = items.find((i) => i.songPath === fixture);
    expect(item).toBeDefined();
    const tags = item!.tags as Record<string, unknown>;
    expect(tags.albumArtist).toBe('Various Artists');
    expect(typeof tags.artworkBase64).toBe('string');
    expect((tags.artworkBase64 as string).length).toBeGreaterThan(0);
    expect(tags.artists).toEqual(['Deferred Artist']);

    // Undo journal was committed in the SAME transaction
    expect(await history.peekUndo(songId)).toBeDefined();

    // Coalescing queue hydrated post-commit WITHOUT consuming the durable row
    expect(isMetadataUpdatesPending(fixture)).toBe(true);
    expect(items.some((i) => i.songPath === fixture)).toBe(true);
  });

  // P0 #1: a rejected pending-write insert must fail the WHOLE apply -
  // DB mutation and undo journal roll back together instead of reporting
  // success while the deferred write is unpersisted.
  it('pending-write persistence failure rolls back mutation + journal atomically', async () => {
    const fixture = makeFixture();
    fixtures.push(fixture);
    const songId = await seedSong('Rollback Seed', fixture);
    vi.mocked(getCurrentSongPath).mockReturnValue(fixture);

    const upsertSpy = vi
      .spyOn(MetadataPendingWritesRepository.prototype, 'upsert')
      .mockRejectedValue(new Error('simulated disk failure'));

    const neverWriter = {
      writeTags: async (): Promise<never> => {
        throw new Error('must never be reached');
      }
    } as unknown as TagWriterService;

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: neverWriter,
      historyService: history,
      getCurrentPlayingPath: () => fixture
    });

    const result = await orchestrator.execute([
      {
        mutationId: 'dur-rollback:1',
        operationId: 'dur-rollback',
        songId,
        filePath: fixture,
        fields: [{ fieldId: 'title', oldValue: 'Rollback Seed', newValue: 'Should Not Persist' }],
        fileWrite: { deferredIfPlaying: true },
        undo: { description: 'rollback probe' }
      }
    ]);

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.errors.join('; ')).toContain('DB phase failed');

    // Mutation rolled back (title unchanged in DB)
    const rows = await db.select().from(songs);
    expect(rows.find((r) => r.id === songId)?.title).toBe('Rollback Seed');

    // Journal rolled back too (no phantom undo entry)
    expect(await history.peekUndo(songId)).toBeUndefined();

    // No durable pending row left behind
    const items = await pendingRepo.listAll();
    expect(items.some((i) => i.songPath === fixture)).toBe(false);

    expect(upsertSpy).toHaveBeenCalled();
  });

  // P0 #2: a partial GROUP failure must keep durable undo coverage for every
  // song that actually committed (previously the whole group entry was
  // dropped, leaving committed songs unjournaled).
  it('partial group failure still journals the succeeded songs', async () => {
    const goodFixture = makeFixture();
    fixtures.push(goodFixture);
    const goodId = await seedSong('Group Good Seed', goodFixture);

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: new TagWriterServiceShim() as unknown as TagWriterService,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const operationId = 'dur-group-partial';
    const result = await orchestrator.execute(
      [
        {
          mutationId: `${operationId}:1`,
          operationId,
          songId: goodId,
          filePath: goodFixture,
          fields: [{ fieldId: 'title', oldValue: 'Group Good Seed', newValue: 'Group Good New' }],
          fileWrite: { deferredIfPlaying: true },
          undo: { description: 'group member 1' }
        },
        {
          mutationId: `${operationId}:2`,
          operationId,
          songId: 987654321, // nonexistent -> DB phase fails
          filePath: makeFixture(),
          fields: [{ fieldId: 'title', oldValue: '', newValue: 'Group Bad New' }],
          fileWrite: { deferredIfPlaying: true },
          undo: { description: 'group member 2' }
        }
      ],
      { groupUndo: { description: `AutoTag applied for group ${operationId}` } }
    );

    expect(result.updatedCount).toBe(1);
    expect(result.failedCount).toBe(1);

    // The single group journal entry covers EXACTLY the committed song
    const snap = await history.peekUndo(goodId);
    expect(snap?.id).toBe(`orch-group-${operationId}`);
    expect(snap?.previousSongs.map((s) => s.songId)).toEqual([goodId]);
    expect(snap?.songIds).toEqual([goodId]);

    // And the good song's DB mutation stands
    const rows = await db.select().from(songs);
    expect(rows.find((r) => r.id === goodId)?.title).toBe('Group Good New');
  });
  // P0 #3 companion: the journal entry written by an apply must be DURABLE -
  // recoverable by a freshly constructed service over the same repository
  // (restart simulation), not just an in-memory stack artifact.
  it('journal entry written by an apply is recoverable from durable storage alone', async () => {
    const fixture = makeFixture();
    fixtures.push(fixture);
    const songId = await seedSong('Durable Journal Seed', fixture);

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: new TagWriterServiceShim() as unknown as TagWriterService,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const result = await orchestrator.execute([
      {
        mutationId: 'dur-journal:1',
        operationId: 'dur-journal',
        songId,
        filePath: fixture,
        fields: [
          { fieldId: 'title', oldValue: 'Durable Journal Seed', newValue: 'Durable Journal New' },
          { fieldId: 'isrc', oldValue: null, newValue: 'USdur1234567' }
        ],
        fileWrite: { deferredIfPlaying: true },
        undo: { description: 'durable journal probe' }
      }
    ]);
    expect(result.success).toBe(true);

    // Fresh service over the same repository = what a restarted process sees
    const restarted = new MetadataHistoryService(new MetadataHistoryRepository(db));
    const snap = await restarted.peekUndo(songId);
    expect(snap?.id).toBe('orch-dur-journal:1');
    expect(snap?.previousSongs[0]?.title).toBe('Durable Journal Seed');
    expect(snap?.updatedSongs[0]?.title).toBe('Durable Journal New');
  });

  it('applying metadata with existing album title does not violate album_songs unique constraint and preserves album linkage', async () => {
    const fixture = makeFixture();
    fixtures.push(fixture);
    const songId = await seedSong('Album Link Test', fixture);

    // Pre-create album and link song to it
    const { createAlbum, linkSongToAlbum, getAlbumWithTitle } = await import('@main/db/queries/albums');
    const existing = await createAlbum({ title: 'Thriller Album' });
    await linkSongToAlbum(existing.id, songId);

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: new TagWriterServiceShim() as unknown as TagWriterService,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const result = await orchestrator.execute([
      {
        mutationId: 'dur-album-idemp:1',
        operationId: 'dur-album-idemp',
        songId,
        filePath: fixture,
        fields: [
          { fieldId: 'title', oldValue: 'Album Link Test', newValue: 'Album Link Test Updated' },
          { fieldId: 'album', oldValue: 'Thriller Album', newValue: 'Thriller Album' }
        ],
        fileWrite: { deferredIfPlaying: false },
        undo: { description: 'album idempotency probe' }
      }
    ]);

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    // Verify song is still linked to the album and album was not deleted
    const checkAlbum = await getAlbumWithTitle('Thriller Album');
    expect(checkAlbum).toBeDefined();
    expect(checkAlbum?.id).toBe(existing.id);
  });
});
