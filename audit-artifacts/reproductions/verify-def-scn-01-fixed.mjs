import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

// Verify that querying with SQLite lower(?) guarantees algorithmic case-folding symmetry on SQLite generated _ci columns.

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ci TEXT GENERATED ALWAYS AS (lower(name))
  );
  CREATE UNIQUE INDEX idx_genres_name_ci ON genres(name_ci);

  CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    title_ci TEXT GENERATED ALWAYS AS (lower(title))
  );

  CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_ci TEXT GENERATED ALWAYS AS (lower(name))
  );
`);

console.log('=== Running Verification for DEF-SCN-01 Fix (SQLite lower() symmetry) ===');

// Helper simulating fixed query logic with sql`lower(${param})`:
function getGenre(name) {
  if (!name || typeof name !== 'string') return undefined;
  return db.prepare('SELECT * FROM genres WHERE name_ci = lower(?)').get(name);
}

function getAlbum(title) {
  if (!title || typeof title !== 'string') return undefined;
  return db.prepare('SELECT * FROM albums WHERE title_ci = lower(?)').get(title);
}

function getArtist(name) {
  if (!name || typeof name !== 'string') return undefined;
  return db.prepare('SELECT * FROM artists WHERE name_ci = lower(?)').get(name);
}

// 1. GENRES TEST - ASCII & Unicode
db.exec("INSERT INTO genres (name) VALUES ('Rock'), ('Électronique');");

// ASCII lookups
const existingGenre = getGenre('Rock');
assert.ok(existingGenre, 'Should find genre Rock');
assert.strictEqual(existingGenre.name, 'Rock');

const mixedGenre = getGenre('rOcK');
assert.ok(mixedGenre, 'Should find genre rOcK');
assert.strictEqual(mixedGenre.id, existingGenre.id);

const upperGenre = getGenre('ROCK');
assert.ok(upperGenre, 'Should find genre ROCK');
assert.strictEqual(upperGenre.id, existingGenre.id);

// Unicode lookup - verify no false negative
const uniGenre = getGenre('Électronique');
assert.ok(uniGenre, 'Should find Unicode genre Électronique');
assert.strictEqual(uniGenre.name, 'Électronique');

// Ensure no crash on ingestion
if (!getGenre('Rock')) {
  db.exec("INSERT INTO genres (name) VALUES ('Rock');");
}
assert.strictEqual(db.prepare('SELECT count(*) as count FROM genres').get().count, 2);
console.log('PASS: Genre lookup finds existing genre regardless of case, preventing UNIQUE constraint crash.');

// 2. ALBUMS TEST - ASCII & Unicode
db.exec("INSERT INTO albums (title) VALUES ('Thriller'), ('Électronique');");
const existingAlbum = getAlbum('Thriller');
assert.ok(existingAlbum);
assert.strictEqual(existingAlbum.title, 'Thriller');

const lowerAlbum = getAlbum('thriller');
assert.ok(lowerAlbum);
assert.strictEqual(lowerAlbum.id, existingAlbum.id);

const uniAlbum = getAlbum('Électronique');
assert.ok(uniAlbum);
assert.strictEqual(uniAlbum.title, 'Électronique');

if (!getAlbum('Thriller')) {
  db.exec("INSERT INTO albums (title) VALUES ('Thriller');");
}
assert.strictEqual(db.prepare('SELECT count(*) as count FROM albums').get().count, 2);
console.log('PASS: Album lookup finds existing album, preventing duplicate rows.');

// 3. ARTISTS TEST - ASCII & Unicode
db.exec("INSERT INTO artists (name) VALUES ('Michael Jackson'), ('Sigur Rós');");
const existingArtist = getArtist('Michael Jackson');
assert.ok(existingArtist);
assert.strictEqual(existingArtist.name, 'Michael Jackson');

const upperArtist = getArtist('MICHAEL JACKSON');
assert.ok(upperArtist);
assert.strictEqual(upperArtist.id, existingArtist.id);

const uniArtist = getArtist('Sigur Rós');
assert.ok(uniArtist);
assert.strictEqual(uniArtist.name, 'Sigur Rós');

if (!getArtist('Michael Jackson')) {
  db.exec("INSERT INTO artists (name) VALUES ('Michael Jackson');");
}
assert.strictEqual(db.prepare('SELECT count(*) as count FROM artists').get().count, 2);
console.log('PASS: Artist lookup finds existing artist, preventing duplicate rows.');

// 4. Edge cases
assert.strictEqual(getArtist(null), undefined);
assert.strictEqual(getArtist(''), undefined);
assert.strictEqual(getAlbum(undefined), undefined);

console.log('ALL DEF-SCN-01 VERIFICATIONS (ASCII + UNICODE) PASSED!');
