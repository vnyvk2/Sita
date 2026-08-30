import type {
  Collection,
  CollectionEntry,
  CollectionId,
  CollectionCapabilities
} from '../../../common/collections/types';
import type { CollectionProvider, CollectionQueryOptions, EntryQueryOptions } from './types';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId, getNumericKey } from '../../../common/collections/id';
import { playlists, playlistEntries, songs } from '@db/schema';

type PlaylistRow = typeof playlists.$inferSelect;
type EntryRow = {
  entry: typeof playlistEntries.$inferSelect;
  song: typeof songs.$inferSelect;
};

const PLAYLIST_CAPABILITIES: CollectionCapabilities = {
  canRename: true,
  canDelete: true,
  canReorder: true,
  canAddSongs: true,
  canRemoveSongs: true,
  canExport: true,
  canImport: true,
  canPin: true,
  supportsUndo: true,
  supportsDragDrop: true,
  supportsRules: false, // Smart playlists will have a different capability set or provider
  supportsHierarchy: true
};

export class PlaylistProvider implements CollectionProvider {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async getCollection(id: CollectionId): Promise<Collection | null> {
    const playlistId = getNumericKey(id);
    if (playlistId === undefined) return null;

    const row = await this.repository.getById(playlistId);
    if (!row) return null;

    return this.toCollection(row);
  }

  public async getAllCollections(
    options: CollectionQueryOptions
  ): Promise<PaginatedResult<Collection, string>> {
    const limit = options.end !== undefined && options.start !== undefined 
      ? options.end - options.start 
      : undefined;
    
    const rows = await this.repository.getAll({
      limit,
      offset: options.start
    });
    
    const total = await this.repository.countAll();

    return {
      data: rows.map((r) => this.toCollection(r)),
      start: options.start ?? 0,
      end: (options.start ?? 0) + rows.length,
      total
    };
  }

  public async getEntries(
    id: CollectionId,
    options: EntryQueryOptions
  ): Promise<PaginatedResult<CollectionEntry, string>> {
    const playlistId = getNumericKey(id);
    if (playlistId === undefined) {
      return { data: [], start: options.start, end: options.start, total: 0 };
    }

    const limit = options.end - options.start;
    const rows = await this.repository.getEntries(playlistId, {
      limit,
      offset: options.start,
      sortType: options.sortType
    });
    
    const total = await this.repository.countEntries(playlistId);

    // Provider preserves natural repository ordering and purely translates data types.
    // Dynamic sorting (if sortDefinition is present) is explicitly deferred to Pipeline/SortEngine.

    return {
      data: rows.map((r) => this.toCollectionEntry(r)),
      start: options.start,
      end: options.start + rows.length,
      total
    };
  }

  private toCollection(row: PlaylistRow): Collection {
    return {
      id: createCollectionId('local', 'playlist', row.id),
      title: row.name,
      description: row.description ?? undefined,
      icon: 'playlist',
      state: 'ready',
      capabilities: PLAYLIST_CAPABILITIES,
      stats: {
        totalEntries: row.itemCount,
        totalDuration: Number(row.totalDuration ?? 0),
        uniqueArtists: 0, 
        uniqueAlbums: 0
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private toCollectionEntry(row: EntryRow): CollectionEntry {
    return {
      entryId: row.entry.id,
      song: this.toSongData(row.song),
      position: row.entry.position,
      addedAt: row.entry.addedAt
    };
  }

  private toSongData(row: typeof songs.$inferSelect): SongData {
    return {
      songId: row.id,
      title: row.title,
      duration: Number(row.duration ?? 0),
      artists: [], // Hydrated by Pipeline/SortEngine if needed, or joined later if requested
      album: undefined,
      genres: [],
      albumArtists: [],
      bitrate: row.bitRate ?? undefined,
      trackNo: row.trackNumber ?? undefined,
      discNo: row.diskNumber ?? undefined,
      noOfChannels: row.noOfChannels ?? undefined,
      year: row.year ?? undefined,
      sampleRate: row.sampleRate ?? undefined,
      paletteId: undefined, // Requires vibrant palette join
      isAFavorite: false, // Requires play_history/favorites join
      isArtworkAvailable: false, // Will be resolved by Pipeline
      path: row.path,
      createdDate: row.createdAt ? row.createdAt.getTime() : undefined,
      modifiedDate: row.updatedAt ? row.updatedAt.getTime() : undefined,
      addedDate: row.createdAt ? row.createdAt.getTime() : Date.now(),
      artworkPaths: {
        isDefaultArtwork: true,
        artworkPath: '',
        optimizedArtworkPath: ''
      },
      isBlacklisted: false,
      language: row.language || undefined
    };
  }
}
