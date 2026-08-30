// M1 probe 2: generate baseline DDL from drizzle sqlite-core schema via SQLiteSyncDialect.
import { sqliteTable, integer, text, real, index, uniqueIndex, unique, primaryKey, SQLiteSyncDialect, getTableConfig } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { DatabaseSync } from 'node:sqlite';
import { openSqlite } from './engines/sqlite-engine.mjs';
import { rmSync } from 'node:fs';

const artists = sqliteTable('artists', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  nameCi: text('name_ci').generatedAlwaysAs(() => sql`lower(${artists.name})`),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())
}, (t) => [
  index('idx_artists_name_ci').on(t.nameCi.desc()),
  uniqueIndex('idx_artists_name_ci_uniq').on(t.nameCi)
]);

const junction = sqliteTable('a_s', {
  aId: integer('a_id').notNull().references(() => artists.id, { onDelete: 'cascade' }),
  sId: integer('s_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())
}, (t) => [primaryKey({ columns: [t.aId, t.sId] }), unique('u_j').on(t.aId, t.sId)]);

const dialect = new SQLiteSyncDialect();

function tableDdl(table) {
  const q = dialect.buildCreateTableQuery(table);
  // indexes
  const { indexes, uniqueConstraints, name } = getTableConfig(table);
  const stmts = [q];
  for (const idx of indexes) {
    try { stmts.push(dialect.buildCreateIndexQuery(idx)); } catch (e) { console.log('index build fail', e.message); }
  }
  return stmts.map((s) => typeof s === 'string' ? s : s.sql).join(';\n');
}

console.log('=== artists DDL ===');
console.log(tableDdl(artists));
console.log('=== junction DDL ===');
console.log(tableDdl(junction));

// execute the generated DDL for real
rmSync('data/probe-gen-ddl.db', { force: true });
const e = await openSqlite('data/probe-gen-ddl.db');
e.exec(tableDdl(artists) + ';');
e.exec(tableDdl(junction) + ';');
const orm = e.orm;
await orm.insert(artists).values({ name: 'Test Artist' });
const row = await orm.select().from(artists);
console.log('roundtrip:', row[0].nameCi, row[0].createdAt instanceof Date);
// onConflictDoUpdate against schema-declared uniqueIndex target
await orm.insert(artists).values({ name: 'Test Artist' }).onConflictDoUpdate({ target: artists.nameCi, set: { name: 'Test Artist 2' } });
console.log('upsert via nameCi:', (await orm.select().from(artists))[0].name);
await e.close();
console.log('GEN DDL OK');
