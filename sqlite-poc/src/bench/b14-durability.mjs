// b14 — DURABILITY: synchronous=NORMAL vs synchronous=FULL (WAL) on Windows.
//
// Why: WAL + synchronous=NORMAL guarantees committed transactions survive an APPLICATION
// crash, but a POWER/OS failure may roll back the last commits (never corrupts).
// synchronous=FULL fsyncs the WAL on every commit — durable against power loss too.
// Nora's data (a music library the user curates over months) may warrant FULL if the
// userData dir can land on removable/unsynced media. This suite measures the cost.
//
// Part A — throughput: 1000 transactions x 10 rows (commit-heavy, where fsync cost shows)
// Part B — kill soak: 15 cycles per mode of {open, begin, insert batch, commit, SIGKILL at a
//          random moment, reopen, integrity_check + atomicity check}. Neither mode may ever
//          corrupt or partially apply a transaction.
import { fork } from 'node:child_process';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { SQLITE_DDL } from '../schema/sqlite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo, makeRng } from '../lib/util.mjs';
import { performance } from 'node:perf_hooks';

const results = { modes: {} };

// ---------- Part A: throughput ----------
for (const mode of ['NORMAL', 'FULL']) {
  const dbPath = path.join(POC_ROOT, 'data', `durability-${mode.toLowerCase()}.db`);
  rmSync(dbPath, { force: true });
  rmSync(dbPath + '-wal', { force: true });
  rmSync(dbPath + '-shm', { force: true });
  const e = await openSqlite(dbPath, { ddl: SQLITE_DDL, pragmas: [
    `PRAGMA journal_mode = WAL;`,
    `PRAGMA synchronous = ${mode};`,
    'PRAGMA busy_timeout = 5000;',
    'PRAGMA foreign_keys = ON;',
    'PRAGMA temp_store = MEMORY;'
  ] });
  e.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\dur', 'D']);

  // commit-heavy: 1000 txs x 10 rows
  const t0 = performance.now();
  for (let t = 0; t < 1000; t++) {
    await e.tx(async (tx) => {
      for (let i = 0; i < 10; i++) {
        const n = t * 10 + i;
        await tx.run(
          `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
           VALUES (${Array(20).fill('?').join(',')})`,
          [`dur ${n}`, 200.5, 0, `C:\\dur\\${n}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
        );
      }
    });
  }
  const ms = performance.now() - t0;
  const count = e.get('SELECT COUNT(*) c FROM songs').c;

  // one-tx bulk (fsync amortized — where the modes should converge)
  const t1 = performance.now();
  await e.tx(async (tx) => {
    for (let n = 10000; n < 20000; n++) {
      await tx.run(
        `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at)
         VALUES (${Array(20).fill('?').join(',')})`,
        [`bulk ${n}`, 200.5, 0, `C:\\dur\\b${n}.mp3`, 0, 44100, 192000, 2, 2020, 1, 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
      );
    }
  });
  const bulkMs = performance.now() - t1;
  const closeMs = await e.close();

  results.modes[mode] = {
    commitHeavy: { txs: 1000, rowsPerTx: 10, totalMs: Math.round(ms), commitsPerSec: Math.round(1000 / (ms / 1000)) },
    singleBulkTx: { rows: 10000, ms: Math.round(bulkMs) },
    songsAfter: count,
    closeMs: Math.round(closeMs)
  };
  console.log(`${mode}: commit-heavy ${results.modes[mode].commitHeavy.commitsPerSec} commits/s (${Math.round(ms / 1000)}s) | bulk 10k in ${Math.round(bulkMs)}ms | close ${Math.round(closeMs)}ms`);
}

// ---------- Part B: kill soak (child does the writes; parent kills mid-flight) ----------
const SOAK_CHILD = path.join(POC_ROOT, 'src', 'bench', 'durability-child.mjs');
const CYCLES = 15;
const BATCH = 50;

function runSoakCycle(mode, dbPath, delayMs, expectBefore) {
  return new Promise((resolve) => {
    const child = fork(SOAK_CHILD, [mode, dbPath, String(BATCH)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    let killed = false;
    child.on('message', (msg) => {
      if (msg.type === 'tx-started' || msg.type === 'tx-committed') {
        // kill at a random point in the commit window — mid-tx or just after commit
        setTimeout(() => {
          killed = true;
          try { child.kill('SIGKILL'); } catch { /* nop */ }
          resolve({ killed: true, signal: 'SIGKILL' });
        }, delayMs);
      }
    });
    child.on('exit', (code, signal) => {
      if (!killed) resolve({ killed: false, exitCode: code, err: err.slice(-200) });
    });
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* nop */ } resolve({ killed: true, timeout: true }); }, 30000);
  });
}

for (const mode of ['NORMAL', 'FULL']) {
  const dbPath = path.join(POC_ROOT, 'data', `soak-${mode.toLowerCase()}.db`);
  rmSync(dbPath, { force: true });
  rmSync(dbPath + '-wal', { force: true });
  rmSync(dbPath + '-shm', { force: true });
  // seed
  const seed = await openSqlite(dbPath, { ddl: SQLITE_DDL, pragmas: [`PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = ${mode};`, 'PRAGMA foreign_keys = ON;'] });
  seed.run(`INSERT INTO music_folders (path, name) VALUES (?, ?)`, ['C:\\soak', 'S']);
  await seed.close();

  const rng = makeRng(mode === 'FULL' ? 99 : 77);
  const cycles = [];
  let expected = 0;
  let corrupt = 0;
  let partialApplied = 0;

  for (let c = 0; c < CYCLES; c++) {
    // kill somewhere between 0ms (mid-tx likely) and 400ms (post-commit likely)
    const delay = Math.floor(rng() * 400);
    const killRes = await runSoakCycle(mode, dbPath, delay, expected);
    await new Promise((r) => setTimeout(r, 300));

    // reopen + verify
    const e = await openSqlite(dbPath, { pragmas: [`PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = ${mode};`, 'PRAGMA foreign_keys = ON;'] });
    const integrity = e.get('PRAGMA integrity_check').integrity_check;
    const count = e.get('SELECT COUNT(*) c FROM songs').c;
    const ftsCount = e.get('SELECT COUNT(*) c FROM fts_songs').c;
    e.close();
    const possible = [expected, expected + BATCH];
    const ok = integrity === 'ok' && possible.includes(count);
    if (integrity !== 'ok') corrupt++;
    if (!possible.includes(count)) partialApplied++;
    expected = count; // next cycle continues from whatever committed
    cycles.push({ cycle: c + 1, killDelayMs: delay, killed: killRes.killed, integrity, songs: count, fts: ftsCount, atomic: possible.includes(count) });
    console.log(`  ${mode} cycle ${c + 1}: kill@${delay}ms integrity=${integrity} songs=${count} (expected one of ${possible.join('/')}) ${ok ? 'OK' : '!!!'}`);
  }
  results.modes[mode].soak = {
    cycles: CYCLES,
    batchRows: BATCH,
    corruptEvents: corrupt,
    partialApplicationEvents: partialApplied,
    finalSongs: expected,
    detail: cycles,
    verdict: corrupt === 0 && partialApplied === 0 ? 'NO CORRUPTION, NO PARTIAL TRANSACTIONS across all kill cycles' : 'FAILURE'
  };
  console.log(`${mode} soak: ${results.modes[mode].soak.verdict}`);
}

results.note = {
  normalSemantics: 'WAL + synchronous=NORMAL: committed txs survive app crashes; an OS/power failure may roll back the most recent commits (never corrupts).',
  fullSemantics: 'WAL + synchronous=FULL: committed txs survive power loss (fsync per commit).',
  recommendationInput: 'see commitsPerSec delta — with SQLite ~19x faster than PGlite on Nora-shaped ingestion, FULL stays well above PGlite-NORMAL throughput; Nora can afford FULL if userData may be on removable media.'
};

await saveResults('durability', { env: envInfo(), results });
