import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { getAllSongs } from '../../db/queries/songs';
import { playlistEntries, playlists } from '../../db/schema';
import logger from '../../logger';
import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { toCanonicalFromSong } from '../../metadata/identity/adapters/SongToCanonicalIdentity';
import { SpotifyApiClient } from '../api/SpotifyApiClient';
import type {
  CatalogResolution,
  SpotifyExportResult,
  SpotifyPlaylistExportPlan
} from '../api/types';
import { SpotifyTokenStore } from '../auth/SpotifyTokenStore';
import type { ValidatedExportRequest } from '../ipc/SpotifyExportValidator';
import { SpotifyPlaylistExportPlanner } from './SpotifyPlaylistExportPlanner';
import { SpotifyTrackCatalogSearcher } from './SpotifyTrackCatalogSearcher';

export interface SpotifyExportResolutionCache {
  playlistId: number;
  revision: string;
  resolutions: Map<string, CatalogResolution>;
}

export class SpotifyPlaylistExportService {
  private readonly apiClient: SpotifyApiClient;
  private readonly catalogSearcher: SpotifyTrackCatalogSearcher;

  constructor(apiClient?: SpotifyApiClient) {
    this.apiClient = apiClient ?? new SpotifyApiClient();
    this.catalogSearcher = new SpotifyTrackCatalogSearcher(this.apiClient);
  }

  /**
   * Generates a cache key for memoizing catalog search results across duplicate playlist entries.
   */
  private getTrackResolutionKey(track: CanonicalTrackIdentity, songId: number): string {
    if (track.isrc && track.isrc.trim()) {
      return `isrc:${track.isrc.trim().toUpperCase()}`;
    }
    return `song:${songId}:${track.title}::${track.artists.join(',')}`;
  }

  /**
   * Runs an array of async task functions with bounded concurrency (e.g. max 5 in flight).
   */
  private async runWithConcurrencyLimit<T>(
    tasks: Array<() => Promise<T>>,
    limit = 5
  ): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let currentIndex = 0;

    const worker = async (): Promise<void> => {
      while (currentIndex < tasks.length) {
        const index = currentIndex++;
        results[index] = await tasks[index]();
      }
    };

    const workerCount = Math.min(limit, tasks.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Generates a preview export plan by loading the local Nora playlist, resolving its tracks
   * against the Spotify catalog with bounded concurrency and revision-aware memoization.
   * Strictly preserves 1..N positions even if individual local song records are missing.
   */
  public async generateExportPlan(
    playlistId: number,
    clientId?: string,
    sessionCache?: SpotifyExportResolutionCache
  ): Promise<SpotifyPlaylistExportPlan> {
    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
      with: {
        entries: {
          orderBy: asc(playlistEntries.position)
        }
      }
    });

    if (!playlist) {
      throw new Error(`Playlist with ID ${playlistId} not found.`);
    }

    const currentRevision = playlist.updatedAt.toISOString();
    const songIds = playlist.entries.map((e) => e.songId);
    if (songIds.length === 0) {
      return SpotifyPlaylistExportPlanner.generatePlan({
        playlistId,
        playlistName: playlist.name,
        description: playlist.description || undefined,
        revision: currentRevision,
        tracks: [],
        resolutions: new Map()
      });
    }

    // Load full song records with artists and album relations
    const songsResult = await getAllSongs({ songIds, preserveIdOrder: true });
    const songsData = Array.isArray(songsResult) ? songsResult : songsResult.data || [];
    const songMap = new Map<number, (typeof songsData)[0]>();
    for (const s of songsData) {
      songMap.set(s.id, s);
    }

    const canonicalTracks: CanonicalTrackIdentity[] = [];

    // Invariant: Verify sessionCache belongs to this exact playlist and revision before reusing
    const isCacheValid =
      sessionCache &&
      sessionCache.playlistId === playlistId &&
      sessionCache.revision === currentRevision;

    const resolutionMap = isCacheValid
      ? sessionCache.resolutions
      : new Map<string, CatalogResolution>();

    if (sessionCache && !isCacheValid) {
      sessionCache.playlistId = playlistId;
      sessionCache.revision = currentRevision;
      sessionCache.resolutions = resolutionMap;
    }

    // Prepare entry targets
    const entryItems: Array<{
      entry: (typeof playlist.entries)[0];
      position: number;
      canonicalTrack: CanonicalTrackIdentity;
      isMissing: boolean;
      cacheKey?: string;
    }> = [];

    for (let i = 0; i < playlist.entries.length; i++) {
      const entry = playlist.entries[i];
      const position = i + 1;
      const record = songMap.get(entry.songId);

      if (!record) {
        const missingCanonical: CanonicalTrackIdentity = {
          id: entry.songId,
          title: 'Unknown Song',
          artists: []
        };
        canonicalTracks.push(missingCanonical);
        entryItems.push({
          entry,
          position,
          canonicalTrack: missingCanonical,
          isMissing: true
        });
      } else {
        const canonicalTrack = toCanonicalFromSong(record);
        canonicalTracks.push(canonicalTrack);
        const cacheKey = this.getTrackResolutionKey(canonicalTrack, entry.songId);
        entryItems.push({
          entry,
          position,
          canonicalTrack,
          isMissing: false,
          cacheKey
        });
      }
    }

    // Identify distinct tracks needing network resolution
    const keysToResolve = new Map<string, { canonicalTrack: CanonicalTrackIdentity; entryId: number }>();
    for (const item of entryItems) {
      if (!item.isMissing && item.cacheKey && !resolutionMap.has(item.cacheKey)) {
        if (!keysToResolve.has(item.cacheKey)) {
          keysToResolve.set(item.cacheKey, {
            canonicalTrack: item.canonicalTrack,
            entryId: item.entry.id
          });
        }
      }
    }

    // Resolve distinct tracks with bounded concurrency (5 concurrent requests)
    const distinctEntries = Array.from(keysToResolve.entries());
    const tasks = distinctEntries.map(([key, info]) => async () => {
      const res = await this.catalogSearcher.resolveTrack(
        accessToken,
        info.canonicalTrack,
        info.entryId
      );
      resolutionMap.set(key, res);
    });

    if (tasks.length > 0) {
      await this.runWithConcurrencyLimit(tasks, 5);
    }

    // Build final positional resolutions map
    const resolutions = new Map<number, CatalogResolution>();
    for (const item of entryItems) {
      if (item.isMissing) {
        resolutions.set(item.position, {
          entryId: item.entry.id,
          songId: item.entry.songId,
          status: 'NOT_IN_CATALOG',
          diagnostics: ['LOCAL_SONG_NOT_FOUND']
        });
      } else if (item.cacheKey && resolutionMap.has(item.cacheKey)) {
        const cached = resolutionMap.get(item.cacheKey)!;
        resolutions.set(item.position, {
          ...cached,
          entryId: item.entry.id,
          songId: item.entry.songId
        });
      }
    }

    return SpotifyPlaylistExportPlanner.generatePlan({
      playlistId,
      playlistName: playlist.name,
      description: playlist.description || undefined,
      revision: currentRevision,
      tracks: canonicalTracks,
      resolutions
    });
  }

  /**
   * Executes remote Spotify playlist creation and batched sequential item additions.
   * Performs server-side re-resolution to prevent renderer tampering, guards against
   * revision races, and captures snapshots sequentially.
   */
  public async executeExport(
    validated: ValidatedExportRequest,
    clientId?: string
  ): Promise<SpotifyExportResult> {
    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    // Regenerate fresh authoritative plan server-side
    const freshPlan = await this.generateExportPlan(validated.playlistId, activeClientId);

    // Invariant: Verify playlist was not mutated during preparation
    if (freshPlan.revision !== validated.revision) {
      throw new Error(
        'Playlist changed while export was being prepared. Please refresh the preview.'
      );
    }

    if (freshPlan.statistics.exportableEntries === 0) {
      throw new Error('Cannot export playlist: no matching tracks found in Spotify catalog.');
    }

    // 1. Create remote Spotify playlist via POST /v1/me/playlists
    logger.info('Creating remote Spotify playlist...', {
      name: validated.playlistName,
      isPublic: validated.isPublic
    });

    const remotePlaylist = await this.apiClient.createPlaylist(accessToken, {
      name: validated.playlistName,
      description: validated.description,
      isPublic: validated.isPublic
    });

    const playlistId = remotePlaylist.id;
    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
    let currentSnapshotId = remotePlaylist.snapshot_id || remotePlaylist.snapshotId || '';

    // 2. Collect matched URIs preserving 1..N order and duplicate tracks
    const exportUris: string[] = [];
    for (const entry of freshPlan.entries) {
      if (entry.decision === 'EXPORT' && entry.resolution.spotifyUri) {
        exportUris.push(entry.resolution.spotifyUri);
      }
    }

    // 3. Slice URIs into chunks of <= 100 for batch addition
    const BATCH_SIZE = 100;
    const batches: string[][] = [];
    for (let i = 0; i < exportUris.length; i += BATCH_SIZE) {
      batches.push(exportUris.slice(i, i + BATCH_SIZE));
    }

    const totalBatches = batches.length;
    let completedBatches = 0;

    // 4. Sequentially add batches, capturing snapshot IDs
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batchUris = batches[batchIndex];
      try {
        const addResponse = await this.apiClient.addPlaylistItems(
          accessToken,
          playlistId,
          batchUris
        );
        if (addResponse.snapshot_id) {
          currentSnapshotId = addResponse.snapshot_id;
        }
        completedBatches++;
      } catch (err) {
        logger.error('Failed to add batch of tracks to Spotify playlist', {
          playlistId,
          batchIndex,
          totalBatches,
          completedBatches,
          error: err
        });

        return {
          status: 'PARTIAL_FAILURE',
          playlistId: validated.playlistId,
          spotifyPlaylistId: playlistId,
          spotifyPlaylistUrl: playlistUrl,
          playlistUrl,
          snapshotId: currentSnapshotId,
          exportedTrackCount: completedBatches * BATCH_SIZE,
          totalBatches,
          completedBatches,
          failedBatchIndex: batchIndex,
          error: (err as Error).message
        };
      }
    }

    logger.info('Successfully exported playlist to Spotify', {
      playlistId: validated.playlistId,
      spotifyPlaylistId: playlistId,
      exportedTracks: exportUris.length,
      snapshotId: currentSnapshotId
    });

    return {
      status: 'SUCCESS',
      playlistId: validated.playlistId,
      spotifyPlaylistId: playlistId,
      spotifyPlaylistUrl: playlistUrl,
      playlistUrl,
      snapshotId: currentSnapshotId,
      exportedTrackCount: exportUris.length,
      totalBatches,
      completedBatches
    };
  }
}
