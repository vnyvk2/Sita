import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

/**
 * VERIFICATION FOR DEF-SCN-02 FIX:
 * Verify that differential cleanup during reParseSong preserves artist and album
 * entities, including is_favorite, IDs, and custom metadata for single-track entities.
 */

const db = new DatabaseSync(':memory:');

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    online_bio TEXT
  );

  CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    path TEXT NOT NULL
  );

  CREATE TABLE artists_songs (
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    PRIMARY KEY (artist_id, song_id)
  );

  CREATE TABLE albums_songs (
    album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    PRIMARY KEY (album_id, song_id)
  );

  CREATE TABLE albums_artists (
    album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    PRIMARY KEY (album_id, artist_id)
  );

  CREATE TABLE genres_songs (
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    PRIMARY KEY (genre_id, song_id)
  );
`);

console.log('=== Running Verification for DEF-SCN-02 Fix ===');

// Setup: Artist 'Pink Floyd' (Favorited, ID=1) and Album 'The Wall' (Favorited, ID=1) with 1 song
db.exec("INSERT INTO artists (name, is_favorite, online_bio) VALUES ('Pink Floyd', 1, 'Legendary rock band');");
db.exec("INSERT INTO albums (title, is_favorite) VALUES ('The Wall', 1);");
db.exec("INSERT INTO genres (name) VALUES ('Progressive Rock');");
db.exec("INSERT INTO songs (title, path) VALUES ('Comfortably Numb', '/music/comfortably_numb.mp3');");
db.exec("INSERT INTO artists_songs (artist_id, song_id) VALUES (1, 1);");
db.exec("INSERT INTO albums_songs (album_id, song_id) VALUES (1, 1);");
db.exec("INSERT INTO genres_songs (genre_id, song_id) VALUES (1, 1);");

// Simulating fixed reParseSong differential cleanup
function simulateReparseFixed(songId, prevArtistIds, prevAlbumId, prevGenreIds, newArtistNames, newAlbumName, newGenreNames) {
  // 1. Manage albums (find or create)
  let targetAlbumId;
  if (newAlbumName) {
    const existing = db.prepare('SELECT * FROM albums WHERE title = ?').get(newAlbumName);
    if (existing) {
      targetAlbumId = existing.id;
      db.prepare('INSERT OR IGNORE INTO albums_songs (album_id, song_id) VALUES (?, ?)').run(targetAlbumId, songId);
    } else {
      const res = db.prepare('INSERT INTO albums (title) VALUES (?)').run(newAlbumName);
      targetAlbumId = Number(res.lastInsertRowid);
      db.prepare('INSERT INTO albums_songs (album_id, song_id) VALUES (?, ?)').run(targetAlbumId, songId);
    }
  }

  // 2. Manage artists
  const activeArtistIds = new Set();
  for (const name of newArtistNames) {
    const existing = db.prepare('SELECT * FROM artists WHERE name = ?').get(name);
    let artistId;
    if (existing) {
      artistId = existing.id;
    } else {
      const res = db.prepare('INSERT INTO artists (name) VALUES (?)').run(name);
      artistId = Number(res.lastInsertRowid);
    }
    db.prepare('INSERT OR IGNORE INTO artists_songs (artist_id, song_id) VALUES (?, ?)').run(artistId, songId);
    activeArtistIds.add(artistId);
  }

  // 3. Manage genres
  const activeGenreIds = new Set();
  for (const name of newGenreNames) {
    const existing = db.prepare('SELECT * FROM genres WHERE name = ?').get(name);
    let genreId;
    if (existing) {
      genreId = existing.id;
    } else {
      const res = db.prepare('INSERT INTO genres (name) VALUES (?)').run(name);
      genreId = Number(res.lastInsertRowid);
    }
    db.prepare('INSERT OR IGNORE INTO genres_songs (genre_id, song_id) VALUES (?, ?)').run(genreId, songId);
    activeGenreIds.add(genreId);
  }

  // 4. DIFFERENTIAL CLEANUP
  // Albums
  if (prevAlbumId !== undefined && prevAlbumId !== targetAlbumId) {
    db.prepare('DELETE FROM albums_songs WHERE album_id = ? AND song_id = ?').run(prevAlbumId, songId);
    const remaining = db.prepare('SELECT song_id FROM albums_songs WHERE album_id = ?').all(prevAlbumId);
    if (remaining.length === 0) {
      const albumArtistIds = db.prepare('SELECT artist_id FROM albums_artists WHERE album_id = ?').all(prevAlbumId).map(r => r.artist_id);
      db.prepare('DELETE FROM albums WHERE id = ?').run(prevAlbumId);
      for (const artistId of albumArtistIds) {
        const remainingSongs = db.prepare('SELECT song_id FROM artists_songs WHERE artist_id = ?').all(artistId);
        const remainingAlbums = db.prepare('SELECT album_id FROM albums_artists WHERE artist_id = ?').all(artistId);
        if (remainingSongs.length === 0 && remainingAlbums.length === 0) {
          db.prepare('DELETE FROM artists WHERE id = ?').run(artistId);
        }
      }
    }
  }

  // Artists
  for (const prevArtistId of prevArtistIds) {
    if (!activeArtistIds.has(prevArtistId)) {
      db.prepare('DELETE FROM artists_songs WHERE artist_id = ? AND song_id = ?').run(prevArtistId, songId);
      const remainingSongs = db.prepare('SELECT song_id FROM artists_songs WHERE artist_id = ?').all(prevArtistId);
      const remainingAlbums = db.prepare('SELECT album_id FROM albums_artists WHERE artist_id = ?').all(prevArtistId);
      if (remainingSongs.length === 0 && remainingAlbums.length === 0) {
        db.prepare('DELETE FROM artists WHERE id = ?').run(prevArtistId);
      }
    }
  }

  // Genres
  for (const prevGenreId of prevGenreIds) {
    if (!activeGenreIds.has(prevGenreId)) {
      db.prepare('DELETE FROM genres_songs WHERE genre_id = ? AND song_id = ?').run(prevGenreId, songId);
      const remaining = db.prepare('SELECT song_id FROM genres_songs WHERE genre_id = ?').all(prevGenreId);
      if (remaining.length === 0) {
        db.prepare('DELETE FROM genres WHERE id = ?').run(prevGenreId);
      }
    }
  }
}

// TEST 1: Re-parse song without changing tags (e.g. lyrics update or metadata refresh)
simulateReparseFixed(1, [1], 1, [1], ['Pink Floyd'], 'The Wall', ['Progressive Rock']);

const artist1 = db.prepare('SELECT * FROM artists WHERE id = 1').get();
assert.ok(artist1, 'Artist ID 1 must still exist');
assert.strictEqual(artist1.is_favorite, 1, 'Artist is_favorite must be preserved');
assert.strictEqual(artist1.online_bio, 'Legendary rock band', 'Artist bio must be preserved');

const album1 = db.prepare('SELECT * FROM albums WHERE id = 1').get();
assert.ok(album1, 'Album ID 1 must still exist');
assert.strictEqual(album1.is_favorite, 1, 'Album is_favorite must be preserved');

console.log('PASS 1: Re-parsing single-track song with same tags preserves artist/album ID, favorites, and bio.');

// TEST 2: Re-parse song with CHANGED album (moved to new album)
simulateReparseFixed(1, [1], 1, [1], ['Pink Floyd'], 'Animals', ['Progressive Rock']);

const oldAlbum = db.prepare('SELECT * FROM albums WHERE id = 1').get();
assert.strictEqual(oldAlbum, undefined, 'Old empty album should be cleaned up');

const newAlbum = db.prepare('SELECT * FROM albums WHERE title = ?').get('Animals');
assert.ok(newAlbum, 'New album should be created and linked');

const artistStillSame = db.prepare('SELECT * FROM artists WHERE id = 1').get();
assert.ok(artistStillSame, 'Artist was not changed, must remain preserved');
assert.strictEqual(artistStillSame.is_favorite, 1, 'Artist is_favorite remains intact');

console.log('PASS 2: Changing album cleans up orphaned old album while preserving unchanged artist.');

// TEST 3: Performer unlinked, but artist is still an Album Artist
// Setup Artist 2 as Album Artist on Animals
db.exec("INSERT INTO artists (id, name, is_favorite) VALUES (2, 'Roger Waters', 1);");
const animalsAlbum = db.prepare('SELECT id FROM albums WHERE title = ?').get('Animals');
db.prepare('INSERT INTO albums_artists (album_id, artist_id) VALUES (?, 2)').run(animalsAlbum.id);
// Song 1 temporarily also has Roger Waters as performer
db.prepare('INSERT INTO artists_songs (artist_id, song_id) VALUES (2, 1)').run();

// Re-parse removing Roger Waters as performer (only Pink Floyd remains as performer)
simulateReparseFixed(1, [1, 2], animalsAlbum.id, [1], ['Pink Floyd'], 'Animals', ['Progressive Rock']);

const rogerWaters = db.prepare('SELECT * FROM artists WHERE id = 2').get();
assert.ok(rogerWaters, 'Roger Waters must NOT be deleted because he is still an Album Artist');
assert.strictEqual(rogerWaters.is_favorite, 1, 'Roger Waters favorite status must be preserved');
const songPerformers = db.prepare('SELECT artist_id FROM artists_songs WHERE song_id = 1').all().map(r => r.artist_id);
assert.ok(!songPerformers.includes(2), 'Roger Waters was unlinked as track performer');

console.log('PASS 3: Unlinking performer does not delete artist if still linked as Album Artist.');

// TEST 4: Album deleted, orphaned Album Artist is safely cleaned up
// Setup Artist 3 as Album Artist exclusively on a temporary album with 1 song
db.exec("INSERT INTO artists (id, name) VALUES (3, 'Temporary Producer');");
db.exec("INSERT INTO albums (id, title) VALUES (99, 'Temporary EP');");
db.prepare('INSERT INTO albums_artists (album_id, artist_id) VALUES (99, 3)').run();
db.prepare('INSERT INTO albums_songs (album_id, song_id) VALUES (99, 1)').run();

// Re-parse song moving off Temporary EP back to Animals
simulateReparseFixed(1, [1], 99, [1], ['Pink Floyd'], 'Animals', ['Progressive Rock']);

const tempAlbum = db.prepare('SELECT * FROM albums WHERE id = 99').get();
assert.strictEqual(tempAlbum, undefined, 'Temporary EP should be deleted');
const tempArtist = db.prepare('SELECT * FROM artists WHERE id = 3').get();
assert.strictEqual(tempArtist, undefined, 'Temporary Producer should be deleted because it is now orphaned');

console.log('PASS 4: Orphaned album artist is safely deleted when album has 0 songs and artist has no other links.');

console.log('ALL DEF-SCN-02 VERIFICATIONS PASSED SUCCESSFULLY!');


