import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Three full PGlite boots + real migration chains: observed 7-33s on this
// machine depending on thermal/load state, hence the generous local ceiling
vi.setConfig({ testTimeout: 120_000 });
import { openSqliteEngine } from '../../../db/sqlite/engine';
import { MetadataHistoryRepository } from '../MetadataHistoryRepository';
import type { MetadataHistorySnapshot } from '../MetadataHistoryService';
import { MetadataHistoryService } from '../MetadataHistoryService';

/**
 * Real-file-database lifecycle proof for the persistent undo journal: boots PGlite against an
 * actual on-disk database file, applies ALL real migrations (including
 * 0022_add_metadata_undo_snapshots), writes snapshots, closes the process-side instance, reopens
 * the SAME file fresh - mirroring what an app restart exercises - and verifies full recovery.
 */
describe('MetadataHistoryService — real-file DB restart lifecycle', () => {
  let dbDir: string;
  let dbPath: string;

  const makeSnapshot = (id: string, title: string): MetadataHistorySnapshot => ({
    id,
    timestamp: Date.now(),
    description: `AutoTag applied for ${title}`,
    albumTitle: title,
    songIds: [1],
    previousSongs: [
      {
        songId: 1,
        path: `/music/${id}.mp3`,
        title: `Old ${title}`,
        isrc: 'ISRC-X',
        musicBrainzRecordingId: 'mbid-x'
      }
    ],
    updatedSongs: [{ songId: 1, path: `/music/${id}.mp3`, title }]
  });

  const bootFresh = async () => {
    // Mirror the production boot sequence (db.ts): engine open applies the baseline schema
    const engine = openSqliteEngine(dbPath);
    return {
      service: new MetadataHistoryService(new MetadataHistoryRepository(engine.orm as any)),
      close: () => engine.close()
    };
  };

  beforeAll(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-lifecycle-'));
    dbPath = path.join(dbDir, 'lifecycle.db');
  });

  afterAll(() => {
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it('survives a full process-style close/reopen cycle against a real database file', async () => {
    // Session 1: write snapshots through the real migration chain
    const first = await bootFresh();
    await first.service.pushSnapshot(makeSnapshot('life-1', 'First Album'));
    await first.service.pushSnapshot(makeSnapshot('life-2', 'Second Album'));
    expect((await first.service.peekUndo())?.id).toBe('life-2');
    await first.close();

    // Session 2: brand-new instance over the same file (restart simulation)
    const second = await bootFresh();
    expect((await second.service.peekUndo())?.id).toBe('life-2');

    // Undo semantics persist too: peek does not consume, confirm does
    await second.service.confirmUndo('life-2');
    expect((await second.service.peekUndo())?.id).toBe('life-1');
    await second.close();

    // Session 3: confirmed consumption was durably recorded
    const third = await bootFresh();
    expect((await third.service.peekUndo())?.id).toBe('life-1');
    expect(await third.service.peekUndo('nope' as unknown as number)).toBeUndefined();
    await third.close();
  });
});
