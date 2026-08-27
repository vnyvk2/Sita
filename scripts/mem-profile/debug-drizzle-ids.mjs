import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { integer, varchar, boolean, pgTable } from 'drizzle-orm/pg-core';
import { asc } from 'drizzle-orm';

const songs = pgTable('songs', {
  id: integer('id').primaryKey(),
  title: varchar('title', { length: 4096 }).notNull(),
  isBlacklisted: boolean('is_blacklisted').notNull().default(false)
});

const profileDir = process.argv[2];
const db = await PGlite.create(`${profileDir}/nora.pglite.db`, {
  extensions: { pg_trgm, citext }
});
const trx = drizzle(db);

const orderClauses = [asc(songs.title)];

const query = trx.select({ id: songs.id, isBlacklisted: songs.isBlacklisted }).from(songs);

if (orderClauses.length > 0) {
  query.orderBy(...orderClauses, asc(songs.id));
} else {
  query.orderBy(asc(songs.id));
}

const preview = query.toSQL();
console.log('[test] SQL:', preview.sql.substring(0, 300));

const results = await query;
console.log('[test] rows returned:', results.length);
console.log('[test] first 3:', JSON.stringify(results.slice(0, 3)));
await db.close();
