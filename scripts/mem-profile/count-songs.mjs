import { PGlite } from '@electric-sql/pglite';

const profileDir = process.argv[2];
if (!profileDir) {
  console.error('Usage: node count-songs.mjs <userDataDir>');
  process.exit(1);
}
const db = await PGlite.create(`${profileDir}/nora.pglite.db`);
const r = await db.query(
  "SELECT (SELECT COUNT(*)::int FROM songs) AS total, (SELECT COUNT(*)::int FROM songs WHERE path LIKE 'X:/synthetic/%') AS synthetic"
);
console.log('songs total:', r.rows[0].total, '| synthetic:', r.rows[0].synthetic);
await db.close();
