/**
 * REPRODUCTION: TEAM08-001
 * Title: Case-insensitive query failure due to raw equality on lower() generated column
 *
 * Demonstrates that Nora's PGlite -> SQLite migration introduced a critical defect:
 * Drizzle queries for albums, artists, and genres search:
 *   WHERE title_ci = 'Title' (passing original case)
 * In SQLite, 'lower(title)' is compared case-sensitively by default, so 'title' = 'Title'
 * evaluates to FALSE.
 *
 * Consequently:
 * 1. Lookups for existing artists/albums/genres fail whenever the input contains uppercase letters.
 * 2. Ingestion attempts to re-create the entity.
 * 3. For genres (which have UNIQUE(name_ci)), this crashes with SQLITE_CONSTRAINT_UNIQUE.
 * 4. For albums and artists (which lack UNIQUE constraints), this creates duplicate entities in the library.
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

// Setup exact Nora schema for genres, albums, artists
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

console.log('=== Running Reproduction TEAM08-001 ===');

// --- 1. GENRES FAILURE ---
console.log('\n--- 1. Testing Genre Lookup and Unique Constraint Collision ---');
// Song 1 has genre 'Rock'
db.exec("INSERT INTO genres (name) VALUES ('Rock');");
const existingGenre = db.prepare("SELECT * FROM genres WHERE id = 1").get();
console.log('Existing genre row in DB:', existingGenre);

// Song 2 arrives with genre 'Rock'. Nora runs getGenreWithTitle('Rock'):
// Query from src/main/db/queries/genres.ts:169: where: (a) => eq(a.nameCI, name)
const genreLookup = db.prepare("SELECT * FROM genres WHERE name_ci = ?").get('Rock');
console.log("Lookup for genre with name 'Rock' via name_ci = 'Rock':", genreLookup);
assert.strictEqual(genreLookup, undefined, "Lookup should fail because 'rock' = 'Rock' is false in SQLite");

// Because lookup returned undefined, manageGenresOfParsedSong tries to create the genre:
let genreInsertError = null;
try {
  db.exec("INSERT INTO genres (name) VALUES ('Rock');");
} catch (err) {
  genreInsertError = err;
}
assert(genreInsertError !== null, 'Expected UNIQUE constraint violation on genres.name_ci');
console.log('Confirmed: Genre insertion crashes due to failed lookup:', genreInsertError.message);

// --- 2. ALBUMS DUPLICATION FAILURE ---
console.log('\n--- 2. Testing Album Duplication on Upper Case ---');
// Song 1 creates album 'Thriller'
db.exec("INSERT INTO albums (title) VALUES ('Thriller');");

// Song 2 arrives for the same album 'Thriller'. Nora runs getAlbumWithTitle('Thriller'):
// Query from src/main/db/queries/albums.ts:218: where: (a) => eq(a.titleCI, title)
const albumLookup = db.prepare("SELECT * FROM albums WHERE title_ci = ?").get('Thriller');
console.log("Lookup for album 'Thriller' via title_ci = 'Thriller':", albumLookup);
assert.strictEqual(albumLookup, undefined, "Lookup should fail because 'thriller' = 'Thriller' is false in SQLite");

// Because lookup returned undefined, manageAlbumsOfParsedSong creates a second album!
db.exec("INSERT INTO albums (title) VALUES ('Thriller');");

const allAlbums = db.prepare("SELECT * FROM albums").all();
console.log('Total albums created for "Thriller":', allAlbums.length);
assert.strictEqual(allAlbums.length, 2, 'Expected 2 duplicate album rows created!');

// --- 3. ARTISTS DUPLICATION FAILURE ---
console.log('\n--- 3. Testing Artist Duplication on Upper Case ---');
db.exec("INSERT INTO artists (name) VALUES ('Michael Jackson');");
const artistLookup = db.prepare("SELECT * FROM artists WHERE name_ci = ?").get('Michael Jackson');
console.log("Lookup for artist 'Michael Jackson' via name_ci = 'Michael Jackson':", artistLookup);
assert.strictEqual(artistLookup, undefined);

db.exec("INSERT INTO artists (name) VALUES ('Michael Jackson');");
const allArtists = db.prepare("SELECT * FROM artists").all();
console.log('Total artists created for "Michael Jackson":', allArtists.length);
assert.strictEqual(allArtists.length, 2, 'Expected 2 duplicate artist rows created!');

console.log('\n=== Reproduction TEAM08-001 Verified Successfully ===');
