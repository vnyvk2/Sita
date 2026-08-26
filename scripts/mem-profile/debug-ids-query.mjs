import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const db = await PGlite.create(process.argv[2] + '/nora.pglite.db', { extensions: { pg_trgm, citext } });

const t0 = Date.now();
const r = await db.query(
  'SELECT "id", "is_blacklisted" FROM "songs" ORDER BY "title" ASC, "id" ASC'
);
console.log('plain select:', r.rows.length, 'rows in', Date.now() - t0, 'ms');

const t1 = Date.now();
const r2 = await db.query(
  `SELECT "id", "is_blacklisted" FROM "songs" WHERE (EXISTS (
    SELECT 1 FROM metadata_overrides
    WHERE metadata_overrides.entity_kind = 'song'
      AND metadata_overrides.field_id = 'language'
      AND metadata_overrides.entity_id = songs.id::text
      AND lower(metadata_overrides.string_value) = lower('English')
  ) OR (NOT EXISTS (
    SELECT 1 FROM metadata_overrides
    WHERE metadata_overrides.entity_kind = 'song'
      AND metadata_overrides.field_id = 'language'
      AND metadata_overrides.entity_id = songs.id::text
      AND metadata_overrides.string_value IS NOT NULL
      AND btrim(metadata_overrides.string_value) <> ''
  ) AND lower(songs.language) = lower('English'))) ORDER BY "title" ASC, "id" ASC`
);
console.log('language-filtered select:', r2.rows.length, 'rows in', Date.now() - t1, 'ms');

await db.close();
