import { db } from '../../db/db';
import type { MembershipService } from '../membership/MembershipService';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { OperationExecutor } from '../operations/OperationExecutor';
import type { OperationContext } from '../operations/types';

import { AddSongsOp, type AddSongsInput } from '../operations/AddSongsOp';
import { RemoveSongsOp, type RemoveSongsInput } from '../operations/RemoveSongsOp';
import { RenameOp, type RenameInput } from '../operations/RenameOp';
import { ReorderOp, type ReorderInput } from '../operations/ReorderOp';
import { DeleteOp, type DeleteInput } from '../operations/DeleteOp';

export class PlaylistEngine {
  private readonly repository: PlaylistRepository;
  private readonly membershipService: MembershipService;
  private readonly executor: OperationExecutor;

  // Cached operation instances to avoid recreating them
  private readonly addSongsOp: AddSongsOp;
  private readonly removeSongsOp: RemoveSongsOp;
  private readonly renameOp: RenameOp;
  private readonly reorderOp: ReorderOp;
  private readonly deleteOp: DeleteOp;

  constructor(
    repository: PlaylistRepository,
    membershipService: MembershipService,
    executor: OperationExecutor
  ) {
    this.repository = repository;
    this.membershipService = membershipService;
    this.executor = executor;

    this.addSongsOp = new AddSongsOp(this.repository);
    this.removeSongsOp = new RemoveSongsOp(this.repository);
    this.renameOp = new RenameOp(this.repository);
    this.reorderOp = new ReorderOp(this.repository);
    this.deleteOp = new DeleteOp(this.repository);
  }

  public async addSongs(input: AddSongsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      const res = await this.executor.execute(this.addSongsOp, input, ctx);
      
      await this.repository.recalculatePlaylistStatistics(input.playlistId, trx);
      
      return res;
    });

    this.invalidateCache(result.affectedSongIds);
    return result.data;
  }

  public async removeSongs(input: RemoveSongsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      const res = await this.executor.execute(this.removeSongsOp, input, ctx);
      
      await this.repository.recalculatePlaylistStatistics(input.playlistId, trx);
      
      return res;
    });

    this.invalidateCache(result.affectedSongIds);
    return result.data;
  }

  public async renamePlaylist(input: RenameInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.renameOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    return result.data;
  }

  public async reorderSongs(input: ReorderInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.reorderOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    return result.data;
  }

  public async deletePlaylist(input: DeleteInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.deleteOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    return result.data;
  }

  private invalidateCache(affectedSongIds: readonly number[]) {
    if (affectedSongIds.length > 0) {
      this.membershipService.invalidateSongs(affectedSongIds);
    }
  }
}
