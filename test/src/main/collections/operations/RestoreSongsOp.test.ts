import { RestoreSongsOp } from '@main/collections/operations/RestoreSongsOp';
import type { OperationContext } from '@main/collections/operations/types';
import type { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@main/collections/repositories/PlaylistRepository', () => ({
  PlaylistRepository: class MockPlaylistRepository {}
}));

const makeCtx = (): OperationContext => ({ trx: {} as never, membershipService: {} as never });

const baseEntry = {
  id: 101,
  playlistId: 1,
  songId: 500,
  position: 2,
  source: 'manual',
  addedAt: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z')
};

const makeRepo = () => ({
  restoreEntriesWithIds: vi.fn().mockResolvedValue([{ ...baseEntry }]),
  normalizePositions: vi.fn().mockResolvedValue(undefined),
  computeStatisticsDelta: vi.fn().mockResolvedValue({ itemCountDelta: 1, durationDelta: 180 })
});

describe('RestoreSongsOp', () => {
  it('renumbers the playlist after restoring entries with historical positions', async () => {
    // Regression: restored rows carry their pre-removal positions verbatim,
    // which can collide with positions taken on by later reorders. The op must
    // normalize the playlist so stored positions stay unique and contiguous.
    const repo = makeRepo();
    const ctx = makeCtx();

    await new RestoreSongsOp(repo as unknown as PlaylistRepository).execute(
      { playlistId: 1, entries: [baseEntry] },
      ctx
    );

    expect(repo.restoreEntriesWithIds).toHaveBeenCalledWith([baseEntry], ctx.trx);
    expect(repo.normalizePositions).toHaveBeenCalledWith(1, ctx.trx);
  });

  it('records an inverse that removes the restored entries again', async () => {
    const repo = makeRepo();

    const result = await new RestoreSongsOp(repo as unknown as PlaylistRepository).execute(
      { playlistId: 1, entries: [baseEntry] },
      makeCtx()
    );

    expect(result.inverseInput.operationType).toBe('playlist.removeSongs');
    expect(result.inverseInput.input).toEqual({ playlistId: 1, entryIds: [baseEntry.id] });
  });

  it('reports positive statistics deltas for the restored songs', async () => {
    const repo = makeRepo();

    const result = await new RestoreSongsOp(repo as unknown as PlaylistRepository).execute(
      { playlistId: 1, entries: [baseEntry] },
      makeCtx()
    );

    // Restoring re-adds entries, so item count and duration grow again
    expect(result.statsDelta).toEqual({
      targetPlaylistId: 1,
      itemCountDelta: 1,
      durationDelta: 180
    });
  });

  it('rejects an empty restore payload', async () => {
    const repo = makeRepo();

    await expect(
      new RestoreSongsOp(repo as unknown as PlaylistRepository).execute(
        { playlistId: 1, entries: [] },
        makeCtx()
      )
    ).rejects.toThrow('No entries provided');
    expect(repo.normalizePositions).not.toHaveBeenCalled();
  });

  it('coerces string timestamps from serialized journal payloads into dates', async () => {
    const repo = makeRepo();
    repo.restoreEntriesWithIds.mockResolvedValue([{ ...baseEntry }]);

    await new RestoreSongsOp(repo as unknown as PlaylistRepository).execute(
      {
        playlistId: 1,
        entries: [
          {
            ...baseEntry,
            addedAt: '2024-01-01T00:00:00.000Z',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      },
      makeCtx()
    );

    const inserted = repo.restoreEntriesWithIds.mock.calls[0][0];
    expect(inserted[0].addedAt).toBeInstanceOf(Date);
  });
});
