// M1 probe: verify drizzle sqlite-core capabilities needed by the schema rewrite.
import { sqliteTable, integer, text, index, uniqueIndex, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { openSqlite } from './engines/sqlite-engine.mjs';
import { rmSync } from 'node:fs';

const artists = sqliteTable('artists', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  nameCi: text('name_ci').generatedAlwaysAs(() => sql`lower(${artists.name})`),
  titleNorm: text('title_norm').generatedAlwaysAs(() => sql`replace(lower(${artists.name}), ${' '}, ${''})`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  duration: real('duration').notNull().default(0)
}, (t) => [
  index('idx_a').on(t.nameCi.desc()),
  uniqueIndex('idx_u').on(t.nameCi)
]);

rmSync('data/probe-sqlite-core.db', { force: true });
const e = await openSqlite('data/probe-sqlite-core.db');
e.exec(`CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  name_ci TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  title_norm TEXT GENERATED ALWAYS AS (replace(lower(name), ' ', '')) STORED,
  created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
  is_active INTEGER NOT NULL DEFAULT 1, duration REAL NOT NULL DEFAULT 0);
  CREATE INDEX idx_a ON artists (name_ci DESC);
  CREATE UNIQUE INDEX idx_u ON artists (name_ci);`);
const orm = e.orm;
await orm.insert(artists).values({ name: 'Björk & The Strängs!' });
const row = await orm.select().from(artists);
console.log('generated cols:', row[0].nameCi, '|', row[0].titleNorm, '| ts:', row[0].createdAt instanceof Date, '| bool:', row[0].isActive, '| dur:', row[0].duration);
await orm.update(artists).set({ name: 'renamed' });
console.log('after update gen col recompute:', (await orm.select().from(artists))[0].nameCi);
await e.close();
console.log('PROBE OK');
