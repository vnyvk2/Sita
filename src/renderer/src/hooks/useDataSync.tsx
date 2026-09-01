import { collectionKeys } from '@renderer/api/collectionKeys';
import { notifyLibraryStructureChanged } from '@renderer/other/libraryVersion';
import { albumQuery } from '@renderer/queries/albums';
import { analyticsQuery } from '@renderer/queries/analytics';
import { artistQuery } from '@renderer/queries/artists';
import { genreQuery } from '@renderer/queries/genres';
import { homeQuery } from '@renderer/queries/home';
import { searchQuery } from '@renderer/queries/search';
import { settingsQuery } from '@renderer/queries/settings';
import {
  SONG_WINDOW_SIZE,
  getSongListIdentity,
  songCacheKeys,
  songQuery,
  type SongIdsResult
} from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { useEffect, useRef } from 'react';

export type InvalidationTargetKey =
  | 'songs:all'
  | 'songs:ids'
  | 'songs:facets'
  | 'songs:windows'
  | 'songs:favorites'
  | 'songs:history'
  | 'songs:recentlyAdded'
  | 'songs:allInfo'
  | 'songs:singleInfo'
  | 'artists:all'
  | 'artists:single'
  | 'albums:all'
  | 'albums:single'
  | 'genres:all'
  | 'genres:single'
  | 'collections:all'
  | 'home:recentlyPlayedSongs'
  | 'home:recentSongArtists'
  | 'home:mostLovedSongs'
  | 'search:query'
  | 'search:recentResults'
  | 'settings:all'
  | 'analytics:listening'
  | 'analytics:libraryStats';

/**
 * Maps incoming IPC DataUpdateEvent types to targeted invalidation keys based on audited query
 * return shapes.
 *
 * Invariants:
 *
 * - Bulk hydration keys are gone: ID lists live under songQuery.ids; row objects live under
 *   ['songs','window',version,start]. 'songs:all' is kept only as a transition-safety net for
 *   consumers not yet converted.
 * - 'songs:windows' requires changed song ids from eventData; the batcher resolves them to the exact
 *   containing window keys of every active ID list (surgical row refresh, no version bump, no
 *   scroll disturbance).
 * - Structural song changes (add/delete/blacklist/tag edits affecting order or filters) bump the ID
 *   lists instead; new versions orphan old windows which gc naturally.
 */
export function getInvalidationTargetsForEvent(
  dataType: DataUpdateEventTypes
): InvalidationTargetKey[] {
  switch (dataType) {
    // 1. Structural song changes: list membership / ordering may change
    case 'songs':
    case 'songs/newSong':
    case 'songs/deletedSong':
    case 'blacklist/songBlacklist':
      return [
        'songs:all',
        'songs:ids',
        'songs:facets',
        'songs:recentlyAdded',
        'songs:history',
        'search:query',
        'home:recentlyPlayedSongs',
        'analytics:listening',
        'analytics:libraryStats'
      ];

    // 2. Tag edits: may affect sort position or filter membership; ids refetch is ~tens of ms
    case 'songs/updatedSong':
      return [
        'songs:all',
        'songs:ids',
        'songs:facets',
        'songs:recentlyAdded',
        'songs:history',
        'search:query',
        'home:recentlyPlayedSongs',
        'analytics:listening'
      ];

    case 'songs/likes':
      return ['songs:favorites', 'home:mostLovedSongs', 'songs:singleInfo', 'songs:windows'];

    case 'songs/artworks':
      return [
        'songs:all',
        'songs:allInfo',
        'songs:singleInfo',
        'songs:windows',
        'albums:all',
        'albums:single'
      ];

    case 'songs/palette':
      return [];
    case 'songs/lyrics':
      return [];
    case 'songs/listeningData':
    case 'songs/listeningData/fullSongListens':
    case 'songs/listeningData/skips':
    case 'songs/listeningData/listens':
    case 'songs/listeningData/inNoOfPlaylists':
      return ['home:recentlyPlayedSongs', 'analytics:listening'];

    // 5. Artists
    case 'artists':
    case 'artists/newArtist':
    case 'artists/updatedArtist':
    case 'artists/deletedArtist':
      return [
        'artists:all',
        'artists:single',
        'home:recentSongArtists',
        'search:query',
        'analytics:listening'
      ];
    case 'artists/likes':
    case 'artists/artworks':
      return ['artists:all', 'artists:single'];

    // 6. Albums
    case 'albums':
    case 'albums/newAlbum':
    case 'albums/updatedAlbum':
    case 'albums/deletedAlbum':
    case 'albums/likes':
      return ['albums:all', 'albums:single', 'search:query', 'analytics:listening'];

    // 7. Genres
    case 'genres':
    case 'genres/newGenre':
    case 'genres/updatedGenre':
    case 'genres/deletedGenre':
      return ['genres:all', 'genres:single', 'analytics:listening'];

    // 8. Playlists / Collections
    case 'playlists':
    case 'playlists/newPlaylist':
    case 'playlists/updatedPlaylist':
    case 'playlists/deletedPlaylist':
    case 'playlists/newSong':
    case 'playlists/deletedSong':
      return ['collections:all', 'home:recentlyPlayedSongs'];

    // 9. User Settings & Recent Searches
    case 'userData':
    case 'userData/theme':
    case 'userData/windowPosition':
    case 'userData/windowDiamension':
    case 'userData/sortingStates':
    case 'settings/preferences':
      return ['settings:all'];
    case 'userData/recentSearches':
      return ['search:recentResults'];

    default:
      return [];
  }
}

/** Executes targeted React Query cache invalidation for a given target key. */
export function invalidateTarget(target: InvalidationTargetKey, client = queryClient): void {
  switch (target) {
    case 'songs:all':
      client.invalidateQueries({ queryKey: songQuery.all._def });
      break;
    case 'songs:ids':
      client.invalidateQueries({ queryKey: songQuery.ids._def });
      break;
    case 'songs:facets':
      client.invalidateQueries({ queryKey: songQuery.facets._def });
      break;
    case 'songs:favorites':
      client.invalidateQueries({ queryKey: songQuery.favorites._def });
      break;
    case 'songs:history':
      client.invalidateQueries({ queryKey: songQuery.history._def });
      break;
    case 'songs:recentlyAdded':
      client.invalidateQueries({ queryKey: songQuery.recentlyAdded._def });
      break;
    case 'songs:allInfo':
      client.invalidateQueries({ queryKey: songQuery.allSongInfo._def });
      break;
    case 'songs:singleInfo':
      client.invalidateQueries({ queryKey: songQuery.singleSongInfo._def });
      break;
    case 'artists:all':
      client.invalidateQueries({ queryKey: artistQuery.all._def });
      break;
    case 'artists:single':
      client.invalidateQueries({ queryKey: artistQuery.single._def });
      break;
    case 'albums:all':
      client.invalidateQueries({ queryKey: albumQuery.all._def });
      break;
    case 'albums:single':
      client.invalidateQueries({ queryKey: albumQuery.single._def });
      break;
    case 'genres:all':
      client.invalidateQueries({ queryKey: genreQuery.all._def });
      break;
    case 'genres:single':
      client.invalidateQueries({ queryKey: genreQuery.single._def });
      break;
    case 'collections:all':
      client.invalidateQueries({ queryKey: collectionKeys.all });
      break;
    case 'home:recentlyPlayedSongs':
      client.invalidateQueries({ queryKey: homeQuery.recentlyPlayedSongs.queryKey });
      break;
    case 'home:recentSongArtists':
      client.invalidateQueries({ queryKey: homeQuery.recentSongArtists.queryKey });
      break;
    case 'home:mostLovedSongs':
      client.invalidateQueries({ queryKey: homeQuery.mostLovedSongs.queryKey });
      break;
    case 'search:query':
      client.invalidateQueries({ queryKey: searchQuery.query._def });
      break;
    case 'search:recentResults':
      client.invalidateQueries({ queryKey: searchQuery.recentResults.queryKey });
      break;
    case 'settings:all':
      client.invalidateQueries({ queryKey: settingsQuery._def });
      break;
    case 'analytics:listening':
      client.invalidateQueries({ queryKey: analyticsQuery.listening._def });
      break;
    case 'analytics:libraryStats':
      client.invalidateQueries({ queryKey: analyticsQuery.libraryStats.queryKey });
      break;
  }
}

export type SchedulerFn = (callback: () => void) => () => void;

export const defaultRafScheduler: SchedulerFn = (callback) => {
  const handle = requestAnimationFrame(() => {
    callback();
  });
  return () => cancelAnimationFrame(handle);
};

/**
 * Invalidates exactly the hydration windows that contain the changed song ids, across every cached
 * ID list version. Rows refetch in place (~40KB per window) without bumping the ID list version, so
 * scroll position and list ordering are untouched.
 */
export function invalidateWindowsContainingIds(
  client: typeof queryClient,
  changedIds: ReadonlySet<number>
): void {
  if (changedIds.size === 0) return;
  const idQueries = client.getQueryCache().findAll({ queryKey: songQuery.ids._def });

  for (const listQuery of idQueries) {
    const data = listQuery.state.data as SongIdsResult | undefined;
    const dataUpdatedAt = listQuery.state.dataUpdatedAt;
    if (!data?.ids?.length || !dataUpdatedAt) continue;

    // listQuery.queryKey is ['songs', 'ids', params]
    const params = listQuery.queryKey?.[2];
    const listIdentity = getSongListIdentity(params);
    const version = Math.floor(dataUpdatedAt);
    const indexById = new Map<number, number>();
    for (let i = 0; i < data.ids.length; i += 1) {
      indexById.set(data.ids[i], i);
    }

    for (const id of changedIds) {
      const index = indexById.get(id);
      if (index === undefined) continue;
      const windowStart = Math.floor(index / SONG_WINDOW_SIZE) * SONG_WINDOW_SIZE;
      client.invalidateQueries({
        queryKey: songCacheKeys.window(listIdentity, version, windowStart)
      });
    }
  }
}

export class DataSyncBatcher {
  private pendingTargets = new Set<InvalidationTargetKey>();
  private pendingChangedIds = new Set<number>();
  private cancelScheduledFlush: (() => void) | null = null;
  private scheduler: SchedulerFn;
  private client: typeof queryClient;

  constructor(scheduler = defaultRafScheduler, client = queryClient) {
    this.scheduler = scheduler;
    this.client = client;
  }

  public handleEvents(dataEvents: DataUpdateEvent[]): void {
    for (const event of dataEvents) {
      const targets = getInvalidationTargetsForEvent(event.dataType);
      for (const target of targets) {
        this.pendingTargets.add(target);
      }
      for (const payload of event.eventData ?? []) {
        if (Array.isArray(payload?.data)) {
          for (const id of payload.data) {
            if (typeof id === 'number') this.pendingChangedIds.add(id);
          }
        }
      }
    }

    if (
      (this.pendingTargets.size > 0 || this.pendingChangedIds.size > 0) &&
      !this.cancelScheduledFlush
    ) {
      this.cancelScheduledFlush = this.scheduler(() => {
        this.flush();
      });
    }
  }

  public flush(): void {
    if (this.cancelScheduledFlush) {
      this.cancelScheduledFlush();
      this.cancelScheduledFlush = null;
    }
    const targetsToInvalidate = Array.from(this.pendingTargets);
    const changedIds = new Set(this.pendingChangedIds);
    this.pendingTargets.clear();
    this.pendingChangedIds.clear();

    for (const target of targetsToInvalidate) {
      if (target === 'songs:windows') continue;
      invalidateTarget(target, this.client);
    }

    if (changedIds.size > 0) {
      invalidateWindowsContainingIds(this.client, changedIds);
    }
  }

  public cleanup(): void {
    if (this.cancelScheduledFlush) {
      this.cancelScheduledFlush();
      this.cancelScheduledFlush = null;
    }
    this.pendingTargets.clear();
    this.pendingChangedIds.clear();
  }
}

/**
 * Hook for synchronizing data updates from the main process.
 *
 * Listens to IPC data update events from the main process and invalidates only relevant React Query
 * caches in deduplicated animation-frame batches to keep the UI in sync with zero unnecessary
 * re-query churn.
 */
export function useDataSync(scheduler: SchedulerFn = defaultRafScheduler): void {
  const batcherRef = useRef<DataSyncBatcher | null>(null);

  if (!batcherRef.current) {
    batcherRef.current = new DataSyncBatcher(scheduler);
  }

  useEffect(() => {
    const batcher = batcherRef.current!;

    const noticeDataUpdateEvents = (_: unknown, dataEvents: DataUpdateEvent[]) => {
      // Structural song events invalidate the canonical All Songs projection
      // (docs/canonical-queue-architecture.md, Invariant 7).
      notifyLibraryStructureChanged(dataEvents);
      batcher.handleEvents(dataEvents);
    };

    window.api.dataUpdates.dataUpdateEvent(noticeDataUpdateEvents);

    return () => {
      window.api.dataUpdates.removeDataUpdateEventListener?.(noticeDataUpdateEvents);
      batcher.cleanup();
    };
  }, []);
}
