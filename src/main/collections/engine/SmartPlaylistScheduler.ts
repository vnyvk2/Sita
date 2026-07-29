import { db } from '../../db/db';
import { smartPlaylistRules } from '../../db/schema';
import { libraryEventBus } from '../../events/LibraryEventBus';
import { DependencyAnalyzer } from './DependencyAnalyzer';
import { libraryScheduler } from '../../workers/jobScheduler';
import { SmartPlaylistJob } from '../../workers/jobs/smartPlaylistJob';

export class SmartPlaylistScheduler {
  private dirtyPlaylists = new Set<number>();
  private debounceTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // Structural changes
    libraryEventBus.onEvent('SongAdded', () => this.handleEvent('SongAdded', []));
    libraryEventBus.onEvent('SongRemoved', () => this.handleEvent('SongRemoved', []));

    // Metadata/Field changes
    libraryEventBus.onEvent('SongMetadataChanged', (event) =>
      this.handleEvent('SongMetadataChanged', event.changedFields)
    );
    libraryEventBus.onEvent('SongPlayCountChanged', () =>
      this.handleEvent('SongPlayCountChanged', ['playCount'])
    );
    libraryEventBus.onEvent('SongFavoriteChanged', () =>
      this.handleEvent('SongFavoriteChanged', ['isFavorite'])
    );
    libraryEventBus.onEvent('SongRatingChanged', () =>
      this.handleEvent('SongRatingChanged', ['rating'])
    );
  }

  private async handleEvent(eventName: string, changedFields: string[]) {
    try {
      const allRules = await db
        .select({
          playlistId: smartPlaylistRules.playlistId,
          dependencies: smartPlaylistRules.dependencies
        })
        .from(smartPlaylistRules);

      for (const rule of allRules) {
        // If it's a structural change, we assume it's affected since it could match any rule
        let affected = false;

        if (eventName === 'SongAdded' || eventName === 'SongRemoved') {
          affected = true;
        } else if (rule.dependencies && rule.dependencies.length > 0) {
          affected = DependencyAnalyzer.isAffectedByMetadataChange(
            rule.dependencies as any[],
            changedFields
          );
        } else {
          // If dependencies are missing/not extracted for some reason, default to dirty
          affected = true;
        }

        if (affected) {
          this.dirtyPlaylists.add(rule.playlistId);
        }
      }

      this.scheduleFlush();
    } catch (error) {
      console.error(`Failed to handle library event ${eventName} in SmartPlaylistScheduler:`, error);
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
    for (const playlistId of this.dirtyPlaylists) {
      const job = new SmartPlaylistJob(`smart_playlist_regenerate_${playlistId}`, playlistId);
      libraryScheduler.enqueue(job);
    }

    this.dirtyPlaylists.clear();
    this.debounceTimeout = null;
  }
}

// Global instance
export const smartPlaylistScheduler = new SmartPlaylistScheduler();
