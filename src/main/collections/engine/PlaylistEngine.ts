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
import { PinOp, type PinInput } from '../operations/PinOp';
import { UnpinOp, type UnpinInput } from '../operations/PinOp';
import { FolderStatisticsService } from './FolderStatisticsService';

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
  private readonly pinOp: PinOp;
  private readonly unpinOp: UnpinOp;
  private readonly folderStats: FolderStatisticsService;

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
    this.pinOp = new PinOp();
    this.unpinOp = new UnpinOp();
    this.folderStats = new FolderStatisticsService();
  }

  public async addSongs(input: AddSongsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      const res = await this.executor.execute(this.addSongsOp, input, ctx);
      
      const { deltaCount, deltaDuration } = res.data;
      await this.repository.applyStatisticsDelta(input.playlistId, { itemCountDelta: deltaCount, durationDelta: deltaDuration }, trx);
      await this.folderStats.propagateStats(input.playlistId, deltaCount, deltaDuration, trx);
      
      return res;
    });

    this.invalidateCache(result.affectedSongIds);
    return result.data;
  }

  public async removeSongs(input: RemoveSongsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      const res = await this.executor.execute(this.removeSongsOp, input, ctx);
      
      const { deltaCount, deltaDuration } = res.data;
      await this.repository.applyStatisticsDelta(input.playlistId, { itemCountDelta: deltaCount, durationDelta: deltaDuration }, trx);
      await this.folderStats.propagateStats(input.playlistId, deltaCount, deltaDuration, trx);
      
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

  public async pinPlaylist(input: PinInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.pinOp, input, ctx);
    });
    return result.data;
  }

  public async unpinPlaylist(input: UnpinInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.unpinOp, input, ctx);
    });
    return result.data;
  }

  private invalidateCache(affectedSongIds: readonly number[]) {
    if (affectedSongIds.length > 0) {
      this.membershipService.invalidateSongs(affectedSongIds);
    }
  }
}
