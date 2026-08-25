import { describe, expect, it, vi } from 'vitest';
import { ReorderOp } from '@main/collections/operations/ReorderOp';
import type { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import type { OperationContext } from '@main/collections/operations/types';

vi.mock('@main/collections/repositories/PlaylistRepository', () => ({
  PlaylistRepository: class MockPlaylistRepository {}
}));

type EntryRow = { entryId: number; position: number };

/** Builds ordered rows from a plain visual order (rank == position). */
const contiguous = (ids: number[]): EntryRow[] => ids.map((entryId, position) => ({ entryId, position }));

const makeRepo = (rows: EntryRow[]) => ({
  // Repository contract: rows arrive sorted by visual order (position, id)
  getEntryPositions: vi
    .fn()
    .mockResolvedValue(
      structuredClone(rows).sort((a, b) => a.position - b.position || a.entryId - b.entryId)
    ),
  updatePositionsBulk: vi.fn().mockResolvedValue(undefined)
});

const makeCtx = (): OperationContext => ({ trx: {} as never, membershipService: {} as never });

/** Applies the captured bulk-update calls onto an order snapshot. */
const applyUpdates = (
  initial: EntryRow[],
  calls: { entryId: number; position: number }[][]
): EntryRow[] => {
  const result = initial.map((row) => ({ ...row }));
  for (const call of calls) {
    for (const { entryId, position } of call) {
      const row = result.find((r) => r.entryId === entryId);
      if (!row) throw new Error(`update for unknown entry ${entryId}`);
      row.position = position;
    }
  }
  return result;
};

describe('ReorderOp', () => {
  it('moves an entry down within a contiguous playlist', async () => {
    const repo = makeRepo(contiguous([10, 11, 12, 13]));
    const op = new ReorderOp(repo as unknown as PlaylistRepository);

    await op.execute({ playlistId: 1, entryId: 10, newPosition: 2 }, makeCtx());

    expect(repo.updatePositionsBulk).toHaveBeenCalledTimes(1);
    const writes = repo.updatePositionsBulk.mock.calls[0][1];
    // Only the three affected rows are rewritten
    expect(writes.sort((a, b) => a.position - b.position)).toEqual([
      { entryId: 11, position: 0 },
      { entryId: 12, position: 1 },
      { entryId: 10, position: 2 }
    ]);
  });

  it('lands an entry exactly where dropped when stored positions contain gaps', async () => {
    // Regression: UI sends dense ranks while legacy data has gapped stored
    // positions after removals. Moving the first row to the LAST visible slot
    // must put it at the true end, healing the gaps along the way.
    const rows: EntryRow[] = [
      { entryId: 10, position: 0 },
      { entryId: 11, position: 2 },
      { entryId: 12, position: 3 },
      { entryId: 13, position: 4 }
    ];
    const repo = makeRepo(rows);
    const op = new ReorderOp(repo as unknown as PlaylistRepository);

    await op.execute({ playlistId: 1, entryId: 10, newPosition: 3 }, makeCtx());

    const finalRows = applyUpdates(
      rows,
      repo.updatePositionsBulk.mock.calls.map((call) => call[1])
    );
    const orderById = [...finalRows].sort((a, b) => a.position - b.position).map((r) => r.entryId);
    expect(orderById).toEqual([11, 12, 13, 10]);
    const positions = finalRows.map((r) => r.position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('clamps out-of-range target ranks into the valid range', async () => {
    const rows = contiguous([10, 11, 12]);

    const negativeRepo = makeRepo(rows);
    await new ReorderOp(negativeRepo as unknown as PlaylistRepository).execute(
      { playlistId: 1, entryId: 12, newPosition: -50 },
      makeCtx()
    );
    const negativeWrites = negativeRepo.updatePositionsBulk.mock.calls[0][1];
    expect(negativeWrites).toContainEqual({ entryId: 12, position: 0 });

    const overflowRepo = makeRepo(rows);
    await new ReorderOp(overflowRepo as unknown as PlaylistRepository).execute(
      { playlistId: 1, entryId: 10, newPosition: 9999 },
      makeCtx()
    );
    const overflowWrites = overflowRepo.updatePositionsBulk.mock.calls[0][1];
    expect(overflowWrites).toContainEqual({ entryId: 10, position: 2 });
  });

  it('performs no writes when the requested rank equals the current rank', async () => {
    const repo = makeRepo(contiguous([10, 11]));
    const op = new ReorderOp(repo as unknown as PlaylistRepository);

    const result = await op.execute({ playlistId: 1, entryId: 10, newPosition: 0 }, makeCtx());

    expect(repo.getEntryPositions).toHaveBeenCalledTimes(1);
    expect(repo.updatePositionsBulk).not.toHaveBeenCalled();
    expect(result.inverseInput.input).toEqual({ playlistId: 1, entryId: 10, newPosition: 0 });
  });

  it('treats a single-entry playlist as a no-op regardless of requested rank', async () => {
    const repo = makeRepo(contiguous([42]));
    const op = new ReorderOp(repo as unknown as PlaylistRepository);

    await op.execute({ playlistId: 1, entryId: 42, newPosition: 7 }, makeCtx());

    expect(repo.updatePositionsBulk).not.toHaveBeenCalled();
  });

  it('rejects entries that do not belong to the playlist', async () => {
    const repo = makeRepo(contiguous([10, 11]));
    const op = new ReorderOp(repo as unknown as PlaylistRepository);

    await expect(
      op.execute({ playlistId: 1, entryId: 999, newPosition: 0 }, makeCtx())
    ).rejects.toThrow('Entry 999 not found');
  });

  it('returns an inverse input that restores the previous order when executed', async () => {
    const rows = contiguous([10, 11, 12]);
    const forwardRepo = makeRepo(rows);
    const op = new ReorderOp(forwardRepo as unknown as PlaylistRepository);

    const result = await op.execute({ playlistId: 1, entryId: 10, newPosition: 2 }, makeCtx());
    expect(result.inverseInput.operationType).toBe('playlist.reorder');

    // Replay the recorded inverse against the post-move state
    const afterForward = applyUpdates(
      rows,
      forwardRepo.updatePositionsBulk.mock.calls.map((call) => call[1])
    );
    const undoRepo = makeRepo(afterForward);
    await new ReorderOp(undoRepo as unknown as PlaylistRepository).execute(
      result.inverseInput.input as { playlistId: number; entryId: number; newPosition: number },
      makeCtx()
    );

    const restored = applyUpdates(
      afterForward,
      undoRepo.updatePositionsBulk.mock.calls.map((call) => call[1])
    );
    const orderById = [...restored].sort((a, b) => a.position - b.position).map((r) => r.entryId);
    expect(orderById).toEqual([10, 11, 12]);
  });
});
