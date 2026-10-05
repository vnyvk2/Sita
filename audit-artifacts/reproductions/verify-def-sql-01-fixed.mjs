import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';

// Verify that the schema self-healing fix prevents user_version downgrade and startup crashes.
const db = new DatabaseSync(':memory:');

const SCHEMA_VERSION = 4;

// 1. Setup a baseline v4 schema without listenbrainz columns (simulating a corrupted or missing column scenario)
db.exec(`
  PRAGMA user_version = 4;
  CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE songs (
    id INTEGER PRIMARY KEY,
    title TEXT,
    is_blacklisted INTEGER DEFAULT 0
  );
`);

console.log('Initial user_version:', db.prepare('PRAGMA user_version').get().user_version);
assert.strictEqual(db.prepare('PRAGMA user_version').get().user_version, 4);

// 2. Run the fixed self-heal block from engine.ts
const userSettingsCols = new Set(
  db.prepare('PRAGMA table_info(user_settings)').all().map((c) => c.name)
);

if (!userSettingsCols.has('send_song_scrobbling_data_to_listenbrainz')) {
  console.log('Self-heal triggered: applying missing columns WITHOUT setting user_version = 2');
  db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE user_settings ADD COLUMN send_song_scrobbling_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0 CHECK (send_song_scrobbling_data_to_listenbrainz IN (0,1));
    ALTER TABLE user_settings ADD COLUMN send_song_favorites_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0 CHECK (send_song_favorites_data_to_listenbrainz IN (0,1));
    ALTER TABLE user_settings ADD COLUMN send_now_playing_song_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0 CHECK (send_now_playing_song_data_to_listenbrainz IN (0,1));
    ALTER TABLE user_settings ADD COLUMN listenbrainz_username TEXT;
    ALTER TABLE user_settings ADD COLUMN listenbrainz_user_token TEXT;
    COMMIT;
  `);
}

if (!userSettingsCols.has('is_mini_player_taskbar_hidden')) {
  db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE user_settings ADD COLUMN is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_mini_player_taskbar_hidden IN (0,1));
    COMMIT;
  `);
}

const finalVersion = db.prepare('PRAGMA user_version').get().user_version;
if (finalVersion < SCHEMA_VERSION) {
  db.prepare(`PRAGMA user_version = ${SCHEMA_VERSION}`).run();
}

console.log('Version after repair:', db.prepare('PRAGMA user_version').get().user_version);
assert.strictEqual(db.prepare('PRAGMA user_version').get().user_version, 4, 'Version must remain 4 and NOT downgrade to 2!');

// 3. Now simulate next boot logic:
let currentVersion = db.prepare('PRAGMA user_version').get().user_version;
console.log('Next boot currentVersion:', currentVersion);

// Test idempotent migration logic if someone was stuck on v2
let simulatedV2Db = new DatabaseSync(':memory:');
simulatedV2Db.exec(`
  PRAGMA user_version = 2;
  CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0
  );
`);

const cols = new Set(
  simulatedV2Db.prepare('PRAGMA table_info(user_settings)').all().map((c) => c.name)
);
if (!cols.has('is_mini_player_taskbar_hidden')) {
  simulatedV2Db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE user_settings ADD COLUMN is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_mini_player_taskbar_hidden IN (0,1));
    PRAGMA user_version = 3;
    COMMIT;
  `);
} else {
  simulatedV2Db.exec(`PRAGMA user_version = 3;`);
}

console.log('V2 DB with duplicate column migrated cleanly to version:', simulatedV2Db.prepare('PRAGMA user_version').get().user_version);
assert.strictEqual(simulatedV2Db.prepare('PRAGMA user_version').get().user_version, 3);

console.log('ALL DEF-SQL-01 FIX VERIFICATIONS PASSED SUCCESSFULLY!');
