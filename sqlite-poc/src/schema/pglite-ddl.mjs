// PostgreSQL mirror (run on PGlite) of the same core entity set as sqlite-ddl.mjs.
// Mirrors Nora's real PG types: citext generated columns, gin_trgm_ops GIN indexes,
// identity PKs, numeric, timestamps without tz. Used so both engines benchmark the
// SAME logical schema and workload.

export const PGLITE_DDL = `
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS artists (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(1024) NOT NULL,
  name_ci citext GENERATED ALWAYS AS (name::citext) STORED,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name ASC);
CREATE INDEX IF NOT EXISTS idx_artists_name_ci ON artists (name_ci ASC);
CREATE INDEX IF NOT EXISTS idx_artists_name_ci_trgm ON artists USING gin (name_ci gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_artists_is_favorite ON artists (is_favorite);

CREATE TABLE IF NOT EXISTS music_folders (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  path text NOT NULL UNIQUE,
  name varchar(512) NOT NULL,
  is_blacklisted boolean NOT NULL DEFAULT false,
  parent_id integer REFERENCES music_folders(id) ON DELETE SET NULL ON UPDATE CASCADE,
  is_blacklisted_updated_at timestamp NOT NULL DEFAULT now(),
  folder_created_at timestamp,
  last_modified_at timestamp,
  last_changed_at timestamp,
  last_parsed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parent_id ON music_folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_music_folders_path ON music_folders (path);

CREATE TABLE IF NOT EXISTS songs (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title varchar(4096) NOT NULL,
  title_ci citext GENERATED ALWAYS AS (title::citext) STORED,
  duration numeric(10,3) NOT NULL,
  skip_count integer NOT NULL DEFAULT 0,
  path text NOT NULL UNIQUE,
  is_favorite boolean NOT NULL DEFAULT false,
  sample_rate integer,
  bit_rate integer,
  no_of_channels integer,
  year integer,
  disk_number integer,
  track_number integer,
  folder_id integer REFERENCES music_folders(id) ON DELETE SET NULL ON UPDATE CASCADE,
  is_blacklisted boolean NOT NULL DEFAULT false,
  is_blacklisted_updated_at timestamp NOT NULL DEFAULT now(),
  is_favorite_updated_at timestamp NOT NULL DEFAULT now(),
  file_created_at timestamp NOT NULL,
  file_modified_at timestamp NOT NULL,
  music_brainz_recording_id text,
  isrc text,
  language varchar(64),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs (title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_title_ci ON songs (title_ci ASC);
CREATE INDEX IF NOT EXISTS idx_songs_title_ci_trgm ON songs USING gin (title_ci gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_songs_year ON songs (year ASC);
CREATE INDEX IF NOT EXISTS idx_songs_track_number ON songs (track_number ASC);
CREATE INDEX IF NOT EXISTS idx_songs_music_brainz_recording_id ON songs (music_brainz_recording_id);
CREATE INDEX IF NOT EXISTS idx_songs_isrc ON songs (isrc);
CREATE INDEX IF NOT EXISTS idx_songs_language ON songs (language ASC);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_file_modified_at ON songs (file_modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_folder_id ON songs (folder_id);
CREATE INDEX IF NOT EXISTS idx_songs_is_favorite ON songs (is_favorite);
CREATE INDEX IF NOT EXISTS idx_songs_is_blacklisted ON songs (is_blacklisted);
CREATE INDEX IF NOT EXISTS idx_songs_skip_count_title ON songs (skip_count DESC, title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_year_title ON songs (year ASC, title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_track_title ON songs (track_number ASC, title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_created_title ON songs (created_at DESC, title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_modified_title ON songs (file_modified_at DESC, title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_favorite_title ON songs (is_favorite, title ASC);
CREATE INDEX IF NOT EXISTS idx_songs_folder_title ON songs (folder_id, title ASC);

CREATE TABLE IF NOT EXISTS albums (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title varchar(255) NOT NULL,
  title_ci citext GENERATED ALWAYS AS (title::citext) STORED,
  year integer,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums (title ASC);
CREATE INDEX IF NOT EXISTS idx_albums_title_ci ON albums (title_ci ASC);
CREATE INDEX IF NOT EXISTS idx_albums_title_ci_trgm ON albums USING gin (title_ci gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_albums_year ON albums (year DESC);
CREATE INDEX IF NOT EXISTS idx_albums_year_title ON albums (year DESC, title ASC);
CREATE INDEX IF NOT EXISTS idx_albums_is_favorite ON albums (is_favorite);

CREATE TABLE IF NOT EXISTS genres (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(255) NOT NULL,
  name_ci citext GENERATED ALWAYS AS (name::citext) STORED,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres (name ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_genres_name_ci ON genres (name_ci);
CREATE INDEX IF NOT EXISTS idx_genres_name_ci_trgm ON genres USING gin (name_ci gin_trgm_ops);

CREATE TABLE IF NOT EXISTS artworks (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  hash text NOT NULL UNIQUE,
  path text NOT NULL,
  source artwork_source NOT NULL DEFAULT 'LOCAL',
  width integer NOT NULL,
  height integer NOT NULL,
  is_optimized boolean NOT NULL DEFAULT false,
  generator_version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artworks_path ON artworks (path);
CREATE INDEX IF NOT EXISTS idx_artworks_source ON artworks (source);
CREATE INDEX IF NOT EXISTS idx_artworks_dimensions ON artworks (width, height);
CREATE INDEX IF NOT EXISTS idx_artworks_source_dimensions ON artworks (source, width, height);

CREATE TABLE IF NOT EXISTS artists_songs (
  artist_id integer NOT NULL REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artist_id, song_id)
);
CREATE TABLE IF NOT EXISTS album_songs (
  album_id integer NOT NULL REFERENCES albums(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (album_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_album_songs_song ON album_songs (song_id);
CREATE TABLE IF NOT EXISTS genres_songs (
  genre_id integer NOT NULL REFERENCES genres(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (genre_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_genres_songs_song ON genres_songs (song_id);
CREATE TABLE IF NOT EXISTS albums_artists (
  album_id integer NOT NULL REFERENCES albums(id) ON DELETE CASCADE ON UPDATE CASCADE,
  artist_id integer NOT NULL REFERENCES artists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (album_id, artist_id)
);
CREATE TABLE IF NOT EXISTS artworks_songs (
  artwork_id integer NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (artwork_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_artworks_songs_song ON artworks_songs (song_id);
CREATE TABLE IF NOT EXISTS albums_artworks (
  album_id integer NOT NULL REFERENCES albums(id) ON DELETE CASCADE ON UPDATE CASCADE,
  artwork_id integer NOT NULL REFERENCES artworks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (album_id, artwork_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name varchar(255) NOT NULL,
  name_ci citext GENERATED ALWAYS AS (name::citext) STORED,
  description text,
  parent_id integer REFERENCES playlists(id) ON DELETE SET NULL ON UPDATE CASCADE,
  playlist_type varchar(20) NOT NULL DEFAULT 'standard',
  item_count integer NOT NULL DEFAULT 0,
  total_duration numeric(12,3) NOT NULL DEFAULT '0',
  sidebar_position integer,
  pinned_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists (name ASC);
CREATE INDEX IF NOT EXISTS idx_playlists_name_ci ON playlists (name_ci ASC);
CREATE INDEX IF NOT EXISTS idx_playlists_name_ci_trgm ON playlists USING gin (name_ci gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists (created_at DESC);

CREATE TABLE IF NOT EXISTS playlist_entries (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  playlist_id integer NOT NULL REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  position integer NOT NULL,
  added_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist ON playlist_entries (playlist_id, position);

CREATE TABLE IF NOT EXISTS smart_playlist_rules (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  playlist_id integer NOT NULL UNIQUE REFERENCES playlists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  rule_ast json NOT NULL,
  sort_definition json,
  dependencies json,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS play_events (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  played_at timestamp NOT NULL,
  playback_percentage numeric(5,1),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_play_events_song ON play_events (song_id);
CREATE INDEX IF NOT EXISTS idx_play_events_played_at ON play_events (played_at DESC);

CREATE TABLE IF NOT EXISTS play_history (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  played_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_play_history_song ON play_history (song_id);

CREATE TABLE IF NOT EXISTS skip_events (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  position numeric(8,3),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skip_events_song ON skip_events (song_id);

CREATE TABLE IF NOT EXISTS metadata_overrides (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_kind text NOT NULL,
  entity_id text NOT NULL,
  field_id text NOT NULL,
  value text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_overrides_entity ON metadata_overrides (entity_kind, entity_id, field_id);

CREATE TABLE IF NOT EXISTS user_settings (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  language text,
  zoom_factor double precision,
  recent_searches json,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waveforms (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  song_id integer NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  peaks text NOT NULL,
  generator_version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lyrics (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  song_id integer NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  content text,
  provider lyrics_provider NOT NULL DEFAULT 'EMBEDDED',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replay_gain (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  song_id integer NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  gain double precision,
  peak double precision,
  generator_version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now()
);
`;

export const PGLITE_ENUMS = `
DO $$ BEGIN
  CREATE TYPE artwork_source AS ENUM ('LOCAL','REMOTE');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE lyrics_provider AS ENUM ('MUSIXMATCH','LRCLIB','EMBEDDED','FILESYSTEM');
EXCEPTION WHEN duplicate_object THEN null; END $$;
`;

export const PGLITE_DDL_FULL = PGLITE_ENUMS + PGLITE_DDL;
