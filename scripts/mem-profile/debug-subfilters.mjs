import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const db = await PGlite.create(process.argv[2] + '/nora.pglite.db', {
  extensions: { pg_trgm, citext }
});

const manual = await db.query(`
  SELECT COUNT(*)::int AS n FROM songs s
  WHERE EXISTS (
    SELECT 1 FROM artists_songs asg
    INNER JOIN artists a ON a.id = asg.artist_id
    WHERE asg.song_id = s.id AND a.is_favorite = TRUE
  )
`);
console.log('manual fav-artist song count:', manual.rows[0].n);

const endpointReplica = await db.query(`
  SELECT COUNT(*)::int AS n FROM songs
  WHERE EXISTS (
    SELECT 1 FROM artists_songs
    INNER JOIN artists ON artists.id = artists_songs.artist_id
    WHERE artists_songs.song_id = songs.id AND artists.is_favorite = TRUE
  )
`);
console.log('endpoint-replica count:', endpointReplica.rows[0].n);

const favAlbums = await db.query(`
  SELECT COUNT(*)::int AS n FROM songs
  WHERE EXISTS (
    SELECT 1 FROM album_songs
    INNER JOIN albums ON albums.id = album_songs.album_id
    WHERE album_songs.song_id = songs.id AND albums.is_favorite = TRUE
  )
`);
console.log('fav-album song count:', favAlbums.rows[0].n);

const langEn = await db.query(`
  SELECT COUNT(*)::int AS n FROM songs
  WHERE lower(songs.language) = lower('English')
`);
console.log('english songs:', langEn.rows[0].n);

await db.close();
