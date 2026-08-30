// Phase 10 — Concurrency: SQLite's locking model vs PGlite's single-connection model,
// mapped onto Nora's real architecture (ALL DB access lives in the main process;
// utilityProcess workers never touch the DB — enforced invariant in mediaWorker.ts:1-9).
//
// Tested (real desktop-shaped workloads, not artificial parallel hammering):
//   1. multiple reader connections on one file (WAL) — 4 concurrent readers
//   2. read during write (reader active while a batch tx commits)
//   3. queued writers: two writer connections contending (busy_timeout behavior)
//   4. PGlite equivalent: serialized query queue (PGlite serializes internally)
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { SQLITE_DDL } from '../schema/sqlite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo, stats } from '../lib/util.mjs';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const SIZE = Number(process.argv[2] ?? 50000);
const results = { engines: {} };

// ---------- SQLite (WAL, multi-connection) ----------
{
  const dbPath = path.join(POC_ROOT, 'data', `sqlite-${SIZE}.db`);
  const main = await openSqlite(dbPath);
  results.engines.sqlite = {};

  // 1. four concurrent readers
  {
    const readers = Array.from({ length: 4 }, (_, i) => new DatabaseSync(dbPath));
    readers.forEach((r) => r.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;'));
    const times = [];
    let rowsTotal = 0;
    const t0 = performance.now();
    await Promise.all(readers.map(async (r) => {
      const s = performance.now();
      const rows = r.prepare('SELECT id, title FROM songs WHERE is_blacklisted = 0 ORDER BY title LIMIT 2000').all();
      times.push(performance.now() - s);
      rowsTotal += rows.length;
    }));
    results.engines.sqlite.concurrent_4_readers = {
      totalMs: Math.round(performance.now() - t0), perReader: stats(times), rows: rowsTotal
    };
    readers.forEach((r) => r.close());
  }

  // 2. read during write: one writer committing a batch while readers query
  {
    const reader = new DatabaseSync(dbPath);
    reader.exec('PRAGMA busy_timeout=5000;');
    const readTimes = [];
    const writer = main;
    const writePromise = (async () => {
      await writer.tx(async (tx) => {
        for (let i = 0; i < 2000; i++) {
          await tx.run(
            `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
             VALUES (${Array(20).fill('?').join(',')})`,
            [`concurrent write ${i}`, 200.5, 0, `C:\\conc\\${process.pid}-${i}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
          );
        }
      });
    })();
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      reader.prepare('SELECT COUNT(*) c FROM songs').get();
      readTimes.push(performance.now() - s);
      await new Promise((r) => setTimeout(r, 25));
    }
    await writePromise;
    results.engines.sqlite.read_during_write = { reads: stats(readTimes) };
    // cleanup
    main.run(`DELETE FROM songs WHERE path LIKE ?`, [`C:\\conc\\${process.pid}%`]);
    reader.close();
  }

  // 3. two writer connections contending (busy_timeout honored?)
  {
    const w1 = new DatabaseSync(dbPath);
    const w2 = new DatabaseSync(dbPath);
    w1.exec('PRAGMA busy_timeout=5000;');
    w2.exec('PRAGMA busy_timeout=5000;');
    let contentionError = null;
    const t0 = performance.now();
    try {
      await Promise.all([
        (async () => {
          w1.exec('BEGIN');
          w1.prepare('UPDATE songs SET skip_count = skip_count + 1 WHERE id = 1').run();
          await new Promise((r) => setTimeout(r, 100)); // hold the write lock
          w1.prepare('UPDATE songs SET skip_count = skip_count + 1 WHERE id = 2').run();
          w1.exec('COMMIT');
        })(),
        (async () => {
          await new Promise((r) => setTimeout(r, 20)); // w2 starts while w1 holds the write lock
          w2.prepare('UPDATE songs SET skip_count = skip_count + 1 WHERE id = 3').run();
        })()
      ]);
    } catch (e) {
      contentionError = e.message;
    }
    results.engines.sqlite.two_writer_contention = {
      totalMs: Math.round(performance.now() - t0),
      error: contentionError,
      note: contentionError ? 'second writer hit SQLITE_BUSY beyond busy_timeout while tx held lock' : 'busy_timeout absorbed the contention (second writer waited for the first tx to commit)'
    };
    w1.close(); w2.close();
  }

  await main.close();
}

// ---------- PGlite (single connection, serialized) ----------
{
  const pg = await openPglite(path.join(POC_ROOT, 'data', `pglite-${SIZE}`));
  results.engines.pglite = {};

  // 1. four "concurrent" readers — PGlite serializes internally
  {
    const times = [];
    const t0 = performance.now();
    await Promise.all(Array.from({ length: 4 }, async () => {
      const s = performance.now();
      await pg.all('SELECT id, title FROM songs WHERE is_blacklisted = false ORDER BY title LIMIT 2000');
      times.push(performance.now() - s);
    }));
    results.engines.pglite.concurrent_4_readers = { totalMs: Math.round(performance.now() - t0), perReader: stats(times) };
  }

  // 2. reads during a write tx — PGlite queries queue behind the tx
  {
    const readTimes = [];
    const writePromise = (async () => {
      await pg.tx(async (tx) => {
        for (let i = 0; i < 2000; i++) {
          await tx.run(
            `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
             VALUES (${Array.from({ length: 20 }, (_, k) => `$${k + 1}`).join(',')})`,
            [`concurrent write ${i}`, 200.5, 0, `C:\\conc\\pg-${process.pid}-${i}.mp3`, false, 44100, 192000, 2, 2020, 1, 1, 1, false, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
          );
        }
      });
    })();
    // note: PGlite would serialize these behind the tx; issue them anyway
    const readPromise = (async () => {
      for (let i = 0; i < 20; i++) {
        const s = performance.now();
        await pg.all('SELECT COUNT(*) c FROM songs');
        readTimes.push(performance.now() - s);
        await new Promise((r) => setTimeout(r, 25));
      }
    })();
    await Promise.all([writePromise, readPromise]);
    results.engines.pglite.read_during_write = { reads: stats(readTimes) };
    await pg.run(`DELETE FROM songs WHERE path LIKE ?`, [`C:\\conc\\\\pg-${process.pid}%`]).catch(async () => {
      // PG LIKE backslash escape — double them
      await pg.run(`DELETE FROM songs WHERE path LIKE ?`, [`C:\\\\conc\\\\pg-${process.pid}%`]);
    });
  }

  await pg.close();
}

console.log(JSON.stringify(results, null, 1));
await saveResults('concurrency', { size: SIZE, env: envInfo(), results });
