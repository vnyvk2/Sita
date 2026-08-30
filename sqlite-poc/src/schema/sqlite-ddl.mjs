// SQLite mirror of Nora's core database surface (schema.ts subset).
//
// Type-mapping rules (documented deviations from PostgreSQL):
//   identity PK            -> INTEGER PRIMARY KEY (rowid alias; monotonic 1..n)
//   citext generated col   -> TEXT GENERATED ALWAYS AS (lower(x)) STORED
//                             (PG lower() is locale-aware for Unicode; SQLite lower() is
//                              ASCII-only unless ICU — this is a semantic deviation, see
//                              search-comparison.md for the non-ASCII test)
//   varchar(n)             -> TEXT (length not enforced; PG enforces)
//   numeric(10,3)/decimal  -> REAL (PG numeric is exact; float64 adequate for durations)
//   timestamp (no tz)      -> TEXT ISO-8601 UTC 'YYYY-MM-DDTHH:MM:SS.sssZ' (fixed width,
//                             so lexicographic ordering == chronological)
//   boolean                -> INTEGER 0/1 with CHECK
//   pgEnum                 -> TEXT + CHECK
//   json/jsonb             -> TEXT (JSON1 available)
//   GIN gin_trgm_ops       -> FTS5 external-content trigram tables (see fts ddl) +
//                             plain btree on the _ci column for prefix/exact
//   ON CONFLICT on citext  -> upsert against unique index on the generated lower() col
//
// Index set mirrors src/main/db/schema.ts for the mirrored tables.

export const SQLITE_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_ci TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
  is_blacklisted_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  folder_created_at TEXT,
  last_modified_at TEXT,
  last_changed_at TEXT,
  last_parsed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_parent_id ON music_folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_music_folders_path ON music_folders (path);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_ci TEXT GENERATED ALWAYS AS (lower(title)) STORED,
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
  is_blacklisted_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  is_favorite_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  file_created_at TEXT NOT NULL,
  file_modified_at TEXT NOT NULL,
  music_brainz_recording_id TEXT,
  isrc TEXT,
  language TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_ci TEXT GENERATED ALWAYS AS (lower(title)) STORED,
  year INTEGER,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums (title);
CREATE INDEX IF NOT EXISTS idx_albums_title_ci ON albums (title_ci);
CREATE INDEX IF NOT EXISTS idx_albums_year ON albums (year DESC);
CREATE INDEX IF NOT EXISTS idx_albums_year_title ON albums (year DESC, title);
CREATE INDEX IF NOT EXISTS idx_albums_is_favorite ON albums (is_favorite);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_ci TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres (name);
-- mirrors PG UNIQUE INDEX idx_genres_name_ci on citext
CREATE UNIQUE INDEX IF NOT EXISTS idx_genres_name_ci ON genres (name_ci);

CREATE TABLE IF NOT EXISTS artworks (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'LOCAL' CHECK (source IN ('LOCAL','REMOTE')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  is_optimized INTEGER NOT NULL DEFAULT 0 CHECK (is_optimized IN (0,1)),
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_artworks_path ON artworks (path);
CREATE INDEX IF NOT EXISTS idx_artworks_source ON artworks (source);
CREATE INDEX IF NOT EXISTS idx_artworks_dimensions ON artworks (width, height);
CREATE INDEX IF NOT EXISTS idx_artworks_source_dimensions ON artworks (source, width, height);

-- junction tables (composite PKs as in Nora; ON DELETE CASCADE via FK)
CREATE TABLE IF NOT EXISTS artists_songs (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artist_id, song_id)
);
CREATE TABLE IF NOT EXISTS album_songs (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (album_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_album_songs_song ON album_songs (song_id);
CREATE TABLE IF NOT EXISTS genres_songs (
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (genre_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_genres_songs_song ON genres_songs (song_id);
CREATE TABLE IF NOT EXISTS albums_artists (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE ON UPDATE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (album_id, artist_id)
);
CREATE TABLE IF NOT EXISTS artworks_songs (
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artwork_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_artworks_songs_song ON artworks_songs (song_id);
CREATE TABLE IF NOT EXISTS albums_artworks (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE ON UPDATE CASCADE,
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (album_id, artwork_id)
);
CREATE TABLE IF NOT EXISTS artists_artworks (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artist_id, artwork_id)
);
CREATE TABLE IF NOT EXISTS artworks_genres (
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artwork_id, genre_id)
);
CREATE TABLE IF NOT EXISTS artworks_playlists (
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artwork_id, playlist_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_ci TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  description TEXT,
  parent_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL ON UPDATE CASCADE,
  playlist_type TEXT NOT NULL DEFAULT 'standard',
  item_count INTEGER NOT NULL DEFAULT 0,
  total_duration REAL NOT NULL DEFAULT 0,
  sidebar_position INTEGER,
  pinned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists (name);
CREATE INDEX IF NOT EXISTS idx_playlists_name_ci ON playlists (name_ci);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists (created_at DESC);

CREATE TABLE IF NOT EXISTS playlist_entries (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist ON playlist_entries (playlist_id, position);

CREATE TABLE IF NOT EXISTS smart_playlist_rules (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL UNIQUE REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  rule_ast TEXT NOT NULL,
  sort_definition TEXT,
  dependencies TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS play_events (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  played_at TEXT NOT NULL,
  playback_percentage REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_play_events_song ON play_events (song_id);
CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events (played_at DESC);

CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  played_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_play_history_song ON play_history (song_id);

CREATE TABLE IF NOT EXISTS skip_events (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  position REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_skip_events_song ON skip_events (song_id);

CREATE TABLE IF NOT EXISTS metadata_overrides (
  id INTEGER PRIMARY KEY,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  value TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_overrides_entity ON metadata_overrides (entity_kind, entity_id, field_id);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY,
  language TEXT,
  zoom_factor REAL,
  recent_searches TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS waveforms (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  peaks TEXT NOT NULL,
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS lyrics (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  content TEXT,
  provider TEXT NOT NULL DEFAULT 'EMBEDDED' CHECK (provider IN ('MUSIXMATCH','LRCLIB','EMBEDDED','FILESYSTEM')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS replay_gain (
  id INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  gain REAL,
  peak REAL,
  generator_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

// ---------------------------------------------------------------------------
// FTS5 trigram mirror of the five GIN gin_trgm_ops indexes.
// External-content tables (content='') store no text — index-only storage.
// Kept in sync with triggers, which adds a real write cost that Phase 8 measures.
// ---------------------------------------------------------------------------
export const SQLITE_FTS_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS fts_songs USING fts5(
  title_ci, content='', contentless_delete=1, tokenize='trigram'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_artists USING fts5(
  name_ci, content='', contentless_delete=1, tokenize='trigram'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_albums USING fts5(
  title_ci, content='', contentless_delete=1, tokenize='trigram'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_genres USING fts5(
  name_ci, content='', contentless_delete=1, tokenize='trigram'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_playlists USING fts5(
  name_ci, content='', contentless_delete=1, tokenize='trigram'
);
`;

export const SQLITE_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS fts_songs_ai AFTER INSERT ON songs BEGIN
  INSERT INTO fts_songs(rowid, title_ci) VALUES (new.id, new.title_ci);
END;
CREATE TRIGGER IF NOT EXISTS fts_songs_au AFTER UPDATE OF title ON songs BEGIN
  DELETE FROM fts_songs WHERE rowid = old.id;
  INSERT INTO fts_songs(rowid, title_ci) VALUES (new.id, new.title_ci);
END;
CREATE TRIGGER IF NOT EXISTS fts_songs_ad AFTER DELETE ON songs BEGIN
  DELETE FROM fts_songs WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS fts_artists_ai AFTER INSERT ON artists BEGIN
  INSERT INTO fts_artists(rowid, name_ci) VALUES (new.id, new.name_ci);
END;
CREATE TRIGGER IF NOT EXISTS fts_artists_au AFTER UPDATE OF name ON artists BEGIN
  DELETE FROM fts_artists WHERE rowid = old.id;
  INSERT INTO fts_artists(rowid, name_ci) VALUES (new.id, new.name_ci);
END;
CREATE TRIGGER IF NOT EXISTS fts_artists_ad AFTER DELETE ON artists BEGIN
  DELETE FROM fts_artists WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS fts_albums_ai AFTER INSERT ON albums BEGIN
  INSERT INTO fts_albums(rowid, title_ci) VALUES (new.id, new.title_ci);
END;
CREATE TRIGGER IF NOT EXISTS fts_albums_au AFTER UPDATE OF title ON albums BEGIN
  DELETE FROM fts_albums WHERE rowid = old.id;
  INSERT INTO fts_albums(rowid, title_ci) VALUES (new.id, new.title_ci);
END;
CREATE TRIGGER IF NOT EXISTS fts_albums_ad AFTER DELETE ON albums BEGIN
  DELETE FROM fts_albums WHERE rowid = old.id;
END;
`;

/** PRAGMAs Nora would set on open (WAL + durability posture). */
export const SQLITE_PRAGMAS = [
  "PRAGMA journal_mode = WAL;",
  "PRAGMA synchronous = NORMAL;",
  "PRAGMA busy_timeout = 5000;",
  "PRAGMA foreign_keys = ON;",
  "PRAGMA temp_store = MEMORY;",
  "PRAGMA cache_size = -16000;" // 16 MB page cache
];
