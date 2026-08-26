import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { File } from 'node-taglib-sharp';

import { db } from '../../../db/db';
import { songs, albums, albumsArtists, artists } from '../../../db/schema';
import { MetadataApplyOrchestrator } from '../MetadataApplyOrchestrator';
import { TagWriterService } from '../../services/TagWriterService';
import { MetadataHistoryService } from '../../history/MetadataHistoryService';
import { MetadataHistoryRepository } from '../../history/MetadataHistoryRepository';
import { MetadataWorkflowService } from '../../services/MetadataWorkflowService';
import type { MetadataWorkflow, WorkflowPreview } from '../../workflows/MetadataWorkflow';

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
  const p = path.join(os.tmpdir(), `audit_fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
  fs.copyFileSync(path.join(process.cwd(), 'test', 'assets', 'test_song.mp3'), p);
  return p;
};

describe('Audit regressions (post-review fixes)', () => {
  let history: MetadataHistoryService;

  beforeEach(() => {
    history = new MetadataHistoryService(new MetadataHistoryRepository(db));
  });

  // Audit P0 #1: WorkflowService.applyPreview previously wrapped itself in the
  // single-flight mutex AND delegated to orchestrator.execute which acquires
  // the same mutex -> every workflow apply self-rejected.
  it('workflow applyPreview through orchestrator does NOT self-reject on the mutex', async () => {
    const fixture = makeFixture();
    const songId = await seedSong('Mutex Regression', fixture);

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: new TagWriterService(),
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const workflowService = new MetadataWorkflowService({ transactionManager: {} as never, orchestrator });

    const stubWorkflow: MetadataWorkflow = {
      type: 'album',
      displayName: 'Stub',
      supportedFields: [],
      preferredProviders: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: vi.fn().mockResolvedValue([]) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildPreview: vi.fn().mockResolvedValue({}) as any,
      buildMutations: () => [
        {
          resourceId: songId,
          filePath: fixture,
          fieldMutations: [{ fieldId: 'title', oldValue: 'Mutex Regression', newValue: 'Mutex Fixed' }]
        }
      ]
    } as unknown as MetadataWorkflow;
    workflowService.registerWorkflow(stubWorkflow);

    const preview = { matches: [] } as unknown as WorkflowPreview;
    const result = await workflowService.applyPreview('album', preview, ['title']);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);

    const probe = File.createFromPath(fixture);
    expect(probe.tag.title).toBe('Mutex Fixed');
    probe.dispose();
    fs.unlinkSync(fixture);

    // And the mutex is free afterwards (implicit: this test itself ran the
    // full service->orchestrator stack through a single mutex acquisition).
  });

  // Audit P1 #4: album + albumArtist mutated together must link the junction
  // to the NEW album, not the stale pre-sync album reference.
  it('album+albumArtist together: junction lands on the new album', async () => {
    const fixture = makeFixture();
    const songId = await seedSong('Stale Album Regression', fixture);

    const orchestrator = new MetadataApplyOrchestrator({
      tagWriter: new TagWriterService(),
      historyService: history,
      getCurrentPlayingPath: () => undefined
    });

    const result = await orchestrator.execute([
      {
        mutationId: 'audit-stale-album',
        operationId: 'audit',
        songId,
        filePath: fixture,
        fields: [
          { fieldId: 'album', oldValue: null, newValue: 'Brand New Album' },
          { fieldId: 'artist', oldValue: null, newValue: 'Solo Artist' }
        ],
        albumArtistNewValue: 'Various Artists',
        fileWrite: { deferredIfPlaying: true },
        undo: { description: 'stale album regression' }
      }
    ]);

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);

    const albumRow = await db.select().from(albums);
    const target = albumRow.find((a) => a.title === 'Brand New Album');
    expect(target).toBeDefined();

    const artistRow = await db.select().from(artists);
    const va = artistRow.find((a) => a.name === 'Various Artists');
    expect(va).toBeDefined();

    const junction = await db.select().from(albumsArtists);
    expect(junction.some((j) => j.albumId === target!.id && j.artistId === va!.id)).toBe(true);
    fs.unlinkSync(fixture);
  });
});
