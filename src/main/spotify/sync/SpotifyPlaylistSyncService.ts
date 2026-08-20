import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { getAllSongs } from '../../db/queries/songs';
import { playlistEntries, playlists, spotifyPlaylistLinks } from '../../db/schema';
import logger from '../../logger';
import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { TrackIdentityMatcher } from '../../metadata/identity/TrackIdentityMatcher';
import { toCanonicalFromSong } from '../../metadata/identity/adapters/SongToCanonicalIdentity';
import { toCanonicalFromSpotifyTrack } from '../../metadata/identity/adapters/SpotifyToCanonicalIdentity';
import { MetadataNormalizer } from '../../metadata/matching/MetadataNormalizer';
import { SpotifyApiClient } from '../api/SpotifyApiClient';
import type {
  SpotifyPlaylistDetails,
  SpotifyPlaylistLinkDTO,
  SpotifyPlaylistSyncPlan,
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
  public static readonly activeSyncLocks = new Set<number>();

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
        createdAt: now,
        updatedAt: now
      });
    }

    logger.info('Linked Nora playlist with Spotify playlist', {
      playlistId,
      spotifyPlaylistId,
      strategy
    });

    const saved = await this.getLinkedPlaylist(playlistId);
    return saved!;
  }

  /**
   * Unlinks a playlist by deleting its persistent synchronization record.
   */
  public async unlinkPlaylist(playlistId: number): Promise<void> {
    await db.delete(spotifyPlaylistLinks).where(eq(spotifyPlaylistLinks.playlistId, playlistId));
    SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);
    logger.info('Unlinked Spotify playlist', { playlistId });
  }

  /**
   * Detects drift state between local Nora playlist and remote Spotify playlist against stored baseline.
   */
  public async detectDrift(playlistId: number, clientId?: string): Promise<SpotifySyncDriftStatus> {
    const link = await this.getLinkedPlaylist(playlistId);
    if (!link) {
      throw new Error(`Playlist ${playlistId} is not linked to any Spotify playlist.`);
    }

    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    // 1. Fetch current remote snapshot
    const remotePlaylist = await this.apiClient.getPlaylistDetails(
      accessToken,
      link.spotifyPlaylistId
    );
    const currentSnapshotId = remotePlaylist.snapshot_id || remotePlaylist.snapshotId || '';
    const remoteItemsCount =
      remotePlaylist.tracks?.total ??
      remotePlaylist.items?.total ??
      remotePlaylist.tracksTotal ??
      0;

    // 2. Fetch current local playlist entries and compute deterministic hash
    const localEntries = await this.loadPlaylistEntries(playlistId);
    const localEntriesHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      localEntries.map((e, idx) => ({
        position: idx + 1,
        songId: e.songId,
        isrc: e.isrc
      }))
    );

    // 3. Evaluate drift state
    return SpotifyPlaylistSyncDriftDetector.evaluateDrift({
      playlistId,
      spotifyPlaylistId: link.spotifyPlaylistId,
      link,
      currentSnapshotId,
      currentEntriesHash: localEntriesHash,
      localEntriesCount: localEntries.length,
      remoteItemsCount
    });
  }

  /**
   * Generates a 3-way synchronization preview plan without performing any mutations.
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

    const strategy = chosenStrategy ?? link.syncStrategy;
    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    // 1. Load local Nora entries and canonicalize
    const localEntries = await this.loadPlaylistEntries(playlistId);
    const songIds = localEntries.map((e) => e.songId);
    const songsData = await db.query.songs.findMany({
      where: (songs, { inArray }) => (songIds.length > 0 ? inArray(songs.id, songIds) : undefined)
    });
    const songMap = new Map(songsData.map((s) => [s.id, s]));

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

    // 4. Resolve remote tracks against Nora local library with fast indexed matching
    const remoteToLocalSongMap = new Map<number, number>();
    const allLocalSongsResult = await getAllSongs();
    const allLocalSongs = Array.isArray(allLocalSongsResult)
      ? allLocalSongsResult
      : allLocalSongsResult.data || [];
    const allLocalCanonicals = allLocalSongs.map((s) => toCanonicalFromSong(s));

    // Build in-memory candidate indexes
    const isrcIndex = new Map<string, CanonicalTrackIdentity[]>();
    const exactIdentityIndex = new Map<string, CanonicalTrackIdentity[]>();
    const titleIndex = new Map<string, CanonicalTrackIdentity[]>();

    for (const lSong of allLocalCanonicals) {
      if (lSong.isrc && lSong.isrc.trim()) {
        const isrcKey = lSong.isrc.trim().toUpperCase();
        if (!isrcIndex.has(isrcKey)) isrcIndex.set(isrcKey, []);
        isrcIndex.get(isrcKey)!.push(lSong);
      }
      const cleanTitle = MetadataNormalizer.normalizeTitle(lSong.title || '');
      const cleanArtist = lSong.artists[0] ? MetadataNormalizer.normalizeArtist(lSong.artists[0]) : '';
      if (cleanTitle) {
        if (!titleIndex.has(cleanTitle)) titleIndex.set(cleanTitle, []);
        titleIndex.get(cleanTitle)!.push(lSong);

        const exactKey = `${cleanTitle}::${cleanArtist}`;
        if (!exactIdentityIndex.has(exactKey)) exactIdentityIndex.set(exactKey, []);
        exactIdentityIndex.get(exactKey)!.push(lSong);
      }
    }

    for (let i = 0; i < remoteTracks.length; i++) {
      const position = i + 1;
      const rTrack = remoteTracks[i];
      let bestMatch: CanonicalTrackIdentity | null = null;
      let highestScore = 0;

      // 1. Try ISRC index
      if (rTrack.isrc && rTrack.isrc.trim()) {
        const isrcKey = rTrack.isrc.trim().toUpperCase();
        const isrcCandidates = isrcIndex.get(isrcKey);
        if (isrcCandidates && isrcCandidates.length > 0) {
          bestMatch = isrcCandidates[0];
          highestScore = 1.0;
        }
      }

      // 2. Try exact identity index
      if (!bestMatch) {
        const cleanTitle = MetadataNormalizer.normalizeTitle(rTrack.title || '');
        const cleanArtist = rTrack.artists[0] ? MetadataNormalizer.normalizeArtist(rTrack.artists[0]) : '';
        const exactKey = `${cleanTitle}::${cleanArtist}`;
        const exactCandidates = exactIdentityIndex.get(exactKey);
        if (exactCandidates && exactCandidates.length > 0) {
          bestMatch = exactCandidates[0];
          highestScore = 0.95;
        }
      }

      // 3. Try title candidate fuzzy matching
      if (!bestMatch) {
        const cleanTitle = MetadataNormalizer.normalizeTitle(rTrack.title || '');
        const titleCandidates = titleIndex.get(cleanTitle) || [];
        for (const candidate of titleCandidates) {
          const scoreResult = TrackIdentityMatcher.scorePair(candidate, rTrack);
          if (scoreResult.isMatch && scoreResult.score > highestScore) {
            highestScore = scoreResult.score;
            bestMatch = candidate;
          }
        }
      }

      if (bestMatch && typeof bestMatch.id === 'number') {
        remoteToLocalSongMap.set(position, bestMatch.id);
      }
    }

    const currentRemoteDetails = await this.apiClient.getPlaylistDetails(
      accessToken,
      link.spotifyPlaylistId
    );
    const currentSnapshotId = currentRemoteDetails.snapshot_id || currentRemoteDetails.snapshotId || '';

    const currentLocalEntries = await this.loadPlaylistEntries(playlistId);
    const currentEntriesHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
      currentLocalEntries.map((e, idx) => ({
        position: idx + 1,
        songId: e.songId,
        isrc: e.isrc
      }))
    );

    return SpotifyPlaylistSyncPlanner.planSync({
      playlistId,
      spotifyPlaylistId: link.spotifyPlaylistId,
      strategy,
      localTracks,
      remoteTracks,
      localToSpotifyUriMap,
      remoteToLocalSongMap,
      baseSnapshotId: currentSnapshotId,
      baseEntriesHash: currentEntriesHash
    });
  }

  /**
   * Executes coordinated 2-way target-state synchronization with pre/post-write verification.
   */
  public async executeSync(
    playlistId: number,
    chosenStrategy?: SyncStrategy,
    clientId?: string
  ): Promise<SpotifySyncResult> {
    if (SpotifyPlaylistSyncService.activeSyncLocks.has(playlistId)) {
      throw new Error('Playlist synchronization is already in progress.');
    }
    SpotifyPlaylistSyncService.activeSyncLocks.add(playlistId);

    try {
      const link = await this.getLinkedPlaylist(playlistId);
      if (!link) {
        throw new Error(`Playlist ${playlistId} is not linked to any Spotify playlist.`);
      }

      const strategy = chosenStrategy ?? link.syncStrategy;
      const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
      const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
      if (!accessToken) {
        throw new Error('Spotify account not connected or failed to retrieve valid access token.');
      }

      // Mark link as SYNCING
      await db
        .update(spotifyPlaylistLinks)
        .set({
          syncState: 'SYNCING',
          updatedAt: new Date()
        })
        .where(eq(spotifyPlaylistLinks.id, link.id));

      // 1. Generate plan with baseline capture
      const plan = await this.generateSyncPlan(playlistId, strategy, activeClientId);

      // Pre-mutation concurrency check: verify local playlist has not changed
      const preFlightLocalEntries = await this.loadPlaylistEntries(playlistId);
      const preFlightLocalHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
        preFlightLocalEntries.map((e, idx) => ({
          position: idx + 1,
          songId: e.songId,
          isrc: e.isrc
        }))
      );
      if (plan.base.localEntriesHash && preFlightLocalHash !== plan.base.localEntriesHash) {
        await db
          .update(spotifyPlaylistLinks)
          .set({
            syncState: 'CONFLICT',
            lastError: 'Local playlist was modified during sync preparation. Please generate a fresh plan.',
            updatedAt: new Date()
          })
          .where(eq(spotifyPlaylistLinks.id, link.id));

        return {
          status: 'ERROR',
          playlistId,
          spotifyPlaylistId: link.spotifyPlaylistId,
          strategy,
          syncState: 'CONFLICT',
          completedRemoteBatches: 0,
          totalRemoteBatches: 0,
          error: 'Local playlist was modified during sync preparation. Please generate a fresh plan.'
        };
      }

      // Pre-mutation concurrency check: verify remote snapshot has not changed
      const preFlightRemoteDetails = await this.apiClient.getPlaylistDetails(
        accessToken,
        link.spotifyPlaylistId
      );
      const preFlightSnapshotId = preFlightRemoteDetails.snapshot_id || preFlightRemoteDetails.snapshotId || '';
      if (plan.base.remoteSnapshotId && preFlightSnapshotId !== plan.base.remoteSnapshotId) {
        await db
          .update(spotifyPlaylistLinks)
          .set({
            syncState: 'CONFLICT',
            lastError: 'Remote Spotify playlist was modified during sync preparation. Please generate a fresh plan.',
            updatedAt: new Date()
          })
          .where(eq(spotifyPlaylistLinks.id, link.id));

        return {
          status: 'ERROR',
          playlistId,
          spotifyPlaylistId: link.spotifyPlaylistId,
          strategy,
          syncState: 'CONFLICT',
          completedRemoteBatches: 0,
          totalRemoteBatches: 0,
          error: 'Remote Spotify playlist was modified during sync preparation. Please generate a fresh plan.'
        };
      }

      let currentSnapshotId = preFlightSnapshotId;
      let completedRemoteBatches = 0;
      const targetUris = plan.remoteTarget.map((o) => o.spotifyUri).filter((uri): uri is string => Boolean(uri));
      const totalRemoteBatches = targetUris.length === 0 ? 1 : Math.ceil(targetUris.length / 100);

      // ==========================================
      // Phase 1: Staged Remote Target Replacement
      // ==========================================
      try {
        if (targetUris.length <= 100) {
          const res = await this.apiClient.replacePlaylistItems(
            accessToken,
            link.spotifyPlaylistId,
            targetUris
          );
          if (res.snapshot_id) {
            currentSnapshotId = res.snapshot_id;
          }
          completedRemoteBatches = 1;
        } else {
          // Staged replacement: Initial PUT first 100 items
          const firstChunk = targetUris.slice(0, 100);
          const putRes = await this.apiClient.replacePlaylistItems(
            accessToken,
            link.spotifyPlaylistId,
            firstChunk
          );
          if (putRes.snapshot_id) {
            currentSnapshotId = putRes.snapshot_id;
          }
          completedRemoteBatches = 1;

          // Sequential POST for remainder
          for (let i = 100; i < targetUris.length; i += 100) {
            const chunk = targetUris.slice(i, i + 100);
            const postRes = await this.apiClient.addPlaylistItems(
              accessToken,
              link.spotifyPlaylistId,
              chunk
            );
            if (postRes.snapshot_id) {
              currentSnapshotId = postRes.snapshot_id;
            }
            completedRemoteBatches++;
          }
        }

        // Post-write remote verification
        const verifiedRemoteItems = await this.apiClient.getAllPlaylistItems(
          accessToken,
          link.spotifyPlaylistId
        );
        const verifiedRemoteUris = verifiedRemoteItems
          .map((item) => item.item?.track?.uri || item.item?.uri)
          .filter((u): u is string => Boolean(u));

        let isRemoteMatching = verifiedRemoteUris.length === targetUris.length;
        if (isRemoteMatching) {
          for (let i = 0; i < targetUris.length; i++) {
            if (verifiedRemoteUris[i] !== targetUris[i]) {
              isRemoteMatching = false;
              break;
            }
          }
        }

        if (!isRemoteMatching) {
          throw new Error(
            `Remote Spotify verification failed: expected ${targetUris.length} items, observed ${verifiedRemoteUris.length}.`
          );
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
            failedBatchIndex: completedRemoteBatches,
            lastError: (err as Error).message,
            updatedAt: new Date()
          })
          .where(eq(spotifyPlaylistLinks.id, link.id));

        return {
          status: 'PARTIAL_FAILURE',
          playlistId,
          spotifyPlaylistId: link.spotifyPlaylistId,
          strategy,
          syncState: 'PARTIAL_FAILURE',
          failureStage: 'REMOTE',
          completedRemoteBatches,
          totalRemoteBatches,
          failedBatchIndex: completedRemoteBatches,
          error: (err as Error).message
        };
      }

      // ==========================================
      // Phase 2: Atomic Local DB Target Replacement
      // ==========================================
      try {
        await db.transaction(async (trx) => {
          await trx.delete(playlistEntries).where(eq(playlistEntries.playlistId, playlistId));

          for (let i = 0; i < plan.localTarget.length; i++) {
            const targetOcc = plan.localTarget[i];
            if (targetOcc.localSongId !== undefined) {
              await trx.insert(playlistEntries).values({
                playlistId,
                songId: targetOcc.localSongId,
                position: i,
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
            failedBatchIndex: completedRemoteBatches,
            lastError: (err as Error).message,
            updatedAt: new Date()
          })
          .where(eq(spotifyPlaylistLinks.id, link.id));

        return {
          status: 'PARTIAL_FAILURE',
          playlistId,
          spotifyPlaylistId: link.spotifyPlaylistId,
          strategy,
          syncState: 'PARTIAL_FAILURE',
          failureStage: 'LOCAL',
          completedRemoteBatches,
          totalRemoteBatches,
          error: (err as Error).message
        };
      }

      // ==========================================
      // Phase 3: Finalize Link Baseline & Invariants
      // ==========================================
      const finalEntries = await this.loadPlaylistEntries(playlistId);
      const finalEntriesHash = SpotifyPlaylistSyncDriftDetector.computeEntriesHash(
        finalEntries.map((e, idx) => ({
          position: idx + 1,
          songId: e.songId,
          isrc: e.isrc
        }))
      );

      const hasUnresolved = plan.unresolvedRemoteOccurrences.length > 0;
      const finalSyncState = hasUnresolved ? 'PARTIAL_FAILURE' : 'SYNCED';
      const finalErrorMessage = hasUnresolved
        ? `Sync incomplete: ${plan.unresolvedRemoteOccurrences.length} remote track(s) could not be resolved to local audio files.`
        : null;

      const now = new Date();
      await db
        .update(spotifyPlaylistLinks)
        .set({
          lastSyncedSnapshotId: currentSnapshotId,
          lastSyncedEntriesHash: finalEntriesHash,
          syncState: finalSyncState,
          failureStage: hasUnresolved ? 'FINALIZATION' : null,
          completedRemoteBatches: 0,
          failedBatchIndex: null,
          lastError: finalErrorMessage,
          lastSyncedAt: now,
          updatedAt: now
        })
        .where(eq(spotifyPlaylistLinks.id, link.id));

      return {
        status: hasUnresolved ? 'PARTIAL_FAILURE' : 'SUCCESS',
        playlistId,
        spotifyPlaylistId: link.spotifyPlaylistId,
        finalSnapshotId: currentSnapshotId,
        finalEntriesHash,
        strategy,
        syncState: finalSyncState,
        completedRemoteBatches,
        totalRemoteBatches,
        unresolvedRemoteCount: plan.unresolvedRemoteOccurrences.length,
        error: finalErrorMessage || undefined
      };
    } finally {
      SpotifyPlaylistSyncService.activeSyncLocks.delete(playlistId);
    }
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
