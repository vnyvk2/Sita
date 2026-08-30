// Crash writer child: opens the DB, starts a transaction, inserts nBefore rows,
// signals the parent (still inside the open transaction), then gets SIGKILLed.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { SQLITE_DDL } from '../schema/sqlite-ddl.mjs';
import { PGLITE_DDL_FULL } from '../schema/pglite-ddl.mjs';

const engine = process.argv[2];
const dbPath = process.argv[3];
const nBefore = Number(process.argv[4]);
const delayMs = Number(process.argv[5]);

const e = engine === 'sqlite'
  ? await openSqlite(dbPath, { ddl: SQLITE_DDL })
  : await openPglite(dbPath, { ddl: PGLITE_DDL_FULL });

await e.tx(async (tx) => {
  for (let i = 0; i < nBefore; i++) {
    if (engine === 'sqlite') {
      await tx.run(
        `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
         VALUES (${Array(20).fill('?').join(',')})`,
        [`crash ${i}`, 200.5, 0, `C:\\crash\\${process.pid}-${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
      );
    } else {
      await tx.run(
        `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
         VALUES (${Array.from({ length: 20 }, (_, k) => `$${k + 1}`).join(',')})`,
        [`crash ${i}`, 200.5, 0, `C:\\crash\\${process.pid}-${i}.mp3`, false, 44100, 192000, 2, 2020, 1, 1, 1, false, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
      );
    }
  }
  // signal parent: we are INSIDE the open transaction with nBefore uncommitted rows
  process.send({ type: 'in-transaction', inserted: nBefore });
  await new Promise((r) => setTimeout(r, delayMs)); // parent kills us here
});
