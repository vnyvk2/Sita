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
import { CreateFolderOp, type CreateFolderInput } from '../operations/CreateFolderOp';
import { DuplicateOp, type DuplicateInput } from '../operations/DuplicateOp';
import { MergePlaylistsOp, type MergePlaylistsInput } from '../operations/MergePlaylistsOp';
import { MoveCollectionOp, type MoveCollectionInput } from '../operations/MoveCollectionOp';
import { BulkDeleteOp, BulkRestoreOp, type BulkDeleteInput, type BulkRestoreInput } from '../operations/BulkDeleteOp';
import { FolderStatisticsService } from './FolderStatisticsService';
import { HierarchyService } from './HierarchyService';
import { collectionEventBus } from '../events/CollectionEventBus';

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
  private readonly createFolderOp: CreateFolderOp;
  private readonly duplicateOp: DuplicateOp;
  private readonly mergeOp: MergePlaylistsOp;
  private readonly moveOp: MoveCollectionOp;
  private readonly bulkDeleteOp: BulkDeleteOp;
  private readonly bulkRestoreOp: BulkRestoreOp;
  
  private readonly folderStats: FolderStatisticsService;
  private readonly hierarchyService: HierarchyService;

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
    this.hierarchyService = new HierarchyService();
    this.createFolderOp = new CreateFolderOp(this.repository);
    this.duplicateOp = new DuplicateOp(this.repository);
    this.mergeOp = new MergePlaylistsOp(this.repository);
    this.moveOp = new MoveCollectionOp(this.repository, this.hierarchyService);
    this.bulkDeleteOp = new BulkDeleteOp(this.repository);
    this.bulkRestoreOp = new BulkRestoreOp(this.repository, this.hierarchyService);
    
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
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: input.playlistId, action: 'addSongs' } });
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
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: input.playlistId, action: 'removeSongs' } });
    return result.data;
  }

  public async renamePlaylist(input: RenameInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.renameOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: input.playlistId, action: 'rename' } });
    return result.data;
  }

  public async reorderSongs(input: ReorderInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.reorderOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: input.playlistId, action: 'reorder' } });
    return result.data;
  }

  public async deletePlaylist(input: DeleteInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.deleteOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionDeleted', payload: { collectionIds: [input.playlistId] } });
    return result.data;
  }

  public async pinPlaylist(input: PinInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.pinOp, input, ctx);
    });
    collectionEventBus.emitEvent({ type: 'CollectionPinned', payload: { collectionId: input.playlistId, isPinned: true } });
    return result.data;
  }

  public async unpinPlaylist(input: UnpinInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.unpinOp, input, ctx);
    });
    collectionEventBus.emitEvent({ type: 'CollectionPinned', payload: { collectionId: input.playlistId, isPinned: false } });
    return result.data;
  }

  public async createFolder(input: CreateFolderInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.createFolderOp, input, ctx);
    });
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: result.data, action: 'create' } });
    return result.data;
  }

  public async duplicatePlaylist(input: DuplicateInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.duplicateOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: input.playlistId, action: 'duplicate' } });
    return result.data;
  }

  public async mergePlaylists(input: MergePlaylistsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.mergeOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { collectionId: input.targetPlaylistId, action: 'merge' } });
    return result.data;
  }

  public async moveCollection(input: MoveCollectionInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.moveOp, input, ctx);
    });
    collectionEventBus.emitEvent({ type: 'CollectionMoved', payload: { collectionId: input.playlistId, newParentId: input.newParentId } });
    return result.data;
  }

  public async bulkDelete(input: BulkDeleteInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.bulkDeleteOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionDeleted', payload: { collectionIds: input.playlistIds } });
    return result.data;
  }

  public async bulkRestore(input: BulkRestoreInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.bulkRestoreOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({ type: 'CollectionChanged', payload: { action: 'bulkRestore' } });
    return result.data;
  }

  private invalidateCache(affectedSongIds: readonly number[]) {
    if (affectedSongIds.length > 0) {
      this.membershipService.invalidateSongs(affectedSongIds);
    }
  }
}
