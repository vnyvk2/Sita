import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { getAllSongs } from '../../db/queries/songs';
import { playlistEntries, playlists, spotifyPlaylistLinks } from '../../db/schema';
import logger from '../../logger';
import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { TrackIdentityMatcher } from '../../metadata/identity/TrackIdentityMatcher';
import { toCanonicalFromSong } from '../../metadata/identity/adapters/SongToCanonicalIdentity';
import { toCanonicalFromSpotifyTrack } from '../../metadata/identity/adapters/SpotifyToCanonicalIdentity';
import { SpotifyApiClient } from '../api/SpotifyApiClient';
import type {
  SpotifyPlaylistDetails,
  SpotifyPlaylistLinkDTO,
  SpotifyPlaylistSyncPlan,
  SpotifyRemovePlaylistItem,
  SpotifySyncDriftStatus,
  SpotifySyncResult,
  SyncStrategy
} from '../api/types';
import { SpotifyTokenStore } from '../auth/SpotifyTokenStore';
import { SpotifyTrackCatalogSearcher } from '../export/SpotifyTrackCatalogSearcher';
import { SpotifyPlaylistSyncDriftDetector } from './SpotifyPlaylistSyncDriftDetector';
import { SpotifyPlaylistSyncPlanner } from './SpotifyPlaylistSyncPlanner';

export class SpotifyPlaylistSyncService {
  private readonly apiClient: SpotifyApiClient;
  private readonly catalogSearcher: SpotifyTrackCatalogSearcher;
  private static readonly activeSyncLocks = new Set<number>();

  constructor(apiClient?: SpotifyApiClient) {
    this.apiClient = apiClient ?? new SpotifyApiClient();
    this.catalogSearcher = new SpotifyTrackCatalogSearcher(this.apiClient);
  }

  /**
   * Retrieves persistent Spotify link record for a given Nora playlist ID.
   */
  public async getLinkedPlaylist(playlistId: number): Promise<SpotifyPlaylistLinkDTO | null> {
    const link = await db.query.spotifyPlaylistLinks.findFirst({
      where: eq(spotifyPlaylistLinks.playlistId, playlistId)
    });

    if (!link) return null;

    return {
      id: link.id,
      playlistId: link.playlistId,
      spotifyPlaylistId: link.spotifyPlaylistId,
      spotifyPlaylistName: link.spotifyPlaylistName,
      spotifyUserId: link.spotifyUserId,
      lastSyncedSnapshotId: link.lastSyncedSnapshotId,
      lastSyncedEntriesHash: link.lastSyncedEntriesHash,
      syncStrategy: link.syncStrategy as SyncStrategy,
      syncState: link.syncState as any,
      failureStage: link.failureStage as any,
      completedRemoteBatches: link.completedRemoteBatches,
      failedBatchIndex: link.failedBatchIndex,
      lastError: link.lastError,
      lastSyncedAt: link.lastSyncedAt ? link.lastSyncedAt.toISOString() : null
    };
  }

  /**
   * Links a local Nora playlist to a remote Spotify playlist.
   * Verifies account ownership/collaboration, write permissions, and establishes initial baseline.
   */
  public async linkPlaylist(
    playlistId: number,
    spotifyPlaylistId: string,
    strategy: SyncStrategy = 'UNION_MERGE',
    clientId?: string
  ): Promise<SpotifyPlaylistLinkDTO> {
    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    const currentUser = await this.apiClient.getCurrentUser(accessToken);

    // 1. Verify remote playlist exists and user has edit rights
    let remotePlaylist: SpotifyPlaylistDetails;
    try {
      remotePlaylist = await this.apiClient.getPlaylistDetails(accessToken, spotifyPlaylistId);
    } catch (err) {
      throw new Error(
        `Failed to access Spotify playlist "${spotifyPlaylistId}": ${(err as Error).message}`
      );
    }

    const isOwner = remotePlaylist.owner?.id === currentUser.id;
    const isCollaborator = Boolean(remotePlaylist.collaborative);
    if (!isOwner && !isCollaborator) {
      throw new Error(
        'Cannot link playlist: Spotify account is neither the owner nor a collaborative editor.'
      );
    }

    // 2. Verify write scopes for visibility
    const isPublic = Boolean(remotePlaylist.public);
    const requiredScope = isPublic ? 'playlist-modify-public' : 'playlist-modify-private';
    const hasScope = await SpotifyTokenStore.hasRequiredScopes([requiredScope]);
    if (!hasScope) {
      throw new Error(
        `Spotify token lacks required permission "${requiredScope}" to synchronize this playlist.`
      );
    }

    // 3. Capture initial local entries hash
    const localEntries = await this.loadPlaylistEntries(playlistId);
    const initialHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      localEntries.map((e, idx) => ({
        position: idx + 1,
        songId: e.songId,
        isrc: e.isrc
      }))
    );

    const initialSnapshotId = remotePlaylist.snapshot_id || remotePlaylist.snapshotId || '';

    // 4. Save link record
    const existing = await db.query.spotifyPlaylistLinks.findFirst({
      where: eq(spotifyPlaylistLinks.playlistId, playlistId)
    });

    const now = new Date();
    if (existing) {
      await db
        .update(spotifyPlaylistLinks)
        .set({
          spotifyUserId: currentUser.id,
          spotifyPlaylistId,
          spotifyPlaylistName: remotePlaylist.name,
          lastSyncedSnapshotId: initialSnapshotId,
          lastSyncedEntriesHash: initialHash,
          syncStrategy: strategy,
          syncState: 'SYNCED',
          failureStage: null,
          completedRemoteBatches: 0,
          failedBatchIndex: null,
          lastError: null,
          lastSyncedAt: now,
          updatedAt: now
        })
        .where(eq(spotifyPlaylistLinks.id, existing.id));
    } else {
      await db.insert(spotifyPlaylistLinks).values({
        playlistId,
        spotifyUserId: currentUser.id,
        spotifyPlaylistId,
        spotifyPlaylistName: remotePlaylist.name,
        lastSyncedSnapshotId: initialSnapshotId,
        lastSyncedEntriesHash: initialHash,
        syncStrategy: strategy,
        syncState: 'SYNCED',
        lastSyncedAt: now
      });
    }

    return (await this.getLinkedPlaylist(playlistId))!;
  }

  /**
   * Unlinks a Nora playlist from Spotify.
   */
  public async unlinkPlaylist(playlistId: number): Promise<boolean> {
    await db.delete(spotifyPlaylistLinks).where(eq(spotifyPlaylistLinks.playlistId, playlistId));
    return true;
  }

  /**
   * Evaluates drift between local Nora playlist and remote Spotify playlist.
   */
  public async detectSyncDrift(
    playlistId: number,
    clientId?: string
  ): Promise<SpotifySyncDriftStatus> {
    const link = await this.getLinkedPlaylist(playlistId);
    if (!link) {
      throw new Error(`Playlist ${playlistId} is not linked to any Spotify playlist.`);
    }

    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    const remoteDetails = await this.apiClient.getPlaylistDetails(
      accessToken,
      link.spotifyPlaylistId
    );
    const currentSnapshotId = remoteDetails.snapshot_id || remoteDetails.snapshotId || '';
    const remoteItemsCount = remoteDetails.tracks?.total ?? remoteDetails.items?.total ?? 0;

    const localEntries = await this.loadPlaylistEntries(playlistId);
    const currentEntriesHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      localEntries.map((e, idx) => ({
        position: idx + 1,
        songId: e.songId,
        isrc: e.isrc
      }))
    );

    return SpotifyPlaylistSyncDriftDetector.evaluateDrift({
      playlistId,
      spotifyPlaylistId: link.spotifyPlaylistId,
      link,
      currentSnapshotId,
      currentEntriesHash,
      localEntriesCount: localEntries.length,
      remoteItemsCount
    });
  }

  /**
   * Generates a 3-way reconciliation plan without mutating any remote or local state.
   */
  public async generateSyncPlan(
    playlistId: number,
    chosenStrategy?: SyncStrategy,
    clientId?: string
  ): Promise<SpotifyPlaylistSyncPlan> {
    const link = await this.getLinkedPlaylist(playlistId);
    if (!link) {
      throw new Error(`Playlist ${playlistId} is not linked to any Spotify playlist.`);
    }

    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    const strategy = chosenStrategy || link.syncStrategy;

    // 1. Load local Nora tracks & identities
    const localEntries = await this.loadPlaylistEntries(playlistId);
    const songIds = localEntries.map((e) => e.songId);
    const songsResult = await getAllSongs({ songIds, preserveIdOrder: true });
    const songsData = Array.isArray(songsResult) ? songsResult : songsResult.data || [];
    const songMap = new Map<number, (typeof songsData)[0]>();
    for (const s of songsData) {
      songMap.set(s.id, s);
    }

    const localTracks: CanonicalTrackIdentity[] = [];
    for (const e of localEntries) {
      const record = songMap.get(e.songId);
      if (record) {
        localTracks.push(toCanonicalFromSong(record));
      } else {
        localTracks.push({
          id: e.songId,
          title: 'Unknown Song',
          artists: []
        });
      }
    }

    // 2. Load remote Spotify items
    const remoteItems = await this.apiClient.getAllPlaylistItems(
      accessToken,
      link.spotifyPlaylistId
    );
    const remoteTracks: CanonicalTrackIdentity[] = [];
    for (const item of remoteItems) {
      if (item.item?.track) {
        remoteTracks.push(toCanonicalFromSpotifyTrack(item.item.track));
      }
    }

    // 3. Resolve local tracks against Spotify catalog for URIs
    const localToSpotifyUriMap = new Map<number, string>();
    for (let i = 0; i < localTracks.length; i++) {
      const position = i + 1;
      const res = await this.catalogSearcher.resolveTrack(accessToken, localTracks[i]);
      if (res.status === 'MATCHED' && res.spotifyUri) {
        localToSpotifyUriMap.set(position, res.spotifyUri);
      }
    }

    // 4. Resolve remote tracks against Nora local library
    const remoteToLocalSongMap = new Map<number, number>();
    const allLocalSongsResult = await getAllSongs();
    const allLocalSongs = Array.isArray(allLocalSongsResult)
      ? allLocalSongsResult
      : allLocalSongsResult.data || [];
    const allLocalCanonicals = allLocalSongs.map((s) => toCanonicalFromSong(s));

    for (let i = 0; i < remoteTracks.length; i++) {
      const position = i + 1;
      const rTrack = remoteTracks[i];
      let bestMatch: CanonicalTrackIdentity | null = null;
      let highestScore = 0;

      for (const lSong of allLocalCanonicals) {
        const scoreResult = TrackIdentityMatcher.scorePair(lSong, rTrack);
        if (scoreResult.isMatch && scoreResult.score > highestScore) {
          highestScore = scoreResult.score;
          bestMatch = lSong;
        }
      }

      if (bestMatch && typeof bestMatch.id === 'number') {
        remoteToLocalSongMap.set(position, bestMatch.id);
      }
    }

    return SpotifyPlaylistSyncPlanner.planSync({
      playlistId,
      spotifyPlaylistId: link.spotifyPlaylistId,
      strategy,
      localTracks,
      remoteTracks,
      localToSpotifyUriMap,
      remoteToLocalSongMap,
      baseSnapshotId: link.lastSyncedSnapshotId || undefined,
      baseEntriesHash: link.lastSyncedEntriesHash || undefined
    });
  }

  /**
   * Executes coordinated 2-way synchronization with distributed state machine guards.
   */
  public async executeSync(
    playlistId: number,
    chosenStrategy?: SyncStrategy,
    clientId?: string
  ): Promise<SpotifySyncResult> {
    if (SpotifyPlaylistSyncService.activeSyncLocks.has(playlistId)) {
      throw new Error(`Synchronization is already in progress for playlist ${playlistId}.`);
    }

    SpotifyPlaylistSyncService.activeSyncLocks.add(playlistId);

    const link = await this.getLinkedPlaylist(playlistId);
    if (!link) {
      SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);
      throw new Error(`Playlist ${playlistId} is not linked to any Spotify playlist.`);
    }

    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    const strategy = chosenStrategy || link.syncStrategy;

    // Mark link state as SYNCING
    await db
      .update(spotifyPlaylistLinks)
      .set({
        syncState: 'SYNCING',
        lastError: null,
        failureStage: null,
        updatedAt: new Date()
      })
      .where(eq(spotifyPlaylistLinks.id, link.id));

    let plan: SpotifyPlaylistSyncPlan;
    try {
      plan = await this.generateSyncPlan(playlistId, strategy, activeClientId);
    } catch (err) {
      await db
        .update(spotifyPlaylistLinks)
        .set({
          syncState: 'ERROR',
          lastError: (err as Error).message,
          updatedAt: new Date()
        })
        .where(eq(spotifyPlaylistLinks.id, link.id));

      SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);
      throw err;
    }

    let currentSnapshotId = link.lastSyncedSnapshotId || '';
    let completedRemoteBatches = 0;
    const remoteBatchSize = 100;

    // ==========================================
    // Phase 1: Remote Spotify Execution
    // ==========================================
    try {
      // 1. Execute remote REMOVE operations with snapshot guard
      if (plan.remoteOperations.some((o) => o.action === 'REMOVE')) {
        const removeItems: SpotifyRemovePlaylistItem[] = plan.remoteOperations
          .filter((o) => o.action === 'REMOVE')
          .map((o) => ({
            uri: o.spotifyUri,
            positions: o.position !== undefined ? [o.position] : undefined
          }));

        for (let i = 0; i < removeItems.length; i += remoteBatchSize) {
          const batch = removeItems.slice(i, i + remoteBatchSize);
          const res = await this.apiClient.removePlaylistItems(
            accessToken,
            link.spotifyPlaylistId,
            batch,
            currentSnapshotId || undefined
          );
          if (res.snapshot_id) {
            currentSnapshotId = res.snapshot_id;
          }
          completedRemoteBatches++;
        }
      }

      // 2. Execute remote ADD operations in chunks of <= 100
      if (plan.remoteOperations.some((o) => o.action === 'ADD')) {
        const addUris: string[] = plan.remoteOperations
          .filter((o) => o.action === 'ADD')
          .map((o) => o.spotifyUri);

        for (let i = 0; i < addUris.length; i += remoteBatchSize) {
          const batch = addUris.slice(i, i + remoteBatchSize);
          const res = await this.apiClient.addPlaylistItems(
            accessToken,
            link.spotifyPlaylistId,
            batch
          );
          if (res.snapshot_id) {
            currentSnapshotId = res.snapshot_id;
          }
          completedRemoteBatches++;
        }
      }
    } catch (err) {
      logger.error('Remote Spotify mutation failed during sync', {
        playlistId,
        error: (err as Error).message
      });

      await db
        .update(spotifyPlaylistLinks)
        .set({
          syncState: 'PARTIAL_FAILURE',
          failureStage: 'REMOTE',
          completedRemoteBatches,
          lastError: (err as Error).message,
          updatedAt: new Date()
        })
        .where(eq(spotifyPlaylistLinks.id, link.id));

      SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);

      return {
        status: 'PARTIAL_FAILURE',
        playlistId,
        spotifyPlaylistId: link.spotifyPlaylistId,
        strategy,
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'REMOTE',
        completedRemoteBatches,
        totalRemoteBatches: Math.ceil(plan.remoteOperations.length / remoteBatchSize),
        error: (err as Error).message
      };
    }

    // ==========================================
    // Phase 2: Local DB Execution in Transaction
    // ==========================================
    try {
      await db.transaction(async (trx) => {
        // 1. Remove local entries
        for (const op of plan.localOperations) {
          if (op.action === 'REMOVE') {
            await trx
              .delete(playlistEntries)
              .where(
                eq(playlistEntries.playlistId, playlistId)
              );
          }
        }

        // 2. Insert new local entries
        const existingEntries = await trx.query.playlistEntries.findMany({
          where: eq(playlistEntries.playlistId, playlistId),
          orderBy: asc(playlistEntries.position)
        });

        let nextPosition = existingEntries.length;
        for (const op of plan.localOperations) {
          if (op.action === 'ADD') {
            await trx.insert(playlistEntries).values({
              playlistId,
              songId: op.songId,
              position: nextPosition++,
              source: 'spotify_sync'
            });
          }
        }
      });
    } catch (err) {
      logger.error('Local DB transaction failed during sync', {
        playlistId,
        error: (err as Error).message
      });

      await db
        .update(spotifyPlaylistLinks)
        .set({
          syncState: 'PARTIAL_FAILURE',
          failureStage: 'LOCAL',
          completedRemoteBatches,
          lastError: (err as Error).message,
          updatedAt: new Date()
        })
        .where(eq(spotifyPlaylistLinks.id, link.id));

      SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);

      return {
        status: 'PARTIAL_FAILURE',
        playlistId,
        spotifyPlaylistId: link.spotifyPlaylistId,
        strategy,
        syncState: 'PARTIAL_FAILURE',
        failureStage: 'LOCAL',
        completedRemoteBatches,
        totalRemoteBatches: Math.ceil(plan.remoteOperations.length / remoteBatchSize),
        error: (err as Error).message
      };
    }

    // ==========================================
    // Phase 3: Finalize Link Baseline
    // ==========================================
    const finalEntries = await this.loadPlaylistEntries(playlistId);
    const finalEntriesHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      finalEntries.map((e, idx) => ({
        position: idx + 1,
        songId: e.songId,
        isrc: e.isrc
      }))
    );

    const now = new Date();
    await db
      .update(spotifyPlaylistLinks)
      .set({
        lastSyncedSnapshotId: currentSnapshotId,
        lastSyncedEntriesHash: finalEntriesHash,
        syncState: 'SYNCED',
        failureStage: null,
        completedRemoteBatches: 0,
        failedBatchIndex: null,
        lastError: null,
        lastSyncedAt: now,
        updatedAt: now
      })
      .where(eq(spotifyPlaylistLinks.id, link.id));

    SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);

    return {
      status: 'SUCCESS',
      playlistId,
      spotifyPlaylistId: link.spotifyPlaylistId,
      finalSnapshotId: currentSnapshotId,
      finalEntriesHash,
      strategy,
      syncState: 'SYNCED',
      completedRemoteBatches,
      totalRemoteBatches: Math.ceil(plan.remoteOperations.length / remoteBatchSize)
    };
  }

  private async loadPlaylistEntries(playlistId: number) {
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
      with: {
        entries: {
          orderBy: asc(playlistEntries.position),
          with: {
            song: {
              columns: {
                id: true,
                isrc: true
              }
            }
          }
        }
      }
    });

    if (!playlist) return [];

    return playlist.entries.map((e) => ({
      songId: e.songId,
      position: e.position,
      isrc: (e as any).song?.isrc
    }));
  }
}
