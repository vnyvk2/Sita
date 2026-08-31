import { relations, type SQL, sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

import type { CollectionContextData } from '../collections/context/types';
import type { OperationInverseInput, OperationType } from '../collections/operations/types';
import type { MetadataHistorySnapshot } from '../metadata/history/MetadataHistoryService';
import type {
  SmartPlaylistRuleAST,
  OrderDefinition,
  SmartPlaylistField
} from '../collections/query/ast';
import {
  DEFAULT_METADATA_PREFERENCES,
  type MetadataProviderPreferences
} from '../../common/metadata/preferences';
import { NORM_STRIP_CHARS } from './sqlite/norm';

// ============================================================================
// SQLite translation of the PostgreSQL schema (PGlite -> node:sqlite migration).
//
// Mapping rules (documented in sqlite-poc/migration-surface.md):
//   identity PK            -> INTEGER PRIMARY KEY (rowid alias)
//   citext generated col   -> TEXT GENERATED ALWAYS AS (lower(x)) STORED  (ASCII lower)
//   search-norm column     -> TEXT GENERATED ALWAYS AS (lower + punctuation/space strip) STORED
//   varchar(n)             -> TEXT
//   numeric/decimal        -> REAL
//   double precision       -> REAL
//   timestamp / timestamptz-> INTEGER epoch-ms (drizzle timestamp_ms; UTC instants)
//   boolean                -> INTEGER 0/1 (drizzle boolean mode)
//   pgEnum                 -> TEXT with $type<> union (CHECK enforced in baseline DDL)
//   json / jsonb           -> TEXT (drizzle json mode; JSON1 compiled into node:sqlite)
//   GIN gin_trgm_ops       -> FTS5 trigram tables (baseline DDL; not modelled in drizzle)
// ============================================================================

// Characters stripped by the *_norm columns: ASCII whitespace + punctuation.
// (definition lives in ./sqlite/norm.ts — shared with the baseline DDL)

function normExpr(columnGetter: () => AnySQLiteColumn): SQL {
  // built lazily so the table symbol is initialized (mirrors generatedAlwaysAs callbacks)
  let expr: SQL = sql`lower(${columnGetter()})`;
  for (const ch of NORM_STRIP_CHARS) {
    expr = sql`replace(${expr}, ${ch}, ${''})`;
  }
  return expr;
}

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const tsDefaultNow = (name: string) => ts(name).notNull().$defaultFn(() => new Date());
const jsonText = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

// Enum mirrors (string unions; CHECK constraints live in the baseline DDL)
export const artworkSourceEnumValues = ['LOCAL', 'REMOTE'] as const;
export type ArtworkSource = (typeof artworkSourceEnumValues)[number];
export const swatchTypeEnumValues = [
  'VIBRANT',
  'LIGHT_VIBRANT',
  'DARK_VIBRANT',
  'MUTED',
  'LIGHT_MUTED',
  'DARK_MUTED'
] as const;
export type SwatchType = (typeof swatchTypeEnumValues)[number];
export const lyricsProviderEnumValues = ['MUSIXMATCH', 'LRCLIB', 'EMBEDDED', 'FILESYSTEM'] as const;
export type LyricsProvider = (typeof lyricsProviderEnumValues)[number];

// Backwards-compatible aliases (the old pgEnum objects; consumers only used the type unions)
export const artworkSourceEnum = { enumValues: artworkSourceEnumValues };
export const swatchTypeEnum = { enumValues: swatchTypeEnumValues };
export const lyricsProviderEnum = { enumValues: lyricsProviderEnumValues };

// ============================================================================
// Core tables
// ============================================================================
export const artists = sqliteTable(
  'artists',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    // Generated column: case-insensitive text for searches
    nameCI: text('name_ci').generatedAlwaysAs((): SQL => sql`lower(${artists.name})`),
    nameNorm: text('name_norm').generatedAlwaysAs((): SQL => normExpr(() => artists.name)),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_artists_name').on(t.name),
    index('idx_artists_name_ci').on(t.nameCI),
    index('idx_artists_is_favorite').on(t.isFavorite)
  ]
);

export const musicFolders = sqliteTable(
  'music_folders',
  {
    id: integer('id').primaryKey(),
    path: text('path').notNull().unique(),
    name: text('name').notNull(),
    isBlacklisted: integer('is_blacklisted', { mode: 'boolean' }).notNull().default(false),
    parentId: integer('parent_id').references((): AnySQLiteColumn => musicFolders.id, {
      onDelete: 'set null',
      onUpdate: 'cascade'
    }),
    isBlacklistedUpdatedAt: tsDefaultNow('is_blacklisted_updated_at'),
    folderCreatedAt: ts('folder_created_at'),
    lastModifiedAt: ts('last_modified_at'),
    lastChangedAt: ts('last_changed_at'),
    lastParsedAt: ts('last_parsed_at'),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_parent_id').on(t.parentId),
    index('idx_music_folders_is_blacklisted').on(t.isBlacklisted),
    index('idx_music_folders_parent_path').on(t.parentId, t.path)
  ]
);

export const songs = sqliteTable(
  'songs',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    titleCI: text('title_ci').generatedAlwaysAs((): SQL => sql`lower(${songs.title})`),
    titleNorm: text('title_norm').generatedAlwaysAs((): SQL => normExpr(() => songs.title)),
    duration: real('duration').notNull(),
    skipCount: integer('skip_count').notNull().default(0),
    path: text('path').notNull().unique(),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    sampleRate: integer('sample_rate'),
    bitRate: integer('bit_rate'),
    noOfChannels: integer('no_of_channels'),
    year: integer('year'),
    diskNumber: integer('disk_number'),
    trackNumber: integer('track_number'),
    folderId: integer('folder_id').references(() => musicFolders.id, {
      onDelete: 'set null',
      onUpdate: 'cascade'
    }),
    isBlacklisted: integer('is_blacklisted', { mode: 'boolean' }).notNull().default(false),
    isBlacklistedUpdatedAt: tsDefaultNow('is_blacklisted_updated_at'),
    isFavoriteUpdatedAt: tsDefaultNow('is_favorite_updated_at'),
    fileCreatedAt: ts('file_created_at').notNull(),
    fileModifiedAt: ts('file_modified_at').notNull(),
    musicBrainzRecordingId: text('music_brainz_recording_id'),
    isrc: text('isrc'),
    language: text('language'),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_songs_title').on(t.title),
    index('idx_songs_title_ci').on(t.titleCI),
    index('idx_songs_year').on(t.year),
    index('idx_songs_track_number').on(t.trackNumber),
    index('idx_songs_music_brainz_recording_id').on(t.musicBrainzRecordingId),
    index('idx_songs_isrc').on(t.isrc),
    index('idx_songs_language').on(t.language),
    index('idx_songs_created_at').on(t.createdAt),
    index('idx_songs_file_modified_at').on(t.fileModifiedAt),
    index('idx_songs_folder_id').on(t.folderId),
    index('idx_songs_is_favorite').on(t.isFavorite),
    index('idx_songs_is_blacklisted').on(t.isBlacklisted),
    index('idx_songs_skip_count_title').on(t.skipCount, t.title),
    index('idx_songs_year_title').on(t.year, t.title),
    index('idx_songs_track_title').on(t.trackNumber, t.title),
    index('idx_songs_created_title').on(t.createdAt, t.title),
    index('idx_songs_modified_title').on(t.fileModifiedAt, t.title),
    index('idx_songs_favorite_title').on(t.isFavorite, t.title),
    index('idx_songs_folder_title').on(t.folderId, t.title)
  ]
);

export const artworks = sqliteTable(
  'artworks',
  {
    id: integer('id').primaryKey(),
    hash: text('hash').notNull().unique(),
    path: text('path').notNull(),
    source: text('source').$type<ArtworkSource>().notNull().default('LOCAL'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    isOptimized: integer('is_optimized', { mode: 'boolean' }).notNull().default(false),
    generatorVersion: integer('generator_version').notNull().default(1),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_artworks_path').on(t.path),
    index('idx_artworks_source').on(t.source),
    index('idx_artworks_dimensions').on(t.width, t.height),
    index('idx_artworks_source_dimensions').on(t.source, t.width, t.height)
  ]
);

export const palettes = sqliteTable(
  'palettes',
  {
    id: integer('id').primaryKey(),
    artworkId: integer('artwork_id')
      .notNull()
      .references(() => artworks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    generatorVersion: integer('generator_version').notNull().default(1),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [uniqueIndex('idx_palettes_artwork_id').on(t.artworkId)]
);

export const paletteSwatches = sqliteTable(
  'palette_swatches',
  {
    id: integer('id').primaryKey(),
    population: integer('population').notNull(),
    hex: text('hex').notNull(),
    hsl: jsonText<{ h: number; s: number; l: number }>('hsl').notNull(),
    swatchType: text('swatch_type').$type<SwatchType>().notNull().default('VIBRANT'),
    paletteId: integer('palette_id')
      .notNull()
      .references(() => palettes.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_palette_swatches_palette_id').on(t.paletteId),
    index('idx_palette_swatches_type').on(t.swatchType),
    index('idx_palette_swatches_palette_type').on(t.paletteId, t.swatchType),
    index('idx_palette_swatches_hex').on(t.hex)
  ]
);

export const albums = sqliteTable(
  'albums',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    titleCI: text('title_ci').generatedAlwaysAs((): SQL => sql`lower(${albums.title})`),
    titleNorm: text('title_norm').generatedAlwaysAs((): SQL => normExpr(() => albums.title)),
    year: integer('year'),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_albums_title').on(t.title),
    index('idx_albums_title_ci').on(t.titleCI),
    index('idx_albums_year').on(t.year),
    index('idx_albums_year_title').on(t.year, t.title),
    index('idx_albums_is_favorite').on(t.isFavorite)
  ]
);

export const genres = sqliteTable(
  'genres',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    nameCI: text('name_ci').generatedAlwaysAs((): SQL => sql`lower(${genres.name})`),
    nameNorm: text('name_norm').generatedAlwaysAs((): SQL => normExpr(() => genres.name)),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_genres_name').on(t.name),
    uniqueIndex('idx_genres_name_ci').on(t.nameCI)
  ]
);

export const playlists = sqliteTable(
  'playlists',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    nameCI: text('name_ci').generatedAlwaysAs((): SQL => sql`lower(${playlists.name})`),
    nameNorm: text('name_norm').generatedAlwaysAs((): SQL => normExpr(() => playlists.name)),
    description: text('description'),
    parentId: integer('parent_id').references((): AnySQLiteColumn => playlists.id, {
      onDelete: 'set null',
      onUpdate: 'cascade'
    }),
    playlistType: text('playlist_type').notNull().default('standard'),
    itemCount: integer('item_count').notNull().default(0),
    totalDuration: real('total_duration').notNull().default(0),
    sidebarPosition: integer('sidebar_position'),
    pinnedAt: ts('pinned_at'),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_playlists_name').on(t.name),
    index('idx_playlists_name_ci').on(t.nameCI),
    index('idx_playlists_created_at').on(t.createdAt),
    index('idx_playlists_parent_id').on(t.parentId),
    index('idx_playlists_type').on(t.playlistType),
    index('idx_playlists_sidebar').on(t.sidebarPosition),
    index('idx_playlists_pinned').on(t.pinnedAt)
  ]
);

export const playlistEntries = sqliteTable(
  'playlist_entries',
  {
    id: integer('id').primaryKey(),
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: tsDefaultNow('added_at'),
    source: text('source').default('manual'),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_playlist_entries_playlist_id').on(t.playlistId),
    index('idx_playlist_entries_song_id').on(t.songId),
    index('idx_playlist_entries_playlist_position').on(t.playlistId, t.position),
    index('idx_playlist_entries_added_at').on(t.addedAt)
  ]
);

export const smartPlaylistRules = sqliteTable(
  'smart_playlist_rules',
  {
    id: integer('id').primaryKey(),
    playlistId: integer('playlist_id')
      .notNull()
      .unique()
      .references(() => playlists.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ruleAst: jsonText<SmartPlaylistRuleAST>('rule_ast').notNull(),
    ruleVersion: integer('rule_version').notNull().default(1),
    maxEntries: integer('max_entries'),
    sortDefinition: jsonText<OrderDefinition[]>('sort_definition'),
    dependencies: jsonText<SmartPlaylistField[]>('dependencies'),
    lastGeneratedAt: ts('last_generated_at'),
    ruleHash: text('rule_hash'),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  () => []
);

export const playEvents = sqliteTable(
  'play_events',
  {
    id: integer('id').primaryKey(),
    playbackPercentage: real('playback_percentage').notNull(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_play_events_song_id').on(t.songId),
    index('idx_play_events_created_at').on(t.createdAt),
    index('idx_play_events_song_created').on(t.songId, t.createdAt),
    index('idx_play_events_percentage').on(t.playbackPercentage)
  ]
);

export const seekEvents = sqliteTable(
  'seek_events',
  {
    id: integer('id').primaryKey(),
    position: real('position').notNull(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_seek_events_song_id').on(t.songId),
    index('idx_seek_events_created_at').on(t.createdAt),
    index('idx_seek_events_song_created').on(t.songId, t.createdAt)
  ]
);

export const skipEvents = sqliteTable(
  'skip_events',
  {
    id: integer('id').primaryKey(),
    position: real('position').notNull(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_skip_events_song_id').on(t.songId),
    index('idx_skip_events_created_at').on(t.createdAt),
    index('idx_skip_events_song_created').on(t.songId, t.createdAt)
  ]
);

export const playHistory = sqliteTable(
  'play_history',
  {
    id: integer('id').primaryKey(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_play_history_song_id').on(t.songId),
    index('idx_play_history_created_at').on(t.createdAt)
  ]
);

export const metadataOverrides = sqliteTable(
  'metadata_overrides',
  {
    id: integer('id').primaryKey(),
    entityKind: text('entity_kind').notNull(),
    entityId: text('entity_id').notNull(),
    fieldId: text('field_id').notNull(),
    stringValue: text('string_value'),
    numberValue: real('number_value'),
    booleanValue: integer('boolean_value', { mode: 'boolean' }),
    jsonValue: text('json_value'),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    uniqueIndex('idx_metadata_overrides_lookup').on(t.entityKind, t.entityId, t.fieldId),
    index('idx_metadata_overrides_entity').on(t.entityKind, t.entityId)
  ]
);

/**
 * Durable undo journal for AutoTag / metadata operations.
 * `seq` is assigned by a baseline-DDL trigger (AFTER INSERT, MAX(seq)+1) — SQLite
 * supports only one rowid-alias per table and the PK here is the varchar `id`.
 * The PGlite->SQLite migration inserts explicit `seq` values, which the trigger skips.
 */
export const metadataUndoSnapshots = sqliteTable(
  'metadata_undo_snapshots',
  {
    id: text('id').primaryKey(),
    seq: integer('seq'),
    description: text('description').notNull().default(''),
    albumTitle: text('album_title'),
    payload: jsonText<{
      previousSongs: MetadataHistorySnapshot['previousSongs'];
      updatedSongs: MetadataHistorySnapshot['updatedSongs'];
      songIds?: number[];
    }>('payload').notNull(),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date())
  },
  (t) => [index('metadata_undo_snapshots_seq_idx').on(t.seq)]
);

/**
 * Durable deferred metadata file writes (2c P4): one self-contained, merged
 * TagData payload per song path, replayed on flush triggers and deleted on
 * success. Part of the DB-first correctness model - a crash between the DB
 * commit and the file write is recovered from here instead of drifting.
 */
export const metadataPendingWrites = sqliteTable(
  'metadata_pending_writes',
  {
    id: text('id').primaryKey(),
    songPath: text('song_path').notNull().unique(),
    tags: jsonText<Record<string, unknown>>('tags').notNull(),
    isKnownSource: integer('is_known_source', { mode: 'boolean' }).notNull().default(true),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: ts('updated_at').notNull().$defaultFn(() => new Date())
  },
  (t) => [index('metadata_pending_writes_song_path_idx').on(t.songPath)]
);

export const userSettings = sqliteTable(
  'user_settings',
  {
    id: integer('id').primaryKey(),
    language: text('language').notNull().default('en'),
    isDarkMode: integer('is_dark_mode', { mode: 'boolean' }).notNull().default(true),
    useSystemTheme: integer('use_system_theme', { mode: 'boolean' }).notNull().default(true),
    autoLaunchApp: integer('auto_launch_app', { mode: 'boolean' }).notNull().default(false),
    openWindowMaximizedOnStart: integer('open_window_maximized_on_start', { mode: 'boolean' })
      .notNull()
      .default(false),
    openWindowAsHiddenOnSystemStart: integer('open_window_as_hidden_on_system_start', {
      mode: 'boolean'
    })
      .notNull()
      .default(false),
    isMiniPlayerAlwaysOnTop: integer('is_mini_player_always_on_top', { mode: 'boolean' })
      .notNull()
      .default(false),
    isMusixmatchLyricsEnabled: integer('is_musixmatch_lyrics_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    hideWindowOnClose: integer('hide_window_on_close', { mode: 'boolean' }).notNull().default(false),
    traySingleClickTogglesWindow: integer('tray_single_click_toggles_window', { mode: 'boolean' })
      .notNull()
      .default(false),
    sendSongScrobblingDataToLastFM: integer('send_song_scrobbling_data_to_lastfm', {
      mode: 'boolean'
    })
      .notNull()
      .default(false),
    sendSongFavoritesDataToLastFM: integer('send_song_favorites_data_to_lastfm', {
      mode: 'boolean'
    })
      .notNull()
      .default(false),
    sendNowPlayingSongDataToLastFM: integer('send_now_playing_song_data_to_lastfm', {
      mode: 'boolean'
    })
      .notNull()
      .default(false),
    saveLyricsInLrcFilesForSupportedSongs: integer('save_lyrics_in_lrc_files_for_supported_songs', {
      mode: 'boolean'
    })
      .notNull()
      .default(true),
    enableDiscordRPC: integer('enable_discord_rpc', { mode: 'boolean' }).notNull().default(true),
    saveVerboseLogs: integer('save_verbose_logs', { mode: 'boolean' }).notNull().default(false),
    mainWindowX: integer('main_window_x'),
    mainWindowY: integer('main_window_y'),
    miniPlayerX: integer('mini_player_x'),
    miniPlayerY: integer('mini_player_y'),
    mainWindowWidth: integer('main_window_width'),
    mainWindowHeight: integer('main_window_height'),
    miniPlayerWidth: integer('mini_player_width'),
    miniPlayerHeight: integer('mini_player_height'),
    zoomFactor: real('zoom_factor').notNull().default(0.8),
    windowState: text('window_state').notNull().default('normal'),
    recentSearches: jsonText<string[]>('recent_searches').notNull().default([]),
    miniPlayerPinnedControls: jsonText<string[]>('mini_player_pinned_controls').notNull().default([
      'love',
      'lyrics',
      'volume'
    ]),
    miniPlayerMode: text('mini_player_mode')
      .$type<'standard' | 'compact'>()
      .notNull()
      .default('standard'),
    customLrcFilesSaveLocation: text('custom_lrc_files_save_location'),
    onlineDownloadsFolder: text('online_downloads_folder'),
    downloadsDuplicatePolicy: text('downloads_duplicate_policy')
      .$type<'SKIP' | 'OVERWRITE' | 'KEEP_BOTH'>()
      .notNull()
      .default('SKIP'),
    addDownloadsToLibrary: integer('add_downloads_to_library', { mode: 'boolean' })
      .notNull()
      .default(true),
    lastFmSessionName: text('lastfm_session_name'),
    lastFmSessionKey: text('lastfm_session_key'),
    libraryScanMode: text('library_scan_mode')
      .$type<'automatic' | 'startup' | 'manual'>()
      .notNull()
      .default('automatic'),
    lastScanTime: ts('last_scan_time'),
    metadataPreferences: jsonText<MetadataProviderPreferences>('metadata_preferences')
      .notNull()
      .default(DEFAULT_METADATA_PREFERENCES),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_user_settings_language').on(t.language),
    index('idx_user_settings_window_state').on(t.windowState)
  ]
);

export const userKeyboardShortcuts = sqliteTable('user_keyboard_shortcuts', {
  id: integer('id').primaryKey(),
  shortcuts: jsonText<Record<string, string>>('shortcuts').notNull().default({}),
  createdAt: tsDefaultNow('created_at'),
  updatedAt: tsDefaultNow('updated_at')
});

export const userEqualizerPreset = sqliteTable(
  'user_equalizer_preset',
  {
    id: integer('id').primaryKey(),
    presetName: text('preset_name').notNull().default('Default'),
    frequencyBands: jsonText<number[]>('frequency_bands').notNull().default([]),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [index('idx_user_equalizer_preset_created_at').on(t.createdAt)]
);

export const ignoredArtists = sqliteTable(
  'ignored_artists',
  {
    id: integer('id').primaryKey(),
    artistId: integer('artist_id')
      .notNull()
      .unique()
      .references(() => artists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  () => []
);

export const ignoredFeaturingArtists = sqliteTable(
  'ignored_featuring_artists',
  {
    id: integer('id').primaryKey(),
    artistId: integer('artist_id')
      .notNull()
      .unique()
      .references(() => artists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  () => []
);

export const ignoredDuplicateMetadata = sqliteTable(
  'ignored_duplicate_metadata',
  {
    id: integer('id').primaryKey(),
    duplicateGroupId: text('duplicate_group_id').notNull(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_ignored_duplicate_metadata_group').on(t.duplicateGroupId),
    index('idx_ignored_duplicate_metadata_song').on(t.songId)
  ]
);

// ============================================================================
// Many-to-Many Junction Tables
// ============================================================================
export const artworksSongs = sqliteTable(
  'artworks_songs',
  {
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    artworkId: integer('artwork_id')
      .notNull()
      .references(() => artworks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.songId, table.artworkId] }),
    index('idx_artworks_songs_artwork_id').on(table.artworkId)
  ]
);

export const artistsArtworks = sqliteTable(
  'artists_artworks',
  {
    artistId: integer('artist_id')
      .notNull()
      .references(() => artists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    artworkId: integer('artwork_id')
      .notNull()
      .references(() => artworks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.artistId, table.artworkId] }),
    index('idx_artists_artworks_artwork_id').on(table.artworkId)
  ]
);

export const albumsArtworks = sqliteTable(
  'albums_artworks',
  {
    albumId: integer('album_id')
      .notNull()
      .references(() => albums.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    artworkId: integer('artwork_id')
      .notNull()
      .references(() => artworks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.albumId, table.artworkId] }),
    index('idx_albums_artworks_artwork_id').on(table.artworkId)
  ]
);

export const artistsSongs = sqliteTable(
  'artists_songs',
  {
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    artistId: integer('artist_id')
      .notNull()
      .references(() => artists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.songId, table.artistId] }),
    index('idx_artists_songs_artist_id').on(table.artistId)
  ]
);

export const albumsSongs = sqliteTable(
  'album_songs',
  {
    albumId: integer('album_id')
      .notNull()
      .references(() => albums.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.albumId, table.songId] }),
    index('idx_album_songs_song_id').on(table.songId)
  ]
);

export const genresSongs = sqliteTable(
  'genres_songs',
  {
    genreId: integer('genre_id')
      .notNull()
      .references(() => genres.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.genreId, table.songId] }),
    index('idx_genres_songs_song_id').on(table.songId)
  ]
);

export const artworksGenres = sqliteTable(
  'artworks_genres',
  {
    genreId: integer('genre_id')
      .notNull()
      .references(() => genres.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    artworkId: integer('artwork_id')
      .notNull()
      .references(() => artworks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.genreId, table.artworkId] }),
    index('idx_artworks_genres_artwork_id').on(table.artworkId)
  ]
);

export const playlistsSongs = sqliteTable(
  'playlists_songs',
  {
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.playlistId, table.songId] }),
    index('idx_playlists_songs_song_id').on(table.songId)
  ]
);

export const artworksPlaylists = sqliteTable(
  'artworks_playlists',
  {
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    artworkId: integer('artwork_id')
      .notNull()
      .references(() => artworks.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.playlistId, table.artworkId] }),
    index('idx_artworks_playlists_artwork_id').on(table.artworkId)
  ]
);

export const albumsArtists = sqliteTable(
  'albums_artists',
  {
    albumId: integer('album_id')
      .notNull()
      .references(() => albums.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    artistId: integer('artist_id')
      .notNull()
      .references(() => artists.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.albumId, table.artistId] }),
    index('idx_albums_artists_artist_id').on(table.artistId)
  ]
);

// ============================================================================
// Relations (dialect-agnostic; ported 1:1 from the PostgreSQL schema)
// ============================================================================

export const userKeyboardShortcutsRelations = relations(userKeyboardShortcuts, () => ({}));

export const userEqualizerPresetRelations = relations(userEqualizerPreset, () => ({}));

export const ignoredArtistsRelations = relations(ignoredArtists, ({ one }) => ({
  artist: one(artists, {
    fields: [ignoredArtists.artistId],
    references: [artists.id]
  })
}));

export const ignoredFeaturingArtistsRelations = relations(ignoredFeaturingArtists, ({ one }) => ({
  artist: one(artists, {
    fields: [ignoredFeaturingArtists.artistId],
    references: [artists.id]
  })
}));

export const ignoredDuplicateMetadataRelations = relations(
  ignoredDuplicateMetadata,
  ({ one }) => ({
    song: one(songs, {
      fields: [ignoredDuplicateMetadata.songId],
      references: [songs.id]
    })
  })
);

export const albumsRelations = relations(albums, ({ many }) => ({
  songs: many(albumsSongs),
  artists: many(albumsArtists),
  artworks: many(albumsArtworks)
}));

export const artistsRelations = relations(artists, ({ many }) => ({
  songs: many(artistsSongs),
  albums: many(albumsArtists),
  artworks: many(artistsArtworks)
}));

export const musicFoldersRelations = relations(musicFolders, ({ one, many }) => ({
  children: many(musicFolders, {
    relationName: 'music_folder_children'
  }),
  parent: one(musicFolders, {
    fields: [musicFolders.parentId],
    references: [musicFolders.id],
    relationName: 'music_folder_children'
  }),
  songs: many(songs)
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  folder: one(musicFolders, {
    fields: [songs.folderId],
    references: [musicFolders.id]
  }),
  artists: many(artistsSongs),
  albums: many(albumsSongs),
  genres: many(genresSongs),
  artworks: many(artworksSongs),
  playlists: many(playlistEntries),
  playHistory: many(playHistory),
  playEvents: many(playEvents),
  seekEvents: many(seekEvents),
  skipEvents: many(skipEvents),
  waveform: one(waveforms),
  lyrics: one(lyrics),
  replayGain: one(replayGain)
}));

export const artworksRelations = relations(artworks, ({ many, one }) => ({
  songs: many(artworksSongs),
  artists: many(artistsArtworks),
  albums: many(albumsArtworks),
  genres: many(artworksGenres),
  playlists: many(artworksPlaylists),
  palette: one(palettes)
}));

export const palettesRelations = relations(palettes, ({ one, many }) => ({
  artwork: one(artworks, {
    fields: [palettes.artworkId],
    references: [artworks.id]
  }),
  swatches: many(paletteSwatches)
}));

export const paletteSwatchesRelations = relations(paletteSwatches, ({ one }) => ({
  palette: one(palettes, {
    fields: [paletteSwatches.paletteId],
    references: [palettes.id]
  })
}));

export const genresRelations = relations(genres, ({ many }) => ({
  songs: many(genresSongs),
  artworks: many(artworksGenres)
}));

export const playlistsRelations = relations(playlists, ({ many, one }) => ({
  entries: many(playlistEntries),
  artworks: many(artworksPlaylists),
  spotifyLink: one(spotifyPlaylistLinks)
}));

export const playEventsRelations = relations(playEvents, ({ one }) => ({
  song: one(songs, {
    fields: [playEvents.songId],
    references: [songs.id]
  })
}));

export const seekEventsRelations = relations(seekEvents, ({ one }) => ({
  song: one(songs, {
    fields: [seekEvents.songId],
    references: [songs.id]
  })
}));

export const skipEventsRelations = relations(skipEvents, ({ one }) => ({
  song: one(songs, {
    fields: [skipEvents.songId],
    references: [songs.id]
  })
}));

export const playHistoryRelations = relations(playHistory, ({ one }) => ({
  song: one(songs, {
    fields: [playHistory.songId],
    references: [songs.id]
  })
}));

export const scrobbleQueue = sqliteTable(
  'scrobble_queue',
  {
    id: integer('id').primaryKey(),
    songId: integer('song_id').references(() => songs.id, {
      onDelete: 'set null',
      onUpdate: 'cascade'
    }),
    startTimeSecs: integer('start_time_secs'),
    operationType: text('operation_type').notNull(),
    trackTitle: text('track_title'),
    artistNames: text('artist_names'),
    status: text('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [
    index('idx_scrobble_queue_status').on(t.status),
    index('idx_scrobble_queue_created_at').on(t.createdAt)
  ]
);

export const scrobbleQueueRelations = relations(scrobbleQueue, ({ one }) => ({
  song: one(songs, {
    fields: [scrobbleQueue.songId],
    references: [songs.id]
  })
}));

// User settings has no relations as it's a single-row configuration table

// Junction Table Relations
export const artistsSongsRelations = relations(artistsSongs, ({ one }) => ({
  artist: one(artists, {
    fields: [artistsSongs.artistId],
    references: [artists.id]
  }),
  song: one(songs, {
    fields: [artistsSongs.songId],
    references: [songs.id]
  })
}));

export const albumsSongsRelations = relations(albumsSongs, ({ one }) => ({
  album: one(albums, {
    fields: [albumsSongs.albumId],
    references: [albums.id]
  }),
  song: one(songs, {
    fields: [albumsSongs.songId],
    references: [songs.id]
  })
}));

export const albumsArtistsRelations = relations(albumsArtists, ({ one }) => ({
  album: one(albums, {
    fields: [albumsArtists.albumId],
    references: [albums.id]
  }),
  artist: one(artists, {
    fields: [albumsArtists.artistId],
    references: [artists.id]
  })
}));

export const artworksSongsRelations = relations(artworksSongs, ({ one }) => ({
  artwork: one(artworks, {
    fields: [artworksSongs.artworkId],
    references: [artworks.id]
  }),
  song: one(songs, {
    fields: [artworksSongs.songId],
    references: [songs.id]
  })
}));

export const artistsArtworksRelations = relations(artistsArtworks, ({ one }) => ({
  artist: one(artists, {
    fields: [artistsArtworks.artistId],
    references: [artists.id]
  }),
  artwork: one(artworks, {
    fields: [artistsArtworks.artworkId],
    references: [artworks.id]
  })
}));

export const albumsArtworksRelations = relations(albumsArtworks, ({ one }) => ({
  album: one(albums, {
    fields: [albumsArtworks.albumId],
    references: [albums.id]
  }),
  artwork: one(artworks, {
    fields: [albumsArtworks.artworkId],
    references: [artworks.id]
  })
}));

export const genresSongsRelations = relations(genresSongs, ({ one }) => ({
  genre: one(genres, {
    fields: [genresSongs.genreId],
    references: [genres.id]
  }),
  song: one(songs, {
    fields: [genresSongs.songId],
    references: [songs.id]
  })
}));

export const artworksGenresRelations = relations(artworksGenres, ({ one }) => ({
  artwork: one(artworks, {
    fields: [artworksGenres.artworkId],
    references: [artworks.id]
  }),
  genre: one(genres, {
    fields: [artworksGenres.genreId],
    references: [genres.id]
  })
}));

export const playlistsSongsRelations = relations(playlistsSongs, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistsSongs.playlistId],
    references: [playlists.id]
  }),
  song: one(songs, {
    fields: [playlistsSongs.songId],
    references: [songs.id]
  })
}));

export const playlistEntriesRelations = relations(playlistEntries, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistEntries.playlistId],
    references: [playlists.id]
  }),
  song: one(songs, {
    fields: [playlistEntries.songId],
    references: [songs.id]
  })
}));

export const smartPlaylistRulesRelations = relations(smartPlaylistRules, ({ one }) => ({
  playlist: one(playlists, {
    fields: [smartPlaylistRules.playlistId],
    references: [playlists.id]
  })
}));

export const artworksPlaylistsRelations = relations(artworksPlaylists, ({ one }) => ({
  artwork: one(artworks, {
    fields: [artworksPlaylists.artworkId],
    references: [artworks.id]
  }),
  playlist: one(playlists, {
    fields: [artworksPlaylists.playlistId],
    references: [playlists.id]
  })
}));

// ============================================================================
// Phase 9 - Derived Assets Tables
// ============================================================================

export const waveforms = sqliteTable(
  'waveforms',
  {
    id: integer('id').primaryKey(),
    songId: integer('song_id')
      .notNull()
      .unique()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    path: text('path').notNull(),
    resolution: integer('resolution').notNull(),
    generatorVersion: integer('generator_version').notNull().default(1),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  () => []
);

export const lyrics = sqliteTable(
  'lyrics',
  {
    id: integer('id').primaryKey(),
    songId: integer('song_id')
      .notNull()
      .unique()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    text: text('text').notNull(),
    isSynced: integer('is_synced', { mode: 'boolean' }).notNull().default(false),
    provider: text('provider').$type<LyricsProvider>().notNull(),
    generatorVersion: integer('generator_version').notNull().default(1),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  () => []
);

export const replayGain = sqliteTable(
  'replay_gain',
  {
    id: integer('id').primaryKey(),
    songId: integer('song_id')
      .notNull()
      .unique()
      .references(() => songs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    trackGain: real('track_gain'),
    trackPeak: real('track_peak'),
    albumGain: real('album_gain'),
    albumPeak: real('album_peak'),
    generatorVersion: integer('generator_version').notNull().default(1),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  () => []
);

export const waveformsRelations = relations(waveforms, ({ one }) => ({
  song: one(songs, {
    fields: [waveforms.songId],
    references: [songs.id]
  })
}));

export const lyricsRelations = relations(lyrics, ({ one }) => ({
  song: one(songs, {
    fields: [lyrics.songId],
    references: [songs.id]
  })
}));

export const replayGainRelations = relations(replayGain, ({ one }) => ({
  song: one(songs, {
    fields: [replayGain.songId],
    references: [songs.id]
  })
}));

export const operationJournal = sqliteTable(
  'operation_journal',
  {
    id: integer('id').primaryKey(),
    /** Which collection this operation targeted */
    collectionType: text('collection_type').notNull(),
    collectionId: integer('collection_id').notNull(),
    /** What operation was performed */
    operationType: text('operation_type').$type<OperationType>().notNull(),
    /** Direction: 'forward' for original, 'reverse' for undo */
    direction: text('direction').notNull().default('forward'),
    /** The forward operation input (what was requested) */
    operationInput: jsonText<Record<string, unknown>>('operation_input').notNull(),
    /** The reverse operation data (what's needed to undo) */
    inverseInput: jsonText<OperationInverseInput>('inverse_input').notNull(),
    /** Position in the journal stack (for redo ordering) */
    sequenceNumber: integer('sequence_number').notNull(),
    /** Auto-expires old entries */
    expiresAt: ts('expires_at'),
    createdAt: tsDefaultNow('created_at')
  },
  (t) => [
    index('idx_journal_collection').on(t.collectionType, t.collectionId),
    index('idx_journal_sequence').on(t.sequenceNumber),
    index('idx_journal_expires').on(t.expiresAt),
    unique('unique_journal_sequence').on(t.collectionType, t.collectionId, t.sequenceNumber)
  ]
);

export const collectionContexts = sqliteTable(
  'collection_contexts',
  {
    id: integer('id').primaryKey(),
    /** Serialized CollectionId (e.g., "local://playlist/52") */
    collectionUri: text('collection_uri').notNull().unique(),
    /** Persisted UI state */
    contextData: jsonText<CollectionContextData>('context_data').notNull(),
    createdAt: tsDefaultNow('created_at'),
    updatedAt: tsDefaultNow('updated_at')
  },
  (t) => [index('idx_collection_contexts_uri').on(t.collectionUri)]
);

// ============================================================================
// Spotify Integration Tables (Phase 1)
// ============================================================================
export const spotifyIntegrations = sqliteTable('spotify_integrations', {
  id: integer('id').primaryKey(),
  spotifyUserId: text('spotify_user_id').notNull().unique(),
  displayName: text('display_name'),
  email: text('email'),
  product: text('product'),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  tokenExpiresAt: ts('token_expires_at').notNull(),
  scopes: jsonText<string[]>('scopes').notNull().default([]),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
  updatedAt: ts('updated_at').notNull().$defaultFn(() => new Date())
});

export const spotifyPlaylistLinks = sqliteTable(
  'spotify_playlist_links',
  {
    id: integer('id').primaryKey(),
    spotifyUserId: text('spotify_user_id').notNull(),
    playlistId: integer('playlist_id')
      .notNull()
      .unique()
      .references(() => playlists.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    spotifyPlaylistId: text('spotify_playlist_id').notNull(),
    spotifyPlaylistName: text('spotify_playlist_name'),
    lastSyncedSnapshotId: text('last_synced_snapshot_id'),
    lastSyncedEntriesHash: text('last_synced_entries_hash'),
    syncStrategy: text('sync_strategy')
      .$type<'UNION_MERGE' | 'LOCAL_WINS' | 'REMOTE_WINS'>()
      .notNull()
      .default('UNION_MERGE'),
    syncState: text('sync_state')
      .$type<'SYNCED' | 'SYNCING' | 'PARTIAL_FAILURE' | 'CONFLICT' | 'ERROR'>()
      .notNull()
      .default('SYNCED'),
    failureStage: text('failure_stage').$type<
      'REMOTE' | 'REMOTE_VERIFICATION' | 'LOCAL' | 'LOCAL_VERIFICATION' | 'FINALIZATION'
    >(),
    completedRemoteBatches: integer('completed_remote_batches').default(0),
    failedBatchIndex: integer('failed_batch_index'),
    lastError: text('last_error'),
    lastSyncedAt: ts('last_synced_at'),
    createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
    updatedAt: ts('updated_at').notNull().$defaultFn(() => new Date())
  },
  (t) => [
    index('idx_spotify_playlist_links_user_id').on(t.spotifyUserId),
    index('idx_spotify_playlist_links_spotify_playlist_id').on(t.spotifyPlaylistId)
  ]
);

export const spotifyPlaylistLinksRelations = relations(spotifyPlaylistLinks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [spotifyPlaylistLinks.playlistId],
    references: [playlists.id]
  })
}));
