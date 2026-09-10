import { eq, sql } from 'drizzle-orm';

import type {
  AddSongsInput,
  BulkDeleteInput,
  CreateFolderInput,
  CreatePlaylistInput,
  CreateSmartPlaylistInput,
  DeleteInput,
  DuplicateInput,
  MergePlaylistsInput,
  MoveCollectionInput,
  PinInput,
  RemoveSongsInput,
  RenameInput,
  ReorderInput,
  UnpinInput,
  UpdateSmartPlaylistInput
} from '../../../common/collections/operationInputs';
import type {
  SmartPlaylistDefinition,
  SmartPlaylistPreviewResult
} from '../../../common/collections/smartPlaylist';
import getSongInfo from '../../core/getSongInfo';
import { db } from '../../db/db';
import {
  albums,
  albumsSongs,
  artists,
  artistsSongs,
  genres,
  genresSongs,
  songs
} from '../../db/schema';
import { generateLocalArtworkBuffer } from '../../filesystem/artworkBuffers';
import { processArtworkFiles } from '../../other/artworks';
import { collectionEventBus } from '../events/CollectionEventBus';
import type { MembershipService } from '../membership/MembershipService';
import { AddSongsOp } from '../operations/AddSongsOp';
import { BulkDeleteOp, BulkRestoreOp, type BulkRestoreInput } from '../operations/BulkDeleteOp';
import { CreateFolderOp } from '../operations/CreateFolderOp';
import { CreatePlaylistOp } from '../operations/CreatePlaylistOp';
import { DeleteOp } from '../operations/DeleteOp';
import { DuplicateExecutor } from '../operations/DuplicateExecutor';
import { DuplicateOp } from '../operations/DuplicateOp';
import { DuplicatePlanner } from '../operations/DuplicatePlanner';
import { MergePlaylistsOp } from '../operations/MergePlaylistsOp';
import { MoveCollectionOp } from '../operations/MoveCollectionOp';
import type { OperationExecutor } from '../operations/OperationExecutor';
import { PinOp, UnpinOp } from '../operations/PinOp';
import { RemoveSongsOp } from '../operations/RemoveSongsOp';
import { RenameOp } from '../operations/RenameOp';
import { ReorderOp } from '../operations/ReorderOp';
import { SetArtworkOp, type SetArtworkInput } from '../operations/SetArtworkOp';
import { CreateSmartPlaylistOp } from '../operations/smart/CreateSmartPlaylistOp';
import { UpdateSmartPlaylistOp } from '../operations/smart/UpdateSmartPlaylistOp';
import type { OperationContext } from '../operations/types';
import { QueryPlanner } from '../query/QueryPlanner';
import { SmartPlaylistCompiler } from '../query/SmartPlaylistCompiler';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import { FolderStatisticsService } from './FolderStatisticsService';
import { HierarchyService } from './HierarchyService';
import { SmartPlaylistEngine } from './SmartPlaylistEngine';

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
  private readonly createPlaylistOp: CreatePlaylistOp;
  private readonly duplicateOp: DuplicateOp;
  private readonly mergeOp: MergePlaylistsOp;
  private readonly moveOp: MoveCollectionOp;
  private readonly bulkDeleteOp: BulkDeleteOp;
  private readonly bulkRestoreOp: BulkRestoreOp;
  private readonly setArtworkOp: SetArtworkOp;
  private readonly createSmartPlaylistOp: CreateSmartPlaylistOp;
  private readonly updateSmartPlaylistOp: UpdateSmartPlaylistOp;
  private readonly smartEngine: SmartPlaylistEngine;
  private readonly queryPlanner: QueryPlanner;
  private readonly compiler: SmartPlaylistCompiler;

  public readonly folderStats: FolderStatisticsService;
  private readonly hierarchyService: HierarchyService;

  constructor(
    repository: PlaylistRepository,
    membershipService: MembershipService,
    executor: OperationExecutor,
    hierarchyService: HierarchyService
  ) {
    this.repository = repository;
    this.membershipService = membershipService;
    this.executor = executor;
    this.hierarchyService = hierarchyService;

    this.addSongsOp = new AddSongsOp(this.repository);
    this.removeSongsOp = new RemoveSongsOp(this.repository);
    this.renameOp = new RenameOp(this.repository);
    this.reorderOp = new ReorderOp(this.repository);
    this.deleteOp = new DeleteOp(this.repository);
    this.pinOp = new PinOp();
    this.unpinOp = new UnpinOp();
    this.createFolderOp = new CreateFolderOp(this.repository);
    this.createPlaylistOp = new CreatePlaylistOp(this.repository);
    this.duplicateOp = new DuplicateOp(
      new DuplicatePlanner(this.hierarchyService),
      new DuplicateExecutor()
    );
    this.mergeOp = new MergePlaylistsOp(this.repository);
    this.moveOp = new MoveCollectionOp(this.hierarchyService);
    this.bulkDeleteOp = new BulkDeleteOp(this.repository);
    this.bulkRestoreOp = new BulkRestoreOp(this.repository, this.hierarchyService);
    this.setArtworkOp = new SetArtworkOp(this.repository);
    this.createSmartPlaylistOp = new CreateSmartPlaylistOp();
    this.updateSmartPlaylistOp = new UpdateSmartPlaylistOp();
    this.smartEngine = new SmartPlaylistEngine(this.membershipService);
    this.queryPlanner = new QueryPlanner();
    this.compiler = new SmartPlaylistCompiler();

    this.folderStats = new FolderStatisticsService();
  }

  public async addSongs(input: AddSongsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.addSongsOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'addSongs' }
    });
    return result.data;
  }

  public async removeSongs(input: RemoveSongsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.removeSongsOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'removeSongs' }
    });
    return result.data;
  }

  public async renamePlaylist(input: RenameInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.renameOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'rename' }
    });
    return result.data;
  }

  public async reorderSongs(input: ReorderInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.reorderOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'reorder' }
    });
    return result.data;
  }

  public async deletePlaylist(input: DeleteInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.deleteOp, input, ctx);
    });

    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionDeleted',
      payload: { collectionIds: [input.playlistId] }
    });
    return result.data;
  }

  public async pinPlaylist(input: PinInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.pinOp, input, ctx);
    });
    collectionEventBus.emitEvent({
      type: 'CollectionPinned',
      payload: { collectionId: input.playlistId, isPinned: true }
    });
    return result.data;
  }

  public async unpinPlaylist(input: UnpinInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.unpinOp, input, ctx);
    });
    collectionEventBus.emitEvent({
      type: 'CollectionPinned',
      payload: { collectionId: input.playlistId, isPinned: false }
    });
    return result.data;
  }

  public async createFolder(input: CreateFolderInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.createFolderOp, input, ctx);
    });
    collectionEventBus.emitEvent({
      type: 'CollectionCreated',
      payload: { collectionId: result.data, parentId: input.parentId ?? null }
    });
    return result.data;
  }

  public async createPlaylist(input: CreatePlaylistInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.createPlaylistOp, input, ctx);
    });
    collectionEventBus.emitEvent({
      type: 'CollectionCreated',
      payload: { collectionId: result.data, parentId: input.parentId ?? null }
    });
    return result.data;
  }

  public async createSmartPlaylist(input: CreateSmartPlaylistInput): Promise<number> {
    const playlistId = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      const result = await this.executor.execute(this.createSmartPlaylistOp, input, ctx);
      const newPlaylistId = result.data;
      await this.smartEngine.regenerate(newPlaylistId, trx);
      return newPlaylistId;
    });

    collectionEventBus.emitEvent({
      type: 'CollectionCreated',
      payload: { collectionId: playlistId, parentId: input.parentId ?? null }
    });
    return playlistId;
  }

  public async updateSmartPlaylist(input: UpdateSmartPlaylistInput): Promise<void> {
    await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      await this.executor.execute(this.updateSmartPlaylistOp, input, ctx);
      await this.smartEngine.regenerate(input.playlistId, trx);
    });

    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'updateSmartRule' }
    });
  }

  public async previewSmartPlaylist(
    definition: SmartPlaylistDefinition,
    maxEntries?: number | null
  ): Promise<SmartPlaylistPreviewResult> {
    const plan = this.queryPlanner.plan(definition);
    const predicate = this.compiler.compilePredicate(plan.rule);
    const orderBySql = this.compiler.compileOrderBy(plan.orderBy);

    const applyJoins = <T>(qb: T): T => {
      let q: any = qb;
      for (const join of plan.joins) {
        if (join.relation === 'artist') {
          q = q
            .leftJoin(artistsSongs, eq(songs.id, artistsSongs.songId))
            .leftJoin(artists, eq(artistsSongs.artistId, artists.id));
        } else if (join.relation === 'album') {
          q = q
            .leftJoin(albumsSongs, eq(songs.id, albumsSongs.songId))
            .leftJoin(albums, eq(albumsSongs.albumId, albums.id));
        } else if (join.relation === 'genre') {
          q = q
            .leftJoin(genresSongs, eq(songs.id, genresSongs.songId))
            .leftJoin(genres, eq(genresSongs.genreId, genres.id));
        }
      }
      return q as T;
    };

    // 1. Total count pushed to SQLite
    let countQuery = db
      .select({
        total: sql<number>`count(distinct ${songs.id})`
      })
      .from(songs)
      .$dynamic();

    countQuery = applyJoins(countQuery);
    if (predicate) {
      countQuery = countQuery.where(predicate);
    }

    const countResult = await countQuery;
    const totalMatches = Number(countResult[0]?.total ?? 0);

    if (totalMatches === 0) {
      return {
        totalMatches: 0,
        limitedMatches: 0,
        limitedDuration: 0,
        previewSongs: []
      };
    }

    const limit = maxEntries && maxEntries > 0 ? maxEntries : null;
    const limitedMatches = limit !== null ? Math.min(totalMatches, limit) : totalMatches;

    // 2. Query preview rows (at most 100 rows fetched into memory)
    const previewFetchLimit = limit !== null ? Math.min(limit, 100) : 100;

    let previewQuery = db
      .select({
        id: songs.id,
        duration: songs.duration
      })
      .from(songs)
      .$dynamic();

    previewQuery = applyJoins(previewQuery);
    if (predicate) {
      previewQuery = previewQuery.where(predicate);
    }
    previewQuery = previewQuery.groupBy(songs.id);
    if (orderBySql.length > 0) {
      previewQuery = previewQuery.orderBy(...orderBySql);
    }
    previewQuery = previewQuery.limit(previewFetchLimit);

    const previewRows = await previewQuery;

    // 3. Compute limitedDuration
    let limitedDuration = 0;
    if (limit !== null && limit <= 100) {
      // All limited items were fetched in previewRows
      limitedDuration = previewRows.reduce((acc, row) => acc + Number(row.duration ?? 0), 0);
    } else {
      // Need duration for more than 100 items (or all unlimited matches) - execute aggregate subquery in SQLite
      let durationSubquery = db
        .select({
          duration: songs.duration
        })
        .from(songs)
        .$dynamic();

      durationSubquery = applyJoins(durationSubquery);
      if (predicate) {
        durationSubquery = durationSubquery.where(predicate);
      }
      durationSubquery = durationSubquery.groupBy(songs.id);
      if (limit !== null) {
        if (orderBySql.length > 0) {
          durationSubquery = durationSubquery.orderBy(...orderBySql);
        }
        durationSubquery = durationSubquery.limit(limit);
      }

      const sub = durationSubquery.as('sub');
      const durationResult = await db
        .select({
          totalDuration: sql<number>`coalesce(sum(${sub.duration}), 0)`
        })
        .from(sub);

      limitedDuration = Number(durationResult[0]?.totalDuration ?? 0);
    }

    // 4. Hydrate top <= 100 songs
    const previewIds = previewRows.map((r) => r.id);
    let previewSongs: SongData[] = [];
    if (previewIds.length > 0) {
      previewSongs = await getSongInfo(previewIds, undefined, undefined, previewIds.length, true);
    }

    return {
      totalMatches,
      limitedMatches,
      limitedDuration,
      previewSongs
    };
  }

  public async duplicatePlaylist(input: DuplicateInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.duplicateOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'duplicate' }
    });
    return result.data;
  }

  public async mergePlaylists(input: MergePlaylistsInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.mergeOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.targetPlaylistId, action: 'merge' }
    });
    return result.data;
  }

  public async moveCollection(input: MoveCollectionInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.moveOp, input, ctx);
    });
    for (const id of input.playlistIds) {
      collectionEventBus.emitEvent({
        type: 'CollectionMoved',
        payload: { collectionId: id, newParentId: input.targetParentId }
      });
    }
    return result.data;
  }

  public async bulkDelete(input: BulkDeleteInput) {
    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.bulkDeleteOp, input, ctx);
    });
    this.invalidateCache(result.affectedSongIds);
    collectionEventBus.emitEvent({
      type: 'CollectionDeleted',
      payload: { collectionIds: input.playlistIds }
    });
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

  public async setArtwork(input: SetArtworkInput) {
    let processedArtwork = input.processedArtwork;
    if (!processedArtwork && input.artworkPath !== undefined && input.artworkId === undefined) {
      const buffer = await generateLocalArtworkBuffer(input.artworkPath || '');
      processedArtwork = await processArtworkFiles('playlist', buffer);
    }

    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(this.setArtworkOp, { ...input, processedArtwork }, ctx);
    });

    collectionEventBus.emitEvent({
      type: 'CollectionChanged',
      payload: { collectionId: input.playlistId, action: 'setArtwork' }
    });
    return result.data;
  }

  private invalidateCache(affectedSongIds: readonly number[]) {
    if (affectedSongIds.length > 0) {
      this.membershipService.invalidateSongs(affectedSongIds);
    }
  }
}
