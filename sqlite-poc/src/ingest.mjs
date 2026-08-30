// Loads a generated dataset into either engine (bulk, transactional).
// Mirrors table/column names from the POC DDLs. Insert order respects FK deps.
import { performance } from 'node:perf_hooks';

const PG_MAX_PARAMS = 60000; // PG protocol hard limit 65535; stay under
const SQLITE_MAX_PARAMS = 30000; // SQLITE_MAX_VARIABLE_NUMBER (modern default 32766)

const TABLE_ORDER = [
  'musicFolders', 'artists', 'genres', 'albums', 'artworks', 'songs',
  'songsArtists', 'albumSongs', 'genresSongs', 'albumsArtists', 'artworksSongs', 'albumsArtworks',
  'metadataOverrides', 'playlists', 'playlistEntries', 'playEvents', 'playHistory', 'userSettings'
];

export const COLS = {
  musicFolders: { table: 'music_folders', cols: ['path', 'name', 'is_blacklisted', 'parent_id', 'created_at'] },
  artists: { table: 'artists', cols: ['name', 'is_favorite', 'created_at'] },
  genres: { table: 'genres', cols: ['name', 'created_at'] },
  albums: { table: 'albums', cols: ['title', 'year', 'is_favorite', 'created_at'] },
  artworks: { table: 'artworks', cols: ['hash', 'path', 'source', 'width', 'height', 'is_optimized', 'generator_version', 'created_at'] },
  songs: {
    table: 'songs',
    cols: ['title', 'duration', 'skip_count', 'path', 'is_favorite', 'sample_rate', 'bit_rate', 'no_of_channels',
      'year', 'disk_number', 'track_number', 'folder_id', 'is_blacklisted', 'file_created_at', 'file_modified_at',
      'music_brainz_recording_id', 'isrc', 'language', 'created_at', 'updated_at']
  },
  songsArtists: { table: 'artists_songs', cols: ['artist_id', 'song_id'] },
  albumSongs: { table: 'album_songs', cols: ['album_id', 'song_id'] },
  genresSongs: { table: 'genres_songs', cols: ['genre_id', 'song_id'] },
  albumsArtists: { table: 'albums_artists', cols: ['album_id', 'artist_id'] },
  artworksSongs: { table: 'artworks_songs', cols: ['artwork_id', 'song_id'] },
  albumsArtworks: { table: 'albums_artworks', cols: ['album_id', 'artwork_id'] },
  metadataOverrides: { table: 'metadata_overrides', cols: ['entity_kind', 'entity_id', 'field_id', 'value', 'created_at', 'updated_at'] },
  // NOTE: 'id' is intentionally omitted for identity tables — both engines assign 1..n
  // in insertion order, and the generated dataset's references (playlists, songs, ...)
  // follow that same order.
  playlists: { table: 'playlists', cols: ['name', 'playlist_type', 'item_count', 'total_duration', 'created_at'] },
  playlistEntries: { table: 'playlist_entries', cols: ['playlist_id', 'song_id', 'position'] },
  playEvents: { table: 'play_events', cols: ['song_id', 'played_at', 'playback_percentage', 'created_at'] },
  playHistory: { table: 'play_history', cols: ['song_id', 'played_at', 'created_at'] },
  userSettings: { table: 'user_settings', cols: ['language', 'zoom_factor', 'recent_searches'] }
};

const BOOLEAN_KEYS = new Set(['isFavorite', 'isBlacklisted', 'isOptimized']);

function adaptRows(engine, key, rows) {
  if (engine.kind === 'pglite') {
    // PGlite boolean params must be real booleans
    return rows.map((row) => {
      let out = row;
      for (const k of BOOLEAN_KEYS) {
        if (k in row) {
          if (out === row) out = { ...row };
          out[k] = !!row[k];
        }
      }
      return out;
    });
  }
  return rows;
}

export async function ingestDataset(engine, dataset, { batchSize = 400 } = {}) {
  const t0 = performance.now();
  const perTable = {};
  const maxParams = engine.kind === 'pglite' ? PG_MAX_PARAMS : SQLITE_MAX_PARAMS;
  const batchRows = Math.min(batchSize, Math.floor(maxParams / 26));

  await engine.tx(async (tx) => {
    for (const key of TABLE_ORDER) {
      const rows = dataset.tables[key] ?? [];
      const spec = COLS[key];
      if (!rows.length) { perTable[key] = 0; continue; }
      const adapted = adaptRows(engine, key, rows);
      const t = performance.now();
      for (let i = 0; i < adapted.length; i += batchRows) {
        const chunk = adapted.slice(i, i + batchRows);
        const sql = multiInsertSql(engine, spec.table, spec.cols, chunk.length);
        const params = [];
        for (const row of chunk) {
          for (const c of spec.cols) {
            const camel = c.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
            params.push(row[camel] !== undefined ? row[camel] : row[c]);
          }
        }
        await tx.run(sql, params);
      }
      perTable[key] = { rows: adapted.length, ms: Math.round((performance.now() - t) * 10) / 10 };
    }
  });

  return { ingestMs: performance.now() - t0, perTable };
}

export function multiInsertSql(engine, table, cols, nRows) {
  const ph = engine.kind === 'pglite' ? 'pg' : 'q';
  let n = 0;
  const values = [];
  for (let i = 0; i < nRows; i++) {
    const rowPh = cols.map(() => (ph === 'pg' ? `$${++n}` : '?'));
    values.push(`(${rowPh.join(',')})`);
  }
  return `INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}`;
}
