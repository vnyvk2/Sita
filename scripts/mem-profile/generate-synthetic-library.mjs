import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : fallback;
};

const profileDir = getArg('profile');
const count = Number(getArg('count', '50000'));

if (!profileDir) {
  console.error('Usage: node generate-synthetic-library.mjs --profile=<userDataDir> --count=50000');
  process.exit(1);
}

const dbPath = `${profileDir}/nora.pglite.db`;
console.log(`[gen] opening ${dbPath}`);
const db = await PGlite.create(dbPath, { extensions: { pg_trgm, citext } });

const existing = await db.query("SELECT COUNT(*)::int AS n FROM songs WHERE path LIKE 'X:/synthetic/%'");
console.log(`[gen] synthetic songs before cleanup: ${existing.rows[0].n}; target total: ${count}`);

await db.exec(`DELETE FROM songs WHERE path LIKE 'X:/synthetic/%';`);
await db.exec(`DELETE FROM playlists WHERE name = 'Synthetic MegaQueue';`);
await db.exec(`DELETE FROM albums WHERE title LIKE 'Synthetic Album%';`);
await db.exec(`DELETE FROM artists WHERE name LIKE 'Synthetic Artist%';`);

await db.exec(
  `INSERT INTO music_folders (path, name) SELECT 'X:/synthetic', 'Synthetic' WHERE NOT EXISTS (SELECT 1 FROM music_folders WHERE path='X:/synthetic');`
);
await db.exec(
  `INSERT INTO artists (name, is_favorite) SELECT 'Synthetic Artist ' || g, (g % 7 = 0) FROM generate_series(1, 500) g;`
);
await db.exec(
  `INSERT INTO albums (title, year, is_favorite) SELECT 'Synthetic Album ' || g, 1950 + (g % 74), (g % 11 = 0) FROM generate_series(1, 2000) g;`
);
await db.exec(
  `INSERT INTO genres (name) SELECT g FROM unnest(ARRAY['Rock','Pop','Jazz','Electronic','Hip Hop','Classical','Metal','Ambient']) g WHERE NOT EXISTS (SELECT 1 FROM genres ge WHERE ge.name = g);`
);

const existingAfterDelete = await db.query("SELECT COUNT(*)::int AS n FROM songs WHERE path LIKE 'X:/synthetic/%'");
let seq = Number(existingAfterDelete.rows[0].n);
console.log(`[gen] songs to insert: ${count - seq}`);

const BATCH = 10000;
while (seq < count) {
  const end = Math.min(seq + BATCH - 1, count - 1);
  await db.query(
    `INSERT INTO songs (title, duration, skip_count, path, is_favorite, year, track_number, disk_number, language, file_created_at, file_modified_at, created_at, updated_at, folder_id)
     SELECT
       'Synthetic Track ' || g,
       (120 + (g % 180)),
       g % 9,
       'X:/synthetic/' || (((g - 1) % 2000) + 1) || '/track_' || g || '.mp3',
       (g % 13 = 0),
       1950 + (g % 74),
       ((g - 1) % 20) + 1,
       1,
       (ARRAY[NULL::text,'English','English','Korean','Japanese','Spanish'])[1 + (g % 6)],
       NOW(), NOW(), NOW() - ((g % 900) || ' days')::interval, NOW(),
       (SELECT id FROM music_folders WHERE path='X:/synthetic')
     FROM generate_series(${seq}, ${end}) g`,
    []
  );
  seq = end + 1;
  console.log(`[gen] songs: ${seq}/${count}`);
}

console.log('[gen] linking albums/genres/artists...');
await db.exec(`
  WITH synth AS (
    SELECT id, ((row_number() OVER (ORDER BY id)) - 1) % 2000 AS slot
    FROM albums WHERE title LIKE 'Synthetic Album%'
  )
  INSERT INTO album_songs (album_id, song_id)
  SELECT al.id, s.id
  FROM songs s
  JOIN synth al ON al.slot = ((s.id - 1) % 2000)
  WHERE s.path LIKE 'X:/synthetic/%'
  ON CONFLICT DO NOTHING;
`);
await db.exec(`
  INSERT INTO genres_songs (genre_id, song_id)
  SELECT gr.id, s.id
  FROM songs s
  JOIN genres gr ON gr.name = (ARRAY['Rock','Pop','Jazz','Electronic','Hip Hop','Classical','Metal','Ambient'])[1 + (s.id % 8)]
  WHERE s.path LIKE 'X:/synthetic/%'
  ON CONFLICT DO NOTHING;
`);
await db.exec(`
  INSERT INTO artists_songs (artist_id, song_id)
  SELECT ar.id, s.id
  FROM songs s
  CROSS JOIN LATERAL (
    SELECT id FROM artists WHERE name LIKE 'Synthetic Artist%' ORDER BY id OFFSET (s.id % 400) LIMIT 1
  ) ar
  WHERE s.path LIKE 'X:/synthetic/%' AND s.id % 5 = 0
  ON CONFLICT DO NOTHING;
`);

console.log('[gen] building 10k-entry playlist...');
await db.exec(
  `INSERT INTO playlists (name, playlist_type) VALUES ('Synthetic MegaQueue', 'standard');`
);
const pl = await db.query(`SELECT id FROM playlists WHERE name='Synthetic MegaQueue' LIMIT 1`);
await db.exec(`
  INSERT INTO playlist_entries (playlist_id, song_id, position, added_at)
  SELECT ${pl.rows[0].id}, id, row_number() OVER (ORDER BY id), NOW()
  FROM songs WHERE path LIKE 'X:/synthetic/%' AND id % 5 = 0;
`);

const totals = await db.query(`
  SELECT
    (SELECT COUNT(*)::int FROM songs WHERE path LIKE 'X:/synthetic/%') AS songs,
    (SELECT COUNT(*)::int FROM album_songs als JOIN songs s ON s.id=als.song_id WHERE s.path LIKE 'X:/synthetic/%') AS album_links,
    (SELECT COUNT(*)::int FROM playlist_entries pe JOIN playlists p ON p.id=pe.playlist_id WHERE p.name='Synthetic MegaQueue') AS playlist_entries
`);
console.log(`[gen] done:`, totals.rows[0]);
console.log('[gen] vacuuming (this may take a minute)...');
await db.exec('VACUUM ANALYZE songs;');
await db.exec('VACUUM ANALYZE album_songs;');
await db.exec('VACUUM ANALYZE genres_songs;');
await db.exec('VACUUM ANALYZE artists_songs;');
await db.exec('VACUUM;');
console.log('[gen] vacuum complete');
await db.close();
