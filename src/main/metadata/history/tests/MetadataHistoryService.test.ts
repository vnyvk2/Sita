import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../../db/db';
import type { MetadataHistorySnapshot } from '../MetadataHistoryService';
import { MetadataHistoryService } from '../MetadataHistoryService';
import { MetadataHistoryRepository } from '../MetadataHistoryRepository';

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
      isrc: 'ISRC-1',
      musicBrainzRecordingId: 'mbid-1'
    }
  ],
  updatedSongs: [{ songId: 1, path: `/music/${id}.mp3`, title }]
});

describe('MetadataHistoryService — durable undo journal', () => {
  let repository: MetadataHistoryRepository;

  beforeEach(async () => {
    repository = new MetadataHistoryRepository(db);
    await repository.clearAll();
  });

  it('persists snapshots and rehydrates them into a brand-new service instance (restart simulation)', async () => {
    const service = new MetadataHistoryService(repository);
    await service.pushSnapshot(makeSnapshot('snap-1', 'Album One'));
    await service.pushSnapshot(makeSnapshot('snap-2', 'Album Two'));

    // Fresh instance = what a restart would see
    const restarted = new MetadataHistoryService(repository);
    const top = await restarted.peekUndo();
    expect(top?.id).toBe('snap-2');
    expect(top?.previousSongs[0]?.title).toBe('Old Album Two');
    expect(restarted.canUndo).toBe(true);

    const older = await restarted.peekUndo('nonexistent-song' as unknown as number);
    expect(older).toBeUndefined();
  });

  it('peekUndo does not consume; only confirmUndo does', async () => {
    const service = new MetadataHistoryService(repository);
    await service.pushSnapshot(makeSnapshot('snap-1', 'Album One'));

    const firstPeek = await service.peekUndo();
    const secondPeek = await service.peekUndo();
    expect(firstPeek?.id).toBe('snap-1');
    expect(secondPeek?.id).toBe('snap-1');

    await service.confirmUndo('snap-1');
    expect(await service.peekUndo()).toBeUndefined();
    expect(service.canUndo).toBe(false);

    // Durable row is gone too
    const restarted = new MetadataHistoryService(repository);
    expect(await restarted.peekUndo()).toBeUndefined();
  });

  it('respects maxStackSize by keeping the newest snapshots', async () => {
    const service = new MetadataHistoryService(repository, 2);
    await service.pushSnapshot(makeSnapshot('a', 'A'));
    await service.pushSnapshot(makeSnapshot('b', 'B'));
    await service.pushSnapshot(makeSnapshot('c', 'C'));

    const restarted = new MetadataHistoryService(repository, 2);
    expect((await restarted.peekUndo())?.id).toBe('c');
    await restarted.confirmUndo('c');
    expect((await restarted.peekUndo())?.id).toBe('b');
  });

  it('peekUndo(targetSongId) finds the newest snapshot containing that song', async () => {
    const service = new MetadataHistoryService(repository);
    await service.pushSnapshot(makeSnapshot('other-album', 'Other'));
    const snap = makeSnapshot('mine', 'Mine');
    snap.previousSongs[0].songId = 777;
    snap.songIds = [777];
    await service.pushSnapshot(snap);

    const found = await service.peekUndo(777);
    expect(found?.id).toBe('mine');

    // Confirm removes exactly the targeted middle-of-stack entry
    await service.confirmUndo('mine');
    expect(await service.peekUndo(777)).toBeUndefined();
    expect((await service.peekUndo())?.id).toBe('other-album');
  });

  it('clear() empties both memory and durable storage', async () => {
    const service = new MetadataHistoryService(repository);
    await service.pushSnapshot(makeSnapshot('snap-1', 'One'));
    await service.clear();

    const restarted = new MetadataHistoryService(repository);
    expect(await restarted.peekUndo()).toBeUndefined();
  });
});
