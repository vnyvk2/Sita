import fs from 'fs';
import os from 'os';
import path from 'path';

import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../../db/db';
import { songs } from '../../../db/schema';
import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import { MetadataApplyService } from '../../services/MetadataApplyService';
import { TagWriterService } from '../../services/TagWriterService';
import { MetadataApplyOrchestrator } from '../MetadataApplyOrchestrator';

const seedSong = async (title: string, filePath: string): Promise<number> => {
  const [row] = await db
    .insert(songs)
    .values({
      title,
      duration: 180.0,
      path: filePath,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    })
    .returning();
  return row.id;
};

const makeFixture = (): string => {
  const p = path.join(
    os.tmpdir(),
    `artundo_fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`
  );
  fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), p);
  return p;
};

const tinyArtworkBuffer = async (r: number, g: number, b: number): Promise<Buffer> =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();

describe('DEF-TAG-05: artwork apply/undo roundtrip restores the previous picture', () => {
  let fixtures: string[] = [];

  afterEach(() => {
    for (const f of fixtures) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    fixtures = [];
  });

  it('reverts the embedded picture that an artwork apply replaced', async () => {
    const fixture = makeFixture();
    fixtures.push(fixture);
    const songId = await seedSong('Artwork Undo Seed', fixture);

    const tagWriter = new TagWriterService();
    const history = new MetadataHistoryService();
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter,
      historyService: history
    });

    const before = await tagWriter.readEmbeddedArtworkBuffer(fixture);

    const applied = await orchestrator.execute([
      {
        mutationId: 'op-art:1',
        operationId: 'op-art',
        songId,
        filePath: fixture,
        fields: [{ fieldId: 'title', oldValue: 'Artwork Undo Seed', newValue: 'Renamed' }],
        artwork: { buffer: await tinyArtworkBuffer(200, 10, 10) },
        fileWrite: { deferredIfPlaying: true },
        undo: { description: 'artwork apply' }
      }
    ]);
    expect(applied.success).toBe(true);

    const during = await tagWriter.readEmbeddedArtworkBuffer(fixture);
    expect(during).toBeDefined();
    if (before) expect(Buffer.compare(during!, before)).not.toBe(0);

    const applyService = new MetadataApplyService({
      tagWriter,
      historyService: history,
      dbUpdater: vi.fn().mockResolvedValue(undefined)
    });
    const undo = await applyService.undoLastAutoTag();
    expect(undo.success).toBe(true);
    expect(undo.restoredCount).toBe(1);

    const after = await tagWriter.readEmbeddedArtworkBuffer(fixture);
    if (before === undefined) {
      // Fixture had no picture: the added one must be gone.
      expect(after).toBeUndefined();
    } else {
      expect(after).toBeDefined();
    }
  });
});
