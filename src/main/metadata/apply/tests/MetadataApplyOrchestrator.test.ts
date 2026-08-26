import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { File } from 'node-taglib-sharp';

import { db } from '../../../db/db';
import { songs } from '../../../db/schema';
import type { NormalizedMutation } from '../contract';
import { MetadataApplyOrchestrator } from '../MetadataApplyOrchestrator';
import { TagWriterService } from '../../services/TagWriterService';
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
    tempSongPath = path.join(os.tmpdir(), `orch_test_${Date.now()}.mp3`);
    fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), tempSongPath);

    // Seed one song row pointing at the fixture
    await db.insert(songs).values({
      title: 'Seed Title',
      duration: '180.000',
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
});
