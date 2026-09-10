import { db } from '../../db/db';
import { smartPlaylistRules } from '../../db/schema';
import { libraryEventBus } from '../../events/LibraryEventBus';
import { SmartPlaylistJob } from '../../workers/jobs/smartPlaylistJob';
import { libraryScheduler } from '../../workers/jobScheduler';
import { collectionEventBus, type CollectionEvent } from '../events/CollectionEventBus';
import { DependencyAnalyzer } from './DependencyAnalyzer';

interface CachedRule {
  playlistId: number;
  dependencies: any;
}

export class SmartPlaylistScheduler {
  private dirtyPlaylists = new Set<number>();
  private debounceTimeout: NodeJS.Timeout | null = null;
  private cachedRules: CachedRule[] | null = null;
  private pendingRuleFetch: Promise<CachedRule[]> | null = null;
  private unregisterListeners: (() => void)[] = [];
  private metrics = {
    eventsReceived: 0,
    playlistsConsidered: 0,
    jobsQueued: 0,
    lastFlushDurationMs: 0
  };

  constructor() {
    this.setupListeners();
  }

  public getMetrics() {
    return { ...this.metrics };
  }

  public invalidateRulesCache() {
    this.cachedRules = null;
    this.pendingRuleFetch = null;
  }

  public reset() {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    this.dirtyPlaylists.clear();
    this.invalidateRulesCache();
  }

  public cleanup() {
    this.reset();
    for (const unreg of this.unregisterListeners) {
      unreg();
    }
    this.unregisterListeners = [];
  }

  public setupListeners() {
    for (const unreg of this.unregisterListeners) {
      unreg();
    }
    this.unregisterListeners = [];
    const onSongAdded = () => this.handleEvent('SongAdded', []);
    const onSongRemoved = () => this.handleEvent('SongRemoved', []);
    const onMetaChanged = (event: { songId: number; changedFields: any[] }) =>
      this.handleEvent('SongMetadataChanged', event.changedFields);
    const onPlayCountChanged = () => this.handleEvent('SongPlayCountChanged', ['playCount']);
    const onFavoriteChanged = () => this.handleEvent('SongFavoriteChanged', ['isFavorite']);

    libraryEventBus.onEvent('SongAdded', onSongAdded);
    libraryEventBus.onEvent('SongRemoved', onSongRemoved);
    libraryEventBus.onEvent('SongMetadataChanged', onMetaChanged);
    libraryEventBus.onEvent('SongPlayCountChanged', onPlayCountChanged);
    libraryEventBus.onEvent('SongFavoriteChanged', onFavoriteChanged);

    const onCollectionEvent = (event: CollectionEvent) => {
      if (
        event.type === 'CollectionCreated' ||
        event.type === 'CollectionChanged' ||
        event.type === 'CollectionDeleted'
      ) {
        this.invalidateRulesCache();
      }
    };
    collectionEventBus.onEvent(onCollectionEvent);

    this.unregisterListeners = [
      () => libraryEventBus.offEvent('SongAdded', onSongAdded),
      () => libraryEventBus.offEvent('SongRemoved', onSongRemoved),
      () => libraryEventBus.offEvent('SongMetadataChanged', onMetaChanged),
      () => libraryEventBus.offEvent('SongPlayCountChanged', onPlayCountChanged),
      () => libraryEventBus.offEvent('SongFavoriteChanged', onFavoriteChanged),
      () => collectionEventBus.offEvent(onCollectionEvent)
    ];
  }

  private async getRules(): Promise<CachedRule[]> {
    if (this.cachedRules) {
      return this.cachedRules;
    }

    if (!this.pendingRuleFetch) {
      this.pendingRuleFetch = (async () => {
        try {
          const rules = await db
            .select({
              playlistId: smartPlaylistRules.playlistId,
              dependencies: smartPlaylistRules.dependencies
            })
            .from(smartPlaylistRules);
          this.cachedRules = rules;
          return rules;
        } finally {
          this.pendingRuleFetch = null;
        }
      })();
    }

    return await this.pendingRuleFetch;
  }

  private async handleEvent(eventName: string, changedFields: readonly string[]) {
    this.metrics.eventsReceived++;
    try {
      const allRules = await this.getRules();
      this.metrics.playlistsConsidered += allRules.length;

      for (const rule of allRules) {
        let affected = false;

        if (eventName === 'SongAdded' || eventName === 'SongRemoved') {
          affected = true;
        } else if (Array.isArray(rule.dependencies)) {
          affected = DependencyAnalyzer.isAffectedByMetadataChange(
            rule.dependencies,
            changedFields
          );
        } else {
          affected = true;
        }

        if (affected) {
          this.dirtyPlaylists.add(rule.playlistId);
        }
      }

      this.scheduleFlush();
    } catch (error) {
      console.error(
        `Failed to handle library event ${eventName} in SmartPlaylistScheduler:`,
        error
      );
    }
  }

  private scheduleFlush() {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // 5 seconds debounce
    this.debounceTimeout = setTimeout(() => {
      this.flushDirtyPlaylists();
    }, 5000);
  }

  private flushDirtyPlaylists() {
    const startTime = performance.now();
    for (const playlistId of this.dirtyPlaylists) {
      const job = new SmartPlaylistJob(`smart_playlist_regenerate_${playlistId}`, playlistId);
      libraryScheduler.enqueue(job);
      this.metrics.jobsQueued++;
    }

    this.dirtyPlaylists.clear();
    this.debounceTimeout = null;
    this.metrics.lastFlushDurationMs = performance.now() - startTime;
  }
}

// Global instance
export const smartPlaylistScheduler = new SmartPlaylistScheduler();
