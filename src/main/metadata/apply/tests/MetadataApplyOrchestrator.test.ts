import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { File } from 'node-taglib-sharp';

import { eq } from 'drizzle-orm';
import { db } from '../../../db/db';
import { songs, metadataUndoSnapshots } from '../../../db/schema';
import type { NormalizedMutation } from '../contract';
import { MetadataApplyOrchestrator } from '../MetadataApplyOrchestrator';
import { TagWriterService } from '../../services/TagWriterService';
import { MetadataApplyService } from '../../services/MetadataApplyService';
import { AlbumAutoTagService } from '../../services/AlbumAutoTagService';
import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import { MetadataHistoryRepository } from '../../history/MetadataHistoryRepository';

vi.mock('@main/main', () => ({
  getCurrentSongPath: vi.fn(() => undefined),
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

describe('MetadataApplyOrchestrator — single authoritative transition', () => {
  let tempSongPath: string;

  beforeEach(async () => {
    await db.delete(songs);
    tempSongPath = path.join(os.tmpdir(), `orch_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
    fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), tempSongPath);

    // Seed one song row pointing at the fixture
    await db.insert(songs).values({
      title: 'Seed Title',
      duration: 180.000,
      path: tempSongPath,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date(),
      isrc: null,
      musicBrainzRecordingId: null
    });
    const seeded = await db.query.songs.findFirst();
    if (!seeded) throw new Error('seed failed');
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tempSongPath);
    } catch {
      /* ignore */
    }
  });

  it('applies scalar + identity fields to DB and physical file in one operation', async () => {
    const seeded = await db.query.songs.findFirst();
    expect(seeded).toBeDefined();

    const history = new MetadataHistoryService(new MetadataHistoryRepository(db));
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: new TagWriterService(),
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const mutation: NormalizedMutation = {
      mutationId: `op-x:${seeded!.id}`,
      operationId: 'op-x',
      songId: seeded!.id,
      filePath: tempSongPath,
      fields: [
        { fieldId: 'title', oldValue: 'Seed Title', newValue: 'Orchestrated Title' },
        { fieldId: 'isrc', oldValue: null, newValue: 'USUM71700099' }
      ],
      fileWrite: { deferredIfPlaying: true },
      undo: { description: 'P2 keystone apply' }
    };

    const result = await orchestrator.execute([mutation]);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);

    // DB side
    const row = await db.query.songs.findFirst();
    expect(row?.title).toBe('Orchestrated Title');
    expect(row?.isrc).toBe('USUM71700099');

    // File side
    const probe = File.createFromPath(tempSongPath);
    expect(probe.tag.title).toBe('Orchestrated Title');
    probe.dispose();

    // Undo journal captured durably
    expect(history.canUndo).toBe(true);
  });

  it('G2-02 / G2-04 (a): existing ISRC survives apply -> undo', async () => {
    const seeded = await db.query.songs.findFirst();
    await db.update(songs).set({ isrc: 'USRC17607839' }).where(eq(songs.id, seeded!.id));

    const f1 = File.createFromPath(tempSongPath);
    f1.tag.isrc = 'USRC17607839';
    f1.save();
    f1.dispose();

    const tagWriter = new TagWriterService();
    const history = new MetadataHistoryService(new MetadataHistoryRepository(db));
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });
    const applyService = new MetadataApplyService({ tagWriter, historyService: history });

    const mutation: NormalizedMutation = {
      mutationId: `op-isrc:${seeded!.id}`,
      operationId: 'op-isrc',
      songId: seeded!.id,
      filePath: tempSongPath,
      fields: [
        { fieldId: 'isrc', oldValue: 'USRC17607839', newValue: 'NEWISRC99999' }
      ],
      fileWrite: { deferredIfPlaying: true },
      undo: { description: 'Update ISRC' }
    };

    const applyRes = await orchestrator.execute([mutation]);
    expect(applyRes.success).toBe(true);

    const appliedRow = await db.query.songs.findFirst({ where: eq(songs.id, seeded!.id) });
    expect(appliedRow?.isrc).toBe('NEWISRC99999');
    const fApplied = File.createFromPath(tempSongPath);
    expect(fApplied.tag.isrc).toBe('NEWISRC99999');
    fApplied.dispose();

    const undoRes = await applyService.undoLastAutoTag();
    expect(undoRes.success).toBe(true);

    const fUndone = File.createFromPath(tempSongPath);
    expect(fUndone.tag.isrc).toBe('USRC17607839');
    fUndone.dispose();

    const undoneRow = await db.query.songs.findFirst({ where: eq(songs.id, seeded!.id) });
    expect(undoneRow?.isrc).toBe('USRC17607839');
  });

  it('G2-02 / G2-04 (b): existing MBID survives apply -> undo', async () => {
    const seeded = await db.query.songs.findFirst();
    await db.update(songs).set({ musicBrainzRecordingId: 'existing-mbid-uuid-1' }).where(eq(songs.id, seeded!.id));

    const f1 = File.createFromPath(tempSongPath);
    f1.tag.musicBrainzTrackId = 'existing-mbid-uuid-1';
    f1.save();
    f1.dispose();

    const tagWriter = new TagWriterService();
    const history = new MetadataHistoryService(new MetadataHistoryRepository(db));
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });
    const applyService = new MetadataApplyService({ tagWriter, historyService: history });

    const mutation: NormalizedMutation = {
      mutationId: `op-mbid:${seeded!.id}`,
      operationId: 'op-mbid',
      songId: seeded!.id,
      filePath: tempSongPath,
      fields: [
        { fieldId: 'musicBrainzRecordingId', oldValue: 'existing-mbid-uuid-1', newValue: 'new-mbid-uuid-2' }
      ],
      fileWrite: { deferredIfPlaying: true },
      undo: { description: 'Update MBID' }
    };

    const applyRes = await orchestrator.execute([mutation]);
    expect(applyRes.success).toBe(true);

    const fApplied = File.createFromPath(tempSongPath);
    expect(fApplied.tag.musicBrainzTrackId).toBe('new-mbid-uuid-2');
    fApplied.dispose();

    const undoRes = await applyService.undoLastAutoTag();
    expect(undoRes.success).toBe(true);

    const fUndone = File.createFromPath(tempSongPath);
    expect(fUndone.tag.musicBrainzTrackId).toBe('existing-mbid-uuid-1');
    fUndone.dispose();

    const undoneRow = await db.query.songs.findFirst({ where: eq(songs.id, seeded!.id) });
    expect(undoneRow?.musicBrainzRecordingId).toBe('existing-mbid-uuid-1');
  });

  it('G2-02 / G2-04 (c): absent ISRC/MBID remains absent after apply -> undo', async () => {
    const seeded = await db.query.songs.findFirst();
    await db.update(songs).set({ isrc: null, musicBrainzRecordingId: null }).where(eq(songs.id, seeded!.id));

    const tagWriter = new TagWriterService();
    const history = new MetadataHistoryService(new MetadataHistoryRepository(db));
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });
    const applyService = new MetadataApplyService({ tagWriter, historyService: history });

    const mutation: NormalizedMutation = {
      mutationId: `op-absent:${seeded!.id}`,
      operationId: 'op-absent',
      songId: seeded!.id,
      filePath: tempSongPath,
      fields: [
        { fieldId: 'isrc', oldValue: null, newValue: 'ADDED_ISRC' },
        { fieldId: 'musicBrainzRecordingId', oldValue: null, newValue: 'added-mbid' }
      ],
      fileWrite: { deferredIfPlaying: true },
      undo: { description: 'Add ISRC and MBID' }
    };

    const applyRes = await orchestrator.execute([mutation]);
    expect(applyRes.success).toBe(true);

    const fApplied = File.createFromPath(tempSongPath);
    expect(fApplied.tag.isrc).toBe('ADDED_ISRC');
    expect(fApplied.tag.musicBrainzTrackId).toBe('added-mbid');
    fApplied.dispose();

    const undoRes = await applyService.undoLastAutoTag();
    expect(undoRes.success).toBe(true);

    const fUndone = File.createFromPath(tempSongPath);
    expect(fUndone.tag.isrc).toBeFalsy();
    expect(fUndone.tag.musicBrainzTrackId).toBeFalsy();
    fUndone.dispose();

    const undoneRow = await db.query.songs.findFirst({ where: eq(songs.id, seeded!.id) });
    expect(undoneRow?.isrc).toBeFalsy();
    expect(undoneRow?.musicBrainzRecordingId).toBeFalsy();
  });

  it('G2-02 / G2-04 (d): stale/tampered renderer previousSongs cannot overwrite the real baseline', async () => {
    const seeded = await db.query.songs.findFirst();
    await db.update(songs).set({
      title: 'Real DB Title',
      isrc: 'REAL_DB_ISRC',
      musicBrainzRecordingId: 'real-db-mbid'
    }).where(eq(songs.id, seeded!.id));

    const tagWriter = new TagWriterService();
    const history = new MetadataHistoryService(new MetadataHistoryRepository(db));
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter,
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const mutation: NormalizedMutation = {
      mutationId: `op-spoof:${seeded!.id}`,
      operationId: 'op-spoof',
      songId: seeded!.id,
      filePath: tempSongPath,
      fields: [
        { fieldId: 'title', oldValue: 'FAKE_RENDERER_TITLE', newValue: 'New Applied Title' }
      ],
      fileWrite: { deferredIfPlaying: true },
      undo: {
        description: 'Spoofed apply',
        previousSongs: [
          {
            songId: seeded!.id,
            path: tempSongPath,
            title: 'SPOOFED_TITLE_ATTACK',
            isrc: 'SPOOFED_ISRC_ATTACK',
            musicBrainzRecordingId: 'spoofed-mbid-attack'
          }
        ]
      }
    };

    const applyRes = await orchestrator.execute([mutation]);
    expect(applyRes.success).toBe(true);

    const snap = await history.peekUndo();
    expect(snap).toBeDefined();
    const capturedPrevious = snap!.previousSongs[0];

    // Baseline MUST match trusted DB, NOT spoofed renderer input
    expect(capturedPrevious.title).toBe('Real DB Title');
    expect(capturedPrevious.isrc).toBe('REAL_DB_ISRC');
    expect(capturedPrevious.musicBrainzRecordingId).toBe('real-db-mbid');
  });

  it('G2-03 regression: applies two albums independently and verifies independent durable journal & in-memory undo groups', async () => {
    await db.delete(metadataUndoSnapshots);

    const tempSong1 = path.join(os.tmpdir(), `orch_alb1_${Date.now()}.mp3`);
    const tempSong2 = path.join(os.tmpdir(), `orch_alb2_${Date.now()}.mp3`);
    fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), tempSong1);
    fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), tempSong2);

    try {
      const [song1] = await db.insert(songs).values({
        title: 'Song 1 Old',
        duration: 180.000,
        path: tempSong1,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      }).returning();

      const [song2] = await db.insert(songs).values({
        title: 'Song 2 Old',
        duration: 200.000,
        path: tempSong2,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      }).returning();

      const historyService = new MetadataHistoryService(new MetadataHistoryRepository(db));
      const tagWriter = new TagWriterService();
      const orchestrator = new MetadataApplyOrchestrator({
        tagWriter,
        historyService,
        getCurrentPlayingPath: () => undefined
      });
      const applyService = new MetadataApplyService({ historyService, orchestrator, tagWriter });
      const autoTagService = new AlbumAutoTagService({
        albumMetadataService: {} as any,
        applyService
      });

      // Apply Album 1 with distinct operationId
      const preview1: any = {
        album: { title: 'OK Computer', artists: ['Radiohead'] },
        matches: [
          {
            localSongId: song1.id,
            songPath: tempSong1,
            oldTitle: 'Song 1 Old',
            applyTrack: true,
            fieldDiffs: [
              { fieldId: 'title', applyField: true, suggestedValue: 'Airbag', oldValue: 'Song 1 Old' }
            ]
          }
        ]
      };

      const res1 = await autoTagService.applyPreview(preview1, undefined, undefined, 'op-album-ok-computer');
      expect(res1.success).toBe(true);

      // Apply Album 2 with distinct operationId
      const preview2: any = {
        album: { title: 'Kid A', artists: ['Radiohead'] },
        matches: [
          {
            localSongId: song2.id,
            songPath: tempSong2,
            oldTitle: 'Song 2 Old',
            applyTrack: true,
            fieldDiffs: [
              { fieldId: 'title', applyField: true, suggestedValue: 'Everything in Its Right Place', oldValue: 'Song 2 Old' }
            ]
          }
        ]
      };

      const res2 = await autoTagService.applyPreview(preview2, undefined, undefined, 'op-album-kid-a');
      expect(res2.success).toBe(true);

      // 1. Verify in-memory undo history: 2 distinct snapshots, not collapsed
      const topSnap = await historyService.peekUndo();
      expect(topSnap).toBeDefined();
      expect(topSnap?.id).toBe('orch-group-op-album-kid-a');
      expect(topSnap?.albumTitle).toBe('Kid A');

      // 2. Verify durable storage: exactly 2 distinct rows preserved in metadataUndoSnapshots
      const durableSnapshots = await db.query.metadataUndoSnapshots.findMany();
      expect(durableSnapshots).toHaveLength(2);
      const groupIds = durableSnapshots.map((s) => s.id).sort();
      expect(groupIds).toEqual(['orch-group-op-album-kid-a', 'orch-group-op-album-ok-computer'].sort());

      // 3. Independent undo step 1: Undo Album 2
      const undo1 = await applyService.undoLastAutoTag();
      expect(undo1.success).toBe(true);

      const song2AfterUndo1 = await db.query.songs.findFirst({ where: eq(songs.id, song2.id) });
      expect(song2AfterUndo1?.title).toBe('Song 2 Old');

      // Album 1 is STILL applied
      const song1AfterUndo1 = await db.query.songs.findFirst({ where: eq(songs.id, song1.id) });
      expect(song1AfterUndo1?.title).toBe('Airbag');

      // 4. Independent undo step 2: Undo Album 1
      const undo2 = await applyService.undoLastAutoTag();
      expect(undo2.success).toBe(true);

      const song1AfterUndo2 = await db.query.songs.findFirst({ where: eq(songs.id, song1.id) });
      expect(song1AfterUndo2?.title).toBe('Song 1 Old');
    } finally {
      try { fs.unlinkSync(tempSong1); } catch {}
      try { fs.unlinkSync(tempSong2); } catch {}
    }
  });

  it('G2-03 regression: sequential applies with default operationId still generate independent durable and in-memory undo groups', async () => {
    await db.delete(metadataUndoSnapshots);

    const tempSong1 = path.join(os.tmpdir(), `orch_def1_${Date.now()}.mp3`);
    const tempSong2 = path.join(os.tmpdir(), `orch_def2_${Date.now()}.mp3`);
    fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), tempSong1);
    fs.copyFileSync(process.cwd() + '/test/assets/test_song.mp3', tempSong2);

    try {
      const [song1] = await db.insert(songs).values({
        title: 'Title 1',
        duration: 180.000,
        path: tempSong1,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      }).returning();

      const [song2] = await db.insert(songs).values({
        title: 'Title 2',
        duration: 200.000,
        path: tempSong2,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      }).returning();

      const historyService = new MetadataHistoryService(new MetadataHistoryRepository(db));
      const tagWriter = new TagWriterService();
      const orchestrator = new MetadataApplyOrchestrator({
        tagWriter,
        historyService,
        getCurrentPlayingPath: () => undefined
      });
      const applyService = new MetadataApplyService({ historyService, orchestrator, tagWriter });
      const autoTagService = new AlbumAutoTagService({
        albumMetadataService: {} as any,
        applyService
      });

      // Apply without specifying operationId (uses default)
      await autoTagService.applyPreview({
        album: { title: 'Album One' },
        matches: [{ localSongId: song1.id, songPath: tempSong1, oldTitle: 'Title 1', applyTrack: true, fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'New Title 1', oldValue: 'Title 1' }] }]
      } as any);

      await autoTagService.applyPreview({
        album: { title: 'Album Two' },
        matches: [{ localSongId: song2.id, songPath: tempSong2, oldTitle: 'Title 2', applyTrack: true, fieldDiffs: [{ fieldId: 'title', applyField: true, suggestedValue: 'New Title 2', oldValue: 'Title 2' }] }]
      } as any);

      const durableSnapshots = await db.query.metadataUndoSnapshots.findMany();
      // Neither snapshot was dropped: both exist in the database!
      expect(durableSnapshots).toHaveLength(2);
      expect(durableSnapshots[0].id).not.toBe(durableSnapshots[1].id);
      expect(durableSnapshots[0].id).not.toBe('orch-group-default');
      expect(durableSnapshots[1].id).not.toBe('orch-group-default');
    } finally {
      try { fs.unlinkSync(tempSong1); } catch {}
      try { fs.unlinkSync(tempSong2); } catch {}
    }
  }, 15000);
});
