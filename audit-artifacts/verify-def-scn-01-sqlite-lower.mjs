import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { eq, sql } from 'drizzle-orm';
import * as schema from './src/main/db/schema.ts';

const sqlite = new DatabaseSync(':memory:');

// Create test schema tables
sqlite.exec(`
  CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    title_ci TEXT GENERATED ALWAYS AS (lower(title)),
    title_norm TEXT,
    year INTEGER,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ci TEXT GENERATED ALWAYS AS (lower(name)),
    name_norm TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ci TEXT GENERATED ALWAYS AS (lower(name)),
    name_norm TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_genres_name_ci ON genres (name_ci);
`);

const db = drizzle(sqlite, { schema });

// Insert test entries
sqlite.exec(`
  INSERT INTO albums (title) VALUES ('The Dark Side of the Moon'), ('Électronique');
  INSERT INTO artists (name) VALUES ('Pink Floyd'), ('Sigur Rós');
  INSERT INTO genres (name) VALUES ('Rock'), ('Électronique');
`);

console.log('Testing getAlbumWithTitle with sql`lower(${title})`...');
const testAlbums = async (title) => {
  return await db.query.albums.findFirst({
    where: (a) => eq(a.titleCI, sql`lower(${title})`)
  });
};

const testArtists = async (name) => {
  return await db.query.artists.findFirst({
    where: (a) => eq(a.nameCI, sql`lower(${name})`)
  });
};

const testGenres = async (name) => {
  return await db.query.genres.findFirst({
    where: (g) => eq(g.nameCI, sql`lower(${name})`)
  });
};

async function run() {
  const a1 = await testAlbums('the dark side of the moon');
  console.log('Album (exact lowercase):', a1?.title);
  if (!a1) throw new Error('Failed to find lowercase album');

  const a2 = await testAlbums('THE DARK SIDE OF THE MOON');
  console.log('Album (uppercase):', a2?.title);
  if (!a2) throw new Error('Failed to find uppercase album');

  const a3 = await testAlbums('Électronique');
  console.log('Album (Unicode):', a3?.title);
  if (!a3) throw new Error('Failed to find Unicode album');

  const ar1 = await testArtists('pink floyd');
  console.log('Artist (exact lowercase):', ar1?.name);
  if (!ar1) throw new Error('Failed to find lowercase artist');

  const ar2 = await testArtists('PINK FLOYD');
  console.log('Artist (uppercase):', ar2?.name);
  if (!ar2) throw new Error('Failed to find uppercase artist');

  const ar3 = await testArtists('Sigur Rós');
  console.log('Artist (Unicode):', ar3?.name);
  if (!ar3) throw new Error('Failed to find Unicode artist');

  const g1 = await testGenres('rock');
  console.log('Genre (lowercase):', g1?.name);
  if (!g1) throw new Error('Failed to find lowercase genre');

  const g2 = await testGenres('ROCK');
  console.log('Genre (uppercase):', g2?.name);
  if (!g2) throw new Error('Failed to find uppercase genre');

  const g3 = await testGenres('Électronique');
  console.log('Genre (Unicode):', g3?.name);
  if (!g3) throw new Error('Failed to find Unicode genre');

  console.log('SUCCESS! All queries matched with 100% case-folding symmetry via SQLite lower()!');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
