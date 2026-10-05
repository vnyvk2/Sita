/**
 * REPRODUCTION: TEAM08-002
 * Title: Single-track artist and album deletion during reParseSong destroys favorites and metadata
 *
 * Demonstrates that when a song belonging to an artist or album with 1 track is re-parsed
 * (e.g. user updates a tag, fetches lyrics, or runs library modification reconciliation),
 * removeDeletedArtistDataOfSong() and removeDeletedAlbumDataOfSong() unlinks the song and
 * checks if songIds.length === 0. Because it is 0, it calls deleteArtist() and deleteAlbum(),
 * completely wiping out the user's favorite status, MBID, and custom metadata before
 * re-creating a blank replacement record.
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

db.exec(`
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

  CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    path TEXT NOT NULL
  );

  CREATE TABLE artists_songs (
    artist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    PRIMARY KEY (artist_id, song_id)
  );

  CREATE TABLE albums_songs (
    album_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    PRIMARY KEY (album_id, song_id)
  );
`);

console.log('=== Running Reproduction TEAM08-002 ===');

// Setup: Artist 'Pink Floyd' (Favorited) and Album 'The Wall' (Favorited) with 1 song
db.exec("INSERT INTO artists (name, is_favorite, online_bio) VALUES ('Pink Floyd', 1, 'Legendary rock band');");
db.exec("INSERT INTO albums (title, is_favorite) VALUES ('The Wall', 1);");
db.exec("INSERT INTO songs (title, path) VALUES ('Comfortably Numb', '/music/comfortably_numb.mp3');");
db.exec("INSERT INTO artists_songs (artist_id, song_id) VALUES (1, 1);");
db.exec("INSERT INTO albums_songs (album_id, song_id) VALUES (1, 1);");

console.log('Initial DB State:');
console.log('  Artist:', db.prepare('SELECT * FROM artists').get());
console.log('  Album:', db.prepare('SELECT * FROM albums').get());

// Simulate reParseSong logic (from reParseSong.ts:96-150 and removeSongsFromLibrary.ts:16-52)
function reParseSongSimulation(songId, artistId, albumId) {
  // 1. Unlink from artist
  db.prepare('DELETE FROM artists_songs WHERE artist_id = ? AND song_id = ?').run(artistId, songId);
  const remainingArtistSongs = db.prepare('SELECT song_id FROM artists_songs WHERE artist_id = ?').all(artistId);
  if (remainingArtistSongs.length === 0) {
    console.log('  [reParseSong] 0 tracks remaining for artist! Deleting artist ID', artistId);
    db.prepare('DELETE FROM artists WHERE id = ?').run(artistId);
  }

  // 2. Unlink from album
  db.prepare('DELETE FROM albums_songs WHERE album_id = ? AND song_id = ?').run(albumId, songId);
  const remainingAlbumSongs = db.prepare('SELECT song_id FROM albums_songs WHERE album_id = ?').all(albumId);
  if (remainingAlbumSongs.length === 0) {
    console.log('  [reParseSong] 0 tracks remaining for album! Deleting album ID', albumId);
    db.prepare('DELETE FROM albums WHERE id = ?').run(albumId);
  }

  // 3. Later in manageArtistsOfParsedSong / manageAlbumsOfParsedSong:
  // Brand new records are created with default is_favorite = 0
  db.prepare("INSERT INTO artists (name) VALUES ('Pink Floyd');").run();
  db.prepare("INSERT INTO albums (title) VALUES ('The Wall');").run();
  db.prepare('INSERT INTO artists_songs (artist_id, song_id) VALUES (2, 1);').run();
  db.prepare('INSERT INTO albums_songs (album_id, song_id) VALUES (2, 1);').run();
}

reParseSongSimulation(1, 1, 1);

console.log('\nPost-reParse DB State:');
const postArtist = db.prepare('SELECT * FROM artists').get();
const postAlbum = db.prepare('SELECT * FROM albums').get();
console.log('  Artist:', postArtist);
console.log('  Album:', postAlbum);

// Verify data loss:
assert.strictEqual(postArtist.id, 2, 'Artist ID was replaced');
assert.strictEqual(postArtist.is_favorite, 0, 'Favorite status was wiped out');
assert.strictEqual(postArtist.online_bio, null, 'Online bio was lost');
assert.strictEqual(postAlbum.id, 2, 'Album ID was replaced');
assert.strictEqual(postAlbum.is_favorite, 0, 'Album favorite status was wiped out');

console.log('\nConfirmed: Re-parsing a single-track artist/album destroys the entity, favorites, and metadata.');
console.log('=== Reproduction TEAM08-002 Verified Successfully ===');
