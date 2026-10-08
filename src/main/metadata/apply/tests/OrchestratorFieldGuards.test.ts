import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { db } from '../../../db/db';
import { songs } from '../../../db/schema';
import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import type { TagWritePayload } from '../../services/TagWriterService';
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
    `fieldguard_fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`
  );
  fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), p);
  return p;
};

/** Minimal always-succeeding writer so tests can focus on payload construction. */
class TagWriterServiceShim {
  lastPayload?: TagWritePayload;
  async writeTags(payload: TagWritePayload) {
    this.lastPayload = payload;
    return { filePath: payload.filePath, success: true };
  }
}

describe('DEF-TAG-11: empty numerics never become 0 in file tags', () => {
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

  it('skips year/trackNumber/discNumber when the mutation value is empty', async () => {
    const fixture = makeFixture();
    fixtures.push(fixture);
    const songId = await seedSong('Numeric Guard Seed', fixture);
    const writer = new TagWriterServiceShim();
    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: writer as any,
      historyService: new MetadataHistoryService()
    });

    const res = await orchestrator.execute([
      {
        mutationId: 'op1:1',
        operationId: 'op1',
        songId,
        filePath: fixture,
        fields: [
          { fieldId: 'title', oldValue: 'Numeric Guard Seed', newValue: 'Renamed' },
          { fieldId: 'year', oldValue: 2020, newValue: '' },
          { fieldId: 'trackNumber', oldValue: 3, newValue: '' },
          { fieldId: 'discNumber', oldValue: 1, newValue: '' }
        ],
        fileWrite: { deferredIfPlaying: true },
        undo: { description: 'numeric guard' }
      }
    ]);

    expect(res.success).toBe(true);
    // Number('') === 0 must never reach the file writer.
    expect(writer.lastPayload?.title).toBe('Renamed');
    expect(writer.lastPayload?.year).toBeUndefined();
    expect(writer.lastPayload?.trackNumber).toBeUndefined();
    expect(writer.lastPayload?.discNumber).toBeUndefined();
  });
});
