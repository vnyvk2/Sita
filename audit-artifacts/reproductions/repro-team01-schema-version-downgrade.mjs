import { DatabaseSync } from 'node:sqlite';

// Demonstrate that the self-healing block in engine.ts resets user_version to 2,
// causing duplicate column error and unrecoverable startup crash on next boot.
const db = new DatabaseSync(':memory:');

// Baseline v4 schema
db.exec(`
  PRAGMA user_version = 4;
  CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0
  );
`);

console.log('Initial user_version:', db.prepare('PRAGMA user_version').get().user_version);

// Simulate the self-heal check from engine.ts lines 285-303
const userSettingsCols = new Set(
  db.prepare('PRAGMA table_info(user_settings)').all().map((c) => c.name)
);

if (!userSettingsCols.has('send_song_scrobbling_data_to_listenbrainz')) {
  console.log('Self-heal triggered: applying missing columns and setting PRAGMA user_version = 2');
  db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE user_settings ADD COLUMN send_song_scrobbling_data_to_listenbrainz INTEGER NOT NULL DEFAULT 0;
    PRAGMA user_version = 2;
    COMMIT;
  `);
}

const versionAfterRepair = db.prepare('PRAGMA user_version').get().user_version;
console.log('Version after repair:', versionAfterRepair);

// Next boot: engine.ts reads version:
let currentVersion = versionAfterRepair === 0 ? 1 : versionAfterRepair;
console.log('Next boot currentVersion:', currentVersion);

try {
  if (currentVersion === 2) {
    console.log('Next boot attempts to apply migration v2 -> v3...');
    db.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE user_settings ADD COLUMN is_mini_player_taskbar_hidden INTEGER NOT NULL DEFAULT 0;
      PRAGMA user_version = 3;
      COMMIT;
    `);
  }
} catch (err) {
  console.log('FATAL CRASH ON STARTUP CONFIRMED:', err.message);
}
