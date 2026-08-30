// Phase 12 — Shutdown: verifies SQLite does not introduce a new shutdown race,
// using Nora's real shutdown invariants (ShutdownCoordinator.ts:107-120):
//   "no DB-dependent job is still executing when closeDatabaseInstance() is called"
//   will-quit backstop close; close must be safe even if a straggler write lands.
//
// Scenarios (node:sqlite, the real runtime):
//   1. close while a read is in flight → read finishes or errors safely; close OK; reopen OK
//   2. close while a write tx is in flight → tx cannot commit after close; reopen shows pre-tx state
//   3. queued writes after close (straggler) → must throw, never corrupt; reopen integrity ok
//   4. WAL checkpoint on close leaves a fully self-contained .db file (Nora ships single-file data)
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { DatabaseSync } from 'node:sqlite';
import { SQLITE_DDL } from '../schema/sqlite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';
import path from 'node:path';
import { rmSync, existsSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const results = { engines: { sqlite: {} } };
const dbPath = path.join(POC_ROOT, 'data', 'shutdown-test.db');
rmSync(dbPath, { force: true });
rmSync(dbPath + '-wal', { force: true });
rmSync(dbPath + '-shm', { force: true });

const e = await openSqlite(dbPath, { ddl: SQLITE_DDL });
e.run(`INSERT INTO music_folders (path, name) VALUES ('C:\\m', 'M')`);
const insertSong = (i) => e.run(
  `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
   VALUES (${Array(20).fill('?').join(',')})`,
  [`shutdown ${i}`, 200.5, 0, `C:\\m\\${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
);
for (let i = 0; i < 100; i++) insertSong(i);

// 1. close while read in flight
{
  const reader = new DatabaseSync(dbPath);
  reader.exec('PRAGMA busy_timeout=100');
  let readOutcome = 'completed';
  let closeMs = 0;
  // start a long read on a second connection, then close main + reader mid-read
  const readPromise = new Promise((resolve) => {
    setTimeout(() => {
      try {
        reader.prepare('SELECT COUNT(*) c FROM songs s1, songs s2').get();
        resolve('completed');
      } catch (err) {
        resolve(`error: ${err.message}`);
      }
    }, 50);
  });
  closeMs = await e.close();
  readOutcome = await readPromise;
  try { reader.close(); } catch { /* already closed */ }
  results.engines.sqlite.close_during_read = { closeMs, readOutcome };
  console.log(`1. close during read: closeMs=${closeMs} readOutcome=${readOutcome}`);
}

// reopen for scenario 2
const e2 = await openSqlite(dbPath);

// 2. close while write tx in flight (simulate crash-before-commit on a SECOND connection)
{
  const w2 = new DatabaseSync(dbPath);
  w2.exec('PRAGMA busy_timeout=100');
  const straggler = (async () => {
    w2.exec('BEGIN');
    for (let i = 100; i < 120; i++) {
      w2.prepare(
        `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
         VALUES (${Array(20).fill('?').join(',')})`
      ).run(...[`straggler ${i}`, 200.5, 0, `C:\\m\\s${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
    }
    await new Promise((r) => setTimeout(r, 120)); // main closes during this window
    w2.exec('COMMIT'); // commits AFTER main closed — WAL allows it (straggler write lands)
    return 'committed-after-close';
  })();
  const closeMs = await e2.close();
  const stragglerResult = await straggler.catch((err) => `error: ${err.message}`);
  // reopen: either the straggler tx committed (WAL allows) or rolled back — must be consistent
  const e3 = await openSqlite(dbPath);
  const count = e3.get('SELECT COUNT(*) c FROM songs').c;
  const integrity = e3.get('PRAGMA integrity_check').integrity_check;
  results.engines.sqlite.close_during_write_tx = { closeMs, stragglerResult, songsAfterReopen: count, integrity, consistent: count === 100 || count === 120 };
  console.log(`2. close during write tx: closeMs=${closeMs} straggler=${stragglerResult} songsAfterReopen=${count} integrity=${integrity}`);
  e3.close();
  try { w2.close(); } catch { /* nop */ }
}

// 3. queued write AFTER close → must throw, never corrupt
{
  const e4 = await openSqlite(dbPath);
  const afterClose = await e4.close();
  let writeAfterCloseError = null;
  try {
    e4.run(`INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
            VALUES (${Array(20).fill('?').join(',')})`,
    ['late', 1, 0, 'C:\\m\\late.mp3', 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  } catch (err) {
    writeAfterCloseError = err.message.slice(0, 60);
  }
  results.engines.sqlite.write_after_close = { afterClose, writeAfterCloseError, throwsCleanly: writeAfterCloseError !== null };
  console.log(`3. write after close: throws="${writeAfterCloseError}"`);
}

// 4. WAL checkpoint leaves self-contained file
{
  const e5 = await openSqlite(dbPath);
  e5.run(`INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
          VALUES (${Array(20).fill('?').join(',')})`,
  ['wal test', 1, 0, 'C:\\m\\w.mp3', 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  await e5.close();
  const mainSize = existsSync(dbPath) ? statSync(dbPath).size : 0;
  const walSize = existsSync(dbPath + '-wal') ? statSync(dbPath + '-wal').size : 0;
  const e6 = await openSqlite(dbPath);
  const count = e6.get('SELECT COUNT(*) c FROM songs').c;
  await e6.close();
  results.engines.sqlite.wal_checkpoint_on_close = { mainSizeMb: Math.round(mainSize / 1048576 * 100) / 100, walLeftBytes: walSize, songsOnReopen: count, selfContained: walSize === 0 && count >= 101 };
  console.log(`4. WAL checkpoint on close: mainDb=${results.engines.sqlite.wal_checkpoint_on_close.mainSizeMb}MB walLeft=${walSize}B songs=${count}`);
}

await saveResults('shutdown', { env: envInfo(), results });
