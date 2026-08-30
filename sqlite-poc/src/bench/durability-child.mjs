// Durability soak child: opens DB with the given synchronous mode, inserts BATCH rows in one
// transaction, signals the parent at tx-start and again after commit, then waits to be killed.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { SQLITE_DDL, SQLITE_FTS_DDL, SQLITE_FTS_TRIGGERS } from '../schema/sqlite-ddl.mjs';

const mode = process.argv[2];
const dbPath = process.argv[3];
const batch = Number(process.argv[4]);

const e = await openSqlite(dbPath, {
  ddl: SQLITE_DDL,
  ftsDdl: SQLITE_FTS_DDL,
  triggersDdl: SQLITE_FTS_TRIGGERS,
  pragmas: [`PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = ${mode};`, 'PRAGMA busy_timeout = 5000;', 'PRAGMA foreign_keys = ON;']
});

process.send({ type: 'tx-started' });
await e.tx(async (tx) => {
  for (let i = 0; i < batch; i++) {
    const n = Date.now() % 100000 + i; // unique-ish per cycle; path collisions impossible across cycles due to cycle-pid suffix
    await tx.run(
      `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
       VALUES (${Array(20).fill('?').join(',')})`,
      [`soak ${process.pid}-${i}`, 200.5, 0, `C:\\soak\\${process.pid}-${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    );
  }
});
process.send({ type: 'tx-committed' });
// hold the connection open (WAL not checkpointed) until the parent kills us
await new Promise(() => {});
