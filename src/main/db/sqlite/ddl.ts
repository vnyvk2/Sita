import { NORM_STRIP_CHARS } from './norm';

/**
 * Baseline SQLite DDL for Nora (42 tables + FTS5 + triggers).
 *
 * Executed once at first open, stamped with `PRAGMA user_version = 1`. Must stay column-for-column
 * consistent with src/main/db/schema.ts — enforced by
 * test/src/main/db/sqlite/schema-ddl-consistency.test.ts.
 */

/** SQL expression mirroring the drizzle schema's normExpr(): lower() + strip punctuation/space. */
export const normSqlExpr = (col: string): string => {
  let expr = `lower(${col})`;
  for (const ch of NORM_STRIP_CHARS) {
    const lit = ch === `'` ? `''''` : `'${ch}'`;
    expr = `replace(${expr}, ${lit}, '')`;
  }
  return expr;
};

const NOW_MS = `cast((julianday('now') - 2440587.5)*86400000 as INTEGER)`;

const junction = (
  name: string,
  colA: string,
  refA: string,
  colB: string,
  refB: string,
  pkCols: [string, string]
) => `
CREATE TABLE IF NOT EXISTS ${name} (
  ${colA} INTEGER NOT NULL REFERENCES ${refA}(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ${colB} INTEGER NOT NULL REFERENCES ${refB}(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  PRIMARY KEY (${pkCols[0]}, ${pkCols[1]})
);
CREATE INDEX IF NOT EXISTS idx_${name}_${colB} ON ${name} (${colB});
`;

export const BASELINE_TABLE_DDL = `
-- ============================== core ==============================
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_ci TEXT COLLATE NOCASE GENERATED ALWAYS AS (lower(name)) STORED,
  name_norm TEXT GENERATED ALWAYS AS (${normSqlExpr('name')}) STORED,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name);
CREATE INDEX IF NOT EXISTS idx_artists_name_ci ON artists (name_ci);
CREATE INDEX IF NOT EXISTS idx_artists_is_favorite ON artists (is_favorite);

CREATE TABLE IF NOT EXISTS music_folders (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_blacklisted INTEGER NOT NULL DEFAULT 0 CHECK (is_blacklisted IN (0,1)),
  parent_id INTEGER REFERENCES music_folders(id) ON DELETE SET NULL ON UPDATE CASCADE,
  is_blacklisted_updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  folder_created_at INTEGER,
  last_modified_at INTEGER,
  last_changed_at INTEGER,
  last_parsed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_parent_id ON music_folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_music_folders_is_blacklisted ON music_folders (is_blacklisted);
CREATE INDEX IF NOT EXISTS idx_music_folders_parent_path ON music_folders (parent_id, path);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_ci TEXT COLLATE NOCASE GENERATED ALWAYS AS (lower(title)) STORED,
  title_norm TEXT GENERATED ALWAYS AS (${normSqlExpr('title')}) STORED,
  duration REAL NOT NULL,
  skip_count INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL UNIQUE,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  sample_rate INTEGER,
  bit_rate INTEGER,
  no_of_channels INTEGER,
  year INTEGER,
  disk_number INTEGER,
  track_number INTEGER,
  folder_id INTEGER REFERENCES music_folders(id) ON DELETE SET NULL ON UPDATE CASCADE,
  is_blacklisted INTEGER NOT NULL DEFAULT 0 CHECK (is_blacklisted IN (0,1)),
  is_blacklisted_updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  is_favorite_updated_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  file_created_at INTEGER NOT NULL,
  file_modified_at INTEGER NOT NULL,
  music_brainz_recording_id TEXT,
  isrc TEXT,
  language TEXT,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs (title);
CREATE INDEX IF NOT EXISTS idx_songs_title_ci ON songs (title_ci);
CREATE INDEX IF NOT EXISTS idx_songs_year ON songs (year);
CREATE INDEX IF NOT EXISTS idx_songs_track_number ON songs (track_number);
CREATE INDEX IF NOT EXISTS idx_songs_music_brainz_recording_id ON songs (music_brainz_recording_id);
CREATE INDEX IF NOT EXISTS idx_songs_isrc ON songs (isrc);
CREATE INDEX IF NOT EXISTS idx_songs_language ON songs (language);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_file_modified_at ON songs (file_modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_folder_id ON songs (folder_id);
CREATE INDEX IF NOT EXISTS idx_songs_is_favorite ON songs (is_favorite);
CREATE INDEX IF NOT EXISTS idx_songs_is_blacklisted ON songs (is_blacklisted);
CREATE INDEX IF NOT EXISTS idx_songs_skip_count_title ON songs (skip_count DESC, title);
CREATE INDEX IF NOT EXISTS idx_songs_year_title ON songs (year, title);
CREATE INDEX IF NOT EXISTS idx_songs_track_title ON songs (track_number, title);
CREATE INDEX IF NOT EXISTS idx_songs_created_title ON songs (created_at DESC, title);
CREATE INDEX IF NOT EXISTS idx_songs_modified_title ON songs (file_modified_at DESC, title);
CREATE INDEX IF NOT EXISTS idx_songs_favorite_title ON songs (is_favorite, title);
CREATE INDEX IF NOT EXISTS idx_songs_folder_title ON songs (folder_id, title);

CREATE TABLE IF NOT EXISTS artworks (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'LOCAL' CHECK (source IN ('LOCAL','REMOTE')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  is_optimized INTEGER NOT NULL DEFAULT 0 CHECK (is_optimized IN (0,1)),
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_artworks_path ON artworks (path);
CREATE INDEX IF NOT EXISTS idx_artworks_source ON artworks (source);
CREATE INDEX IF NOT EXISTS idx_artworks_dimensions ON artworks (width, height);
CREATE INDEX IF NOT EXISTS idx_artworks_source_dimensions ON artworks (source, width, height);

CREATE TABLE IF NOT EXISTS palettes (
  id INTEGER PRIMARY KEY,
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_palettes_artwork_id ON palettes (artwork_id);

CREATE TABLE IF NOT EXISTS palette_swatches (
  id INTEGER PRIMARY KEY,
  population INTEGER NOT NULL,
  hex TEXT NOT NULL,
  hsl TEXT NOT NULL,
  swatch_type TEXT NOT NULL DEFAULT 'VIBRANT' CHECK (swatch_type IN ('VIBRANT','LIGHT_VIBRANT','DARK_VIBRANT','MUTED','LIGHT_MUTED','DARK_MUTED')),
  palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_palette_swatches_palette_id ON palette_swatches (palette_id);
CREATE INDEX IF NOT EXISTS idx_palette_swatches_type ON palette_swatches (swatch_type);
CREATE INDEX IF NOT EXISTS idx_palette_swatches_palette_type ON palette_swatches (palette_id, swatch_type);
CREATE INDEX IF NOT EXISTS idx_palette_swatches_hex ON palette_swatches (hex);

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_ci TEXT COLLATE NOCASE GENERATED ALWAYS AS (lower(title)) STORED,
  title_norm TEXT GENERATED ALWAYS AS (${normSqlExpr('title')}) STORED,
  year INTEGER,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums (title);
CREATE INDEX IF NOT EXISTS idx_albums_title_ci ON albums (title_ci);
CREATE INDEX IF NOT EXISTS idx_albums_year ON albums (year DESC);
CREATE INDEX IF NOT EXISTS idx_albums_year_title ON albums (year DESC, title);
CREATE INDEX IF NOT EXISTS idx_albums_is_favorite ON albums (is_favorite);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_ci TEXT COLLATE NOCASE GENERATED ALWAYS AS (lower(name)) STORED,
  name_norm TEXT GENERATED ALWAYS AS (${normSqlExpr('name')}) STORED,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres (name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_genres_name_ci ON genres (name_ci);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_ci TEXT COLLATE NOCASE GENERATED ALWAYS AS (lower(name)) STORED,
  name_norm TEXT GENERATED ALWAYS AS (${normSqlExpr('name')}) STORED,
  description TEXT,
  parent_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL ON UPDATE CASCADE,
  playlist_type TEXT NOT NULL DEFAULT 'standard',
  item_count INTEGER NOT NULL DEFAULT 0,
  total_duration REAL NOT NULL DEFAULT 0,
  sidebar_position INTEGER,
  pinned_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists (name);
CREATE INDEX IF NOT EXISTS idx_playlists_name_ci ON playlists (name_ci);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_parent_id ON playlists (parent_id);
CREATE INDEX IF NOT EXISTS idx_playlists_type ON playlists (playlist_type);
CREATE INDEX IF NOT EXISTS idx_playlists_sidebar ON playlists (sidebar_position);
CREATE INDEX IF NOT EXISTS idx_playlists_pinned ON playlists (pinned_at DESC);

CREATE TABLE IF NOT EXISTS playlist_entries (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  source TEXT DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist_id ON playlist_entries (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_song_id ON playlist_entries (song_id);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist_position ON playlist_entries (playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_added_at ON playlist_entries (added_at DESC);

CREATE TABLE IF NOT EXISTS smart_playlist_rules (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL UNIQUE REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  rule_ast TEXT NOT NULL,
  rule_version INTEGER NOT NULL DEFAULT 1,
  max_entries INTEGER,
  sort_definition TEXT,
  dependencies TEXT,
  last_generated_at INTEGER,
  rule_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS play_events (
  id INTEGER PRIMARY KEY,
  playback_percentage REAL NOT NULL,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_play_events_song_id ON play_events (song_id);
CREATE INDEX IF NOT EXISTS idx_play_events_created_at ON play_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_events_song_created ON play_events (song_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_events_percentage ON play_events (playback_percentage);

CREATE TABLE IF NOT EXISTS seek_events (
  id INTEGER PRIMARY KEY,
  position REAL NOT NULL,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_seek_events_song_id ON seek_events (song_id);
CREATE INDEX IF NOT EXISTS idx_seek_events_created_at ON seek_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seek_events_song_created ON seek_events (song_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skip_events (
  id INTEGER PRIMARY KEY,
  position REAL NOT NULL,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_skip_events_song_id ON skip_events (song_id);
CREATE INDEX IF NOT EXISTS idx_skip_events_created_at ON skip_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skip_events_song_created ON skip_events (song_id, created_at DESC);

CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_play_history_song_id ON play_history (song_id);
CREATE INDEX IF NOT EXISTS idx_play_history_created_at ON play_history (created_at DESC);

CREATE TABLE IF NOT EXISTS metadata_overrides (
  id INTEGER PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  string_value TEXT,
  number_value REAL,
  boolean_value INTEGER CHECK (boolean_value IN (0,1)),
  json_value TEXT,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_overrides_lookup ON metadata_overrides (entity_kind, entity_id, field_id);
CREATE INDEX IF NOT EXISTS idx_metadata_overrides_entity ON metadata_overrides (entity_kind, entity_id);

CREATE TABLE IF NOT EXISTS metadata_undo_snapshots (
  id TEXT PRIMARY KEY,
  seq INTEGER,
  description TEXT NOT NULL DEFAULT '',
  album_title TEXT,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS metadata_undo_snapshots_seq_idx ON metadata_undo_snapshots (seq);
-- seq is a per-table monotonic counter (PG identity equivalent; SQLite allows one rowid alias
-- per table and the PK here is varchar id). Trigger skips rows that supply an explicit seq
-- (the PGlite->SQLite migration preserves original seq values).
CREATE TRIGGER IF NOT EXISTS metadata_undo_snapshots_seq_ai
AFTER INSERT ON metadata_undo_snapshots
WHEN new.seq IS NULL
BEGIN
  UPDATE metadata_undo_snapshots
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM metadata_undo_snapshots)
  WHERE rowid = new.rowid;
END;

CREATE TABLE IF NOT EXISTS metadata_pending_writes (
  id TEXT PRIMARY KEY,
  song_path TEXT NOT NULL UNIQUE,
  tags TEXT NOT NULL,
  is_known_source INTEGER NOT NULL DEFAULT 1 CHECK (is_known_source IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS metadata_pending_writes_song_path_idx ON metadata_pending_writes (song_path);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'en',
  is_dark_mode INTEGER NOT NULL DEFAULT 1 CHECK (is_dark_mode IN (0,1)),
  use_system_theme INTEGER NOT NULL DEFAULT 1 CHECK (use_system_theme IN (0,1)),
  auto_launch_app INTEGER NOT NULL DEFAULT 0 CHECK (auto_launch_app IN (0,1)),
  open_window_maximized_on_start INTEGER NOT NULL DEFAULT 0 CHECK (open_window_maximized_on_start IN (0,1)),
  open_window_as_hidden_on_system_start INTEGER NOT NULL DEFAULT 0 CHECK (open_window_as_hidden_on_system_start IN (0,1)),
  is_mini_player_always_on_top INTEGER NOT NULL DEFAULT 0 CHECK (is_mini_player_always_on_top IN (0,1)),
  is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_mini_player_taskbar_hidden IN (0,1)),
  is_musixmatch_lyrics_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_musixmatch_lyrics_enabled IN (0,1)),
  hide_window_on_close INTEGER NOT NULL DEFAULT 0 CHECK (hide_window_on_close IN (0,1)),
  tray_single_click_toggles_window INTEGER NOT NULL DEFAULT 0 CHECK (tray_single_click_toggles_window IN (0,1)),
  send_song_scrobbling_data_to_lastfm INTEGER NOT NULL DEFAULT 0 CHECK (send_song_scrobbling_data_to_lastfm IN (0,1)),
  send_song_favorites_data_to_lastfm INTEGER NOT NULL DEFAULT 0 CHECK (send_song_favorites_data_to_lastfm IN (0,1)),
  send_now_playing_song_data_to_lastfm INTEGER NOT NULL DEFAULT 0 CHECK (send_now_playing_song_data_to_lastfm IN (0,1)),
  send_song_scrobbling_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0 CHECK (send_song_scrobbling_data_to_listenbrainz IN (0,1)),
  send_song_favorites_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0 CHECK (send_song_favorites_data_to_listenbrainz IN (0,1)),
  send_now_playing_song_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0 CHECK (send_now_playing_song_data_to_listenbrainz IN (0,1)),
  save_lyrics_in_lrc_files_for_supported_songs INTEGER NOT NULL DEFAULT 1 CHECK (save_lyrics_in_lrc_files_for_supported_songs IN (0,1)),
  enable_discord_rpc INTEGER NOT NULL DEFAULT 1 CHECK (enable_discord_rpc IN (0,1)),
  save_verbose_logs INTEGER NOT NULL DEFAULT 0 CHECK (save_verbose_logs IN (0,1)),
  main_window_x INTEGER,
  main_window_y INTEGER,
  mini_player_x INTEGER,
  mini_player_y INTEGER,
  main_window_width INTEGER,
  main_window_height INTEGER,
  mini_player_width INTEGER,
  mini_player_height INTEGER,
  zoom_factor REAL NOT NULL DEFAULT 0.8,
  window_state TEXT NOT NULL DEFAULT 'normal',
  recent_searches TEXT NOT NULL DEFAULT '[]',
  mini_player_pinned_controls TEXT NOT NULL DEFAULT '["love","lyrics","volume"]',
  mini_player_mode TEXT NOT NULL DEFAULT 'standard',
  custom_lrc_files_save_location TEXT,
  online_downloads_folder TEXT,
  downloads_duplicate_policy TEXT NOT NULL DEFAULT 'SKIP',
  add_downloads_to_library INTEGER NOT NULL DEFAULT 1 CHECK (add_downloads_to_library IN (0,1)),
  lastfm_session_name TEXT,
  lastfm_session_key TEXT,
  listenbrainz_username TEXT,
  listenbrainz_user_token TEXT,
  library_scan_mode TEXT NOT NULL DEFAULT 'automatic',
  last_scan_time INTEGER,
  metadata_preferences TEXT,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_user_settings_language ON user_settings (language);
CREATE INDEX IF NOT EXISTS idx_user_settings_window_state ON user_settings (window_state);

CREATE TABLE IF NOT EXISTS user_keyboard_shortcuts (
  id INTEGER PRIMARY KEY,
  shortcuts TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS user_equalizer_preset (
  id INTEGER PRIMARY KEY,
  preset_name TEXT NOT NULL DEFAULT 'Default',
  frequency_bands TEXT NOT NULL DEFAULT '[]',
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_user_equalizer_preset_created_at ON user_equalizer_preset (created_at DESC);

CREATE TABLE IF NOT EXISTS ignored_artists (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL UNIQUE REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS ignored_featuring_artists (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL UNIQUE REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS ignored_duplicate_metadata (
  id INTEGER PRIMARY KEY,
  duplicate_group_id TEXT NOT NULL,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_ignored_duplicate_metadata_group ON ignored_duplicate_metadata (duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_ignored_duplicate_metadata_song ON ignored_duplicate_metadata (song_id);

${junction('artworks_songs', 'song_id', 'songs', 'artwork_id', 'artworks', ['song_id', 'artwork_id'])}
${junction('artists_artworks', 'artist_id', 'artists', 'artwork_id', 'artworks', ['artist_id', 'artwork_id'])}
${junction('albums_artworks', 'album_id', 'albums', 'artwork_id', 'artworks', ['album_id', 'artwork_id'])}
${junction('artists_songs', 'song_id', 'songs', 'artist_id', 'artists', ['song_id', 'artist_id'])}
${junction('album_songs', 'album_id', 'albums', 'song_id', 'songs', ['album_id', 'song_id'])}
${junction('genres_songs', 'genre_id', 'genres', 'song_id', 'songs', ['genre_id', 'song_id'])}
${junction('artworks_genres', 'genre_id', 'genres', 'artwork_id', 'artworks', ['genre_id', 'artwork_id'])}
${junction('playlists_songs', 'playlist_id', 'playlists', 'song_id', 'songs', ['playlist_id', 'song_id'])}
${junction('artworks_playlists', 'playlist_id', 'playlists', 'artwork_id', 'artworks', ['playlist_id', 'artwork_id'])}
${junction('albums_artists', 'album_id', 'albums', 'artist_id', 'artists', ['album_id', 'artist_id'])}

CREATE TABLE IF NOT EXISTS scrobble_queue (
  id INTEGER PRIMARY KEY,
  song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL ON UPDATE CASCADE,
  start_time_secs INTEGER,
  operation_type TEXT NOT NULL,
  track_title TEXT,
  artist_names TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_scrobble_queue_status ON scrobble_queue (status);
CREATE INDEX IF NOT EXISTS idx_scrobble_queue_created_at ON scrobble_queue (created_at);

CREATE TABLE IF NOT EXISTS waveforms (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  path TEXT NOT NULL,
  resolution INTEGER NOT NULL,
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS lyrics (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  text TEXT NOT NULL,
  is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0,1)),
  provider TEXT NOT NULL CHECK (provider IN ('MUSIXMATCH','LRCLIB','EMBEDDED','FILESYSTEM')),
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS replay_gain (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  track_gain REAL,
  track_peak REAL,
  album_gain REAL,
  album_peak REAL,
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS operation_journal (
  id INTEGER PRIMARY KEY,
  collection_type TEXT NOT NULL,
  collection_id INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'forward',
  operation_input TEXT NOT NULL,
  inverse_input TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  CONSTRAINT unique_journal_sequence UNIQUE (collection_type, collection_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_journal_collection ON operation_journal (collection_type, collection_id);
CREATE INDEX IF NOT EXISTS idx_journal_sequence ON operation_journal (sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_journal_expires ON operation_journal (expires_at);

CREATE TABLE IF NOT EXISTS collection_contexts (
  id INTEGER PRIMARY KEY,
  collection_uri TEXT NOT NULL UNIQUE,
  context_data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_collection_contexts_uri ON collection_contexts (collection_uri);

CREATE TABLE IF NOT EXISTS spotify_integrations (
  id INTEGER PRIMARY KEY,
  spotify_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  product TEXT,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);

CREATE TABLE IF NOT EXISTS spotify_playlist_links (
  id INTEGER PRIMARY KEY,
  spotify_user_id TEXT NOT NULL,
  playlist_id INTEGER NOT NULL UNIQUE REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  spotify_playlist_id TEXT NOT NULL,
  spotify_playlist_name TEXT,
  last_synced_snapshot_id TEXT,
  last_synced_entries_hash TEXT,
  sync_strategy TEXT NOT NULL DEFAULT 'UNION_MERGE',
  sync_state TEXT NOT NULL DEFAULT 'SYNCED',
  failure_stage TEXT,
  completed_remote_batches INTEGER DEFAULT 0,
  failed_batch_index INTEGER,
  last_error TEXT,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (${NOW_MS}),
  updated_at INTEGER NOT NULL DEFAULT (${NOW_MS})
);
CREATE INDEX IF NOT EXISTS idx_spotify_playlist_links_user_id ON spotify_playlist_links (spotify_user_id);
CREATE INDEX IF NOT EXISTS idx_spotify_playlist_links_spotify_playlist_id ON spotify_playlist_links (spotify_playlist_id);
`;

// ---------------------------------------------------------------------------
// FTS5 trigram search (replacement for pg_trgm GIN indexes).
// External-content-free contentless tables, kept in sync by triggers.
// Indexed columns: the *_ci (case-folded) and *_norm (case+space+punct-stripped) generated cols.
// ---------------------------------------------------------------------------
const searchable = [
  { table: 'songs', pk: 'id', ci: 'title_ci', norm: 'title_norm', watch: 'title' },
  { table: 'albums', pk: 'id', ci: 'title_ci', norm: 'title_norm', watch: 'title' },
  { table: 'artists', pk: 'id', ci: 'name_ci', norm: 'name_norm', watch: 'name' },
  { table: 'genres', pk: 'id', ci: 'name_ci', norm: 'name_norm', watch: 'name' },
  { table: 'playlists', pk: 'id', ci: 'name_ci', norm: 'name_norm', watch: 'name' }
] as const;

const ftsDDL = searchable
  .map((s) => {
    return `
CREATE VIRTUAL TABLE IF NOT EXISTS fts_${s.table} USING fts5(${s.ci}, content='', contentless_delete=1, tokenize='trigram');
CREATE VIRTUAL TABLE IF NOT EXISTS fts_${s.table}_norm USING fts5(${s.norm}, content='', contentless_delete=1, tokenize='trigram');
CREATE TRIGGER IF NOT EXISTS fts_${s.table}_ai AFTER INSERT ON ${s.table} BEGIN
  INSERT INTO fts_${s.table}(rowid, ${s.ci}) VALUES (new.${s.pk}, new.${s.ci});
  INSERT INTO fts_${s.table}_norm(rowid, ${s.norm}) VALUES (new.${s.pk}, new.${s.norm});
END;
CREATE TRIGGER IF NOT EXISTS fts_${s.table}_au AFTER UPDATE OF ${s.watch} ON ${s.table} BEGIN
  DELETE FROM fts_${s.table} WHERE rowid = old.${s.pk};
  INSERT INTO fts_${s.table}(rowid, ${s.ci}) VALUES (new.${s.pk}, new.${s.ci});
  DELETE FROM fts_${s.table}_norm WHERE rowid = old.${s.pk};
  INSERT INTO fts_${s.table}_norm(rowid, ${s.norm}) VALUES (new.${s.pk}, new.${s.norm});
END;
CREATE TRIGGER IF NOT EXISTS fts_${s.table}_ad AFTER DELETE ON ${s.table} BEGIN
  DELETE FROM fts_${s.table} WHERE rowid = old.${s.pk};
  DELETE FROM fts_${s.table}_norm WHERE rowid = old.${s.pk};
END;`;
  })
  .join('\n');

export const BASELINE_DDL = BASELINE_TABLE_DDL + '\n' + ftsDDL;
export const SCHEMA_VERSION = 3;
void searchable;
