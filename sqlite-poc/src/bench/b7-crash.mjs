// Phase 11 — Crash / recovery: process termination mid-transaction, reopen, verify.
// Parent forks a writer child that begins a transaction, inserts rows, then is SIGKILLed
// mid-transaction. Parent reopens the DB and verifies atomicity + integrity.
// Compares: SQLite WAL recovery vs PGlite crash behavior (data-dir WAL replay).
import { fork } from 'node:child_process';
import path from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { SQLITE_DDL } from '../schema/sqlite-ddl.mjs';
import { PGLITE_DDL_FULL } from '../schema/pglite-ddl.mjs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';

const CHILD = path.join(POC_ROOT, 'src', 'bench', 'crash-child.mjs');
const results = { engines: {} };

function forkCrashChild(engine, dbPath, nBefore, delayMs) {
  return new Promise((resolve) => {
    const child = fork(CHILD, [engine, dbPath, String(nBefore), String(delayMs)], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('message', (msg) => {
      if (msg.type === 'in-transaction') {
        // hard-kill NOW (mid-transaction)
        child.kill('SIGKILL');
        resolve({ killed: true, pid: child.pid, childLog: out.trim(), childErr: err.trim() });
      }
    });
    child.on('exit', (code, signal) => {
      if (signal === 'SIGKILL') return; // our own kill; message handler resolves
      resolve({ killed: false, exitCode: code, childLog: out.trim(), childErr: err.trim().split('\n').slice(-4).join(' | ') });
    });
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve({ killed: true, timeout: true }); }, 60000);
  });
}

const SCENARIOS = [
  { name: 'kill_1000ms_into_tx', nBefore: 500, delayMs: 1000 },
  { name: 'kill_300ms_into_tx', nBefore: 50, delayMs: 300 }
];

for (const eng of ['sqlite', 'pglite']) {
  results.engines[eng] = {};
  for (const sc of SCENARIOS) {
    const dbPath = eng === 'sqlite'
      ? path.join(POC_ROOT, 'data', 'crash-test.db')
      : path.join(POC_ROOT, 'data', 'crash-test-pg');
    rmSync(eng === 'sqlite' ? dbPath : dbPath, { force: true, recursive: true });
    rmSync(dbPath + '-wal', { force: true });
    rmSync(dbPath + '-shm', { force: true });

    // seed
    if (eng === 'sqlite') {
      const e = await openSqlite(dbPath, { ddl: SQLITE_DDL });
      e.run(`INSERT INTO music_folders (path, name) VALUES ('C:\\crash', 'CrashTest')`);
      await e.close();
    } else {
      const e = await openPglite(dbPath, { ddl: PGLITE_DDL_FULL });
      await e.run(`INSERT INTO music_folders (path, name) VALUES ('C:\\crash', 'CrashTest')`);
      await e.close();
    }

    // fork + kill mid-tx
    const killRes = await forkCrashChild(eng, dbPath, sc.nBefore, sc.delayMs);
    await new Promise((r) => setTimeout(r, 500)); // let the OS reap

    // reopen + verify
    const e = eng === 'sqlite'
      ? await openSqlite(dbPath)
      : await openPglite(dbPath);
    const count = eng === 'sqlite' ? e.get('SELECT COUNT(*) c FROM songs').c : (await e.get('SELECT COUNT(*) c FROM songs')).c;
    let integrity = 'n/a';
    if (eng === 'sqlite') {
      integrity = e.get('PRAGMA integrity_check').integrity_check;
    } else {
      // PGlite: no PRAGMA; sanity = the DB opens and answers
      integrity = 'opened-ok';
    }
    await e.close();

    results.engines[eng][sc.name] = {
      killConfirmed: killRes.killed,
      exitCode: killRes.exitCode,
      childErr: killRes.childErr,
      songsAfterCrash: count,
      expected: 'exactly 0 (uncommitted transaction rolled back)',
      integrity,
      atomicityPreserved: count === 0
    };
    console.log(`${eng}/${sc.name}: killed=${killRes.killed}${killRes.killed ? '' : ` exit=${killRes.exitCode} err=${killRes.childErr}`} songsAfterCrash=${count} integrity=${integrity} -> ${count === 0 ? 'ROLLBACK OK' : '!!! UNCOMMITTED DATA SURVIVED'}`);
  }
}

await saveResults('crash', { env: envInfo(), results });
