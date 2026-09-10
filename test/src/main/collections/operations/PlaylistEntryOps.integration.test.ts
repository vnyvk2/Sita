import { randomUUID } from 'crypto';

import { operationJournal, playlists, songs } from '@db/schema';
import type { MembershipService } from '@main/collections/membership/MembershipService';
import { AddSongsOp } from '@main/collections/operations/AddSongsOp';
import { OperationExecutor } from '@main/collections/operations/OperationExecutor';
import { OperationJournalWriter } from '@main/collections/operations/OperationJournalWriter';
import { RemoveSongsOp } from '@main/collections/operations/RemoveSongsOp';
import { ReorderOp } from '@main/collections/operations/ReorderOp';
import { RestoreSongsOp } from '@main/collections/operations/RestoreSongsOp';
import type {
  CollectionOperation,
  OperationContext,
  OperationResult
} from '@main/collections/operations/types';
import { PlaylistRepository } from '@main/collections/repositories/PlaylistRepository';
import { db } from '@main/db/db';
import { eq, inArray } from 'drizzle-orm';

/**
 * Real-PGlite lifecycle proof for the entry-manipulation operations.
 *
 * Unlike the unit suites (which mock at the repository seam), this file executes every SQL
 * statement through the actual in-memory Postgres instance that db.ts provisions under vitest -
 * including the chunked VALUES update used by rank-based reordering and the post-restore position
 * normalization.
 *
 * Flow under test: add -> remove -> reorder -> restore, asserting persisted ordering AND playlist
 * metadata after each step.
 */

const repository = new PlaylistRepository();
// Mirrors production wiring in collections/setup.ts
const executor = new OperationExecutor(new OperationJournalWriter());

const makeCtx = (trx: Parameters<Parameters<typeof db.transaction>[0]>[0]): OperationContext => ({
  trx,
  membershipService: {} as unknown as MembershipService
});

async function execute<TInput, TResult>(
  op: CollectionOperation<TInput, TResult>,
  input: TInput
): Promise<OperationResult<TResult>> {
  return await db.transaction((trx) => executor.execute(op, input, makeCtx(trx)));
}

/** Ordered (entryId, songId) pairs exactly as the DB stores/ranks them. */
async function persistedOrder(playlistId: number) {
  const positions = await repository.getEntryPositions(playlistId);
  const entries = await db.query.playlistEntries.findMany({
    where: (e, { eq }) => eq(e.playlistId, playlistId)
  });
  const songByEntry = new Map(entries.map((e) => [e.id, e.songId]));
  return positions.map((p) => ({ entryId: p.entryId, songId: songByEntry.get(p.entryId)! }));
}

describe('PlaylistEntryOps integration (real PGlite)', () => {
  it('add -> remove -> reorder -> restore keeps ordering contiguous and metadata consistent', async () => {
    // ---- Seed ----
    const [playlist] = await db
      .insert(playlists)
      .values({ name: `lifecycle-audit-${randomUUID()}` })
      .returning();

    const seededSongs = await db
      .insert(songs)
      .values(
        ['S1', 'S2', 'S3', 'S4'].map((title) => ({
          title,
          duration: 180.0,
          path: `C:\\music\\${randomUUID()}.mp3`,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        }))
      )
      .returning();
    const songIds = seededSongs.map((s) => s.id);

    try {
      // ---- ADD ----
      const addResult = await execute(new AddSongsOp(repository), {
        playlistId: playlist.id,
        songIds
      });
      expect(addResult.data?.addedCount).toBe(4);

      let order = await persistedOrder(playlist.id);
      expect(order.map((o) => o.songId)).toEqual(songIds);
      let positions = (await repository.getEntryPositions(playlist.id)).map((p) => p.position);
      expect(positions).toEqual([0, 1, 2, 3]);

      let playlistRow = await repository.getById(playlist.id);
      expect(playlistRow?.itemCount).toBe(4);
      expect(parseFloat(String(playlistRow?.totalDuration))).toBeCloseTo(720, 0);

      // ---- REMOVE middle entry (S2, rank 1) -> leaves a gap by design ----
      const orderBeforeRemove = order;
      const removedEntryId = orderBeforeRemove[1].entryId;
      const removeResult = await execute(new RemoveSongsOp(repository), {
        playlistId: playlist.id,
        entryIds: [removedEntryId]
      });
      expect(removeResult.data?.removedCount).toBe(1);

      positions = (await repository.getEntryPositions(playlist.id)).map((p) => p.position);
      expect(positions).toEqual([0, 2, 3]); // gapped, exactly like production removals

      playlistRow = await repository.getById(playlist.id);
      expect(playlistRow?.itemCount).toBe(3);
      expect(parseFloat(String(playlistRow?.totalDuration))).toBeCloseTo(540, 0);

      // ---- REORDER: move last visible row to the top using a DENSE rank ----
      // The UI sends ranks, not stored positions. With stored {0,2,3}, sending
      // newPosition=0 must land S4 at the TRUE first slot and heal the gap -
      // this is the exact statement path (updatePositionsBulk) that had no
      // runtime coverage before.
      const remaining = await persistedOrder(playlist.id); // [S1, S3, S4]
      const tailSongId = remaining[2].songId;

      await execute(new ReorderOp(repository), {
        playlistId: playlist.id,
        entryId: remaining[2].entryId,
        newPosition: 0
      });

      order = await persistedOrder(playlist.id);
      expect(order.map((o) => o.songId)).toEqual([tailSongId, songIds[0], songIds[2]]);
      positions = (await repository.getEntryPositions(playlist.id)).map((p) => p.position);
      expect(positions).toEqual([0, 1, 2]); // gaps healed to contiguous ranks

      // Out-of-range ranks clamp against real data instead of corrupting it
      await execute(new ReorderOp(repository), {
        playlistId: playlist.id,
        entryId: remaining[2].entryId,
        newPosition: 9999
      });
      order = await persistedOrder(playlist.id);
      expect(order.map((o) => o.songId)).toEqual([songIds[0], songIds[2], tailSongId]);

      // ---- RESTORE the removed entry (historical position now collides) ----
      const restoreInput = removeResult.inverseInput.input as {
        playlistId: number;
        entries: unknown[];
      };
      expect(restoreInput.entries).toHaveLength(1);

      // The undo payload carries the OLD dense position (1), which is now
      // occupied after the reorder - normalizePositions must resolve the
      // collision into unique contiguous ranks.
      const restoreResult = await execute(new RestoreSongsOp(repository), restoreInput as never);
      expect(restoreResult.data?.restoredCount).toBe(1);

      positions = (await repository.getEntryPositions(playlist.id)).map((p) => p.position);
      expect(new Set(positions).size).toBe(positions.length); // unique
      expect([...positions].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]); // contiguous

      order = await persistedOrder(playlist.id);
      expect(order.some((o) => o.songId === songIds[1])).toBe(true);

      playlistRow = await repository.getById(playlist.id);
      expect(playlistRow?.itemCount).toBe(4);
      expect(parseFloat(String(playlistRow?.totalDuration))).toBeCloseTo(720, 0);
    } finally {
      await db.delete(operationJournal).where(eq(operationJournal.collectionId, playlist.id));
      await db.delete(playlists).where(eq(playlists.id, playlist.id)); // cascades entries
      await db.delete(songs).where(inArray(songs.id, songIds));
    }
  });
});
