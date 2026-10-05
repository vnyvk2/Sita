/**
 * REPRODUCTION: TEAM08-004
 * Title: SQL LIKE wildcard overmatch in resolveOrCreateMusicFolders
 *
 * Demonstrates that using unescaped rootPath in SQL LIKE query:
 *   like(musicFolders.path, `${rootPathWithSep}%`)
 * causes paths containing '_' (single char wildcard) or '%' (any char wildcard)
 * to match and mutate folders from completely unrelated directories.
 */

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE music_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE
  );
`);

// User has three roots or folders:
// 1. "/music_2024/rock" (intended root "/music_2024/")
// 2. "/music-2024/pop"  (completely unrelated folder!)
// 3. "/musicA2024/jazz" (completely unrelated folder!)
db.prepare('INSERT INTO music_folders (path) VALUES (?)').run('/music_2024/rock');
db.prepare('INSERT INTO music_folders (path) VALUES (?)').run('/music-2024/pop');
db.prepare('INSERT INTO music_folders (path) VALUES (?)').run('/musicA2024/jazz');

console.log('=== Running Reproduction TEAM08-004 ===');

const rootPathWithSep = '/music_2024/';
// Query from src/main/library/folderHierarchy.ts:96:
// like(musicFolders.path, `${rootPathWithSep}%`)
const pattern = `${rootPathWithSep}%`;

const results = db.prepare('SELECT path FROM music_folders WHERE path LIKE ?').all(pattern);
console.log('Folders matched by pattern:', results.map((r) => r.path));

// In SQL, '_' matches '-', 'A', or ANY character!
// Therefore, '/music-2024/pop' and '/musicA2024/jazz' were erroneously matched!
assert.strictEqual(results.length, 3, 'Unescaped underscore matched all 3 directories instead of 1!');
assert(results.some((r) => r.path.includes('music-2024')), 'Overmatched unrelated folder music-2024');
assert(results.some((r) => r.path.includes('musicA2024')), 'Overmatched unrelated folder musicA2024');

console.log('Confirmed: Unescaped LIKE wildcards in root path cause false-positive matches on unrelated directories.');
console.log('=== Reproduction TEAM08-004 Verified Successfully ===');
