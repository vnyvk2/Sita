// Phase 16 — Electron runtime verification for node:sqlite.
// 1. ELECTRON_RUN_AS_NODE=1: confirms node:sqlite (DatabaseSync + FTS5 trigram) inside
//    Electron's bundled Node runtime (the same runtime that would execute Nora's main process code paths).
// 2. Real Electron main process (app ready): opens a disk-backed DatabaseSync inside the
//    actual Electron main process, runs a query + FTS query, closes. This is the definitive
//    packaging-independent check (node:sqlite is compiled into Electron's Node, no native module to unpack).
// The Electron binary comes from Nora's devDependency install (node_modules/electron).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { POC_ROOT, saveResults } from '../lib/util.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// locate electron
const repoRoot = path.join(POC_ROOT, '..');
const candidates = [
  path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
  path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron')
];
const electronBin = candidates.find(existsSync);
if (!electronBin) {
  console.error('Electron binary not found. Run: npm ci (repo root)');
  process.exit(1);
}
const electronVersion = spawnSync(electronBin, ['--version'], { encoding: 'utf8' }).stdout.trim();

const results = { electronBinary: electronBin, electronVersion };

// ---- 1. ELECTRON_RUN_AS_NODE (Electron's Node runtime)
{
  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(':memory:');
    d.exec("CREATE VIRTUAL TABLE fts USING fts5(title, content='', tokenize='trigram')");
    d.prepare("INSERT INTO fts(rowid, title) VALUES (1, 'golden hour memories')").run();
    const rows = d.prepare("SELECT rowid FROM fts WHERE fts MATCH 'golden'").all();
    d.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    d.prepare('INSERT INTO t (v) VALUES (?)').run('hello from electron');
    console.log(JSON.stringify({ ok: true, node: process.version, sqlite: d.prepare('select sqlite_version() v').get().v, ftsHits: rows.length }));
  `;
  const scriptPath = path.join(mkdtempSync(path.join(tmpdir(), 'nora-poc-')), 'probe.cjs');
  writeFileSync(scriptPath, script);
  const r = spawnSync(electronBin, [scriptPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 60000
  });
  try {
    const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    results.runAsNode = { ...JSON.parse(line), success: r.status === 0 };
    console.log(`ELECTRON_RUN_AS_NODE: node=${results.runAsNode.node} sqlite=${results.runAsNode.sqlite} ftsHits=${results.runAsNode.ftsHits} success=${results.runAsNode.success}`);
  } catch {
    results.runAsNode = { success: false, stdout: r.stdout?.slice(0, 300), stderr: r.stderr?.slice(0, 300) };
    console.log('ELECTRON_RUN_AS_NODE: FAILED', r.stderr?.slice(0, 300));
  }
}

// ---- 2. real Electron main process (app.whenReady + disk-backed DB in userData-like dir)
{
  const dbDir = mkdtempSync(path.join(tmpdir(), 'nora-poc-electron-'));
  const script = `
    const { app } = require('electron');
    const { DatabaseSync } = require('node:sqlite');
    const path = require('node:path');
    app.whenReady().then(() => {
      try {
        const dbPath = path.join(${JSON.stringify(dbDir)}, 'electron-main.db');
        const db = new DatabaseSync(dbPath);
        db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
        db.exec('CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT, title_ci TEXT GENERATED ALWAYS AS (lower(title)) STORED)');
        for (let i = 0; i < 1000; i++) db.prepare('INSERT INTO songs (title) VALUES (?)').run('Song ' + i);
        const byId = db.prepare('SELECT title FROM songs WHERE id = ?').get(500);
        db.exec("CREATE VIRTUAL TABLE fts_songs USING fts5(title_ci, content='', tokenize='trigram')");
        db.prepare("INSERT INTO fts_songs(rowid, title_ci) SELECT id, title_ci FROM songs").run();
        const hits = db.prepare("SELECT s.title FROM fts_songs f JOIN songs s ON s.id = f.rowid WHERE fts_songs MATCH ? LIMIT 5").all('"song 50"');
        const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
        const sqliteVersion = db.prepare('select sqlite_version() v').get().v;
        db.close();
        console.log(JSON.stringify({ ok: true, mainProcess: true, node: process.version, sqlite: sqliteVersion, byId: byId.title, ftsHits: hits.length, integrity, userData: app.getPath('userData') }));
      } catch (e) {
        console.log(JSON.stringify({ ok: false, error: e.message }));
      } finally {
        app.quit();
      }
    });
  `;
  const scriptPath = path.join(dbDir, 'main-probe.cjs');
  writeFileSync(scriptPath, script);
  const r = spawnSync(electronBin, [scriptPath, '--no-sandbox'], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' }
  });
  try {
    const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    results.realMainProcess = JSON.parse(line);
    console.log(`REAL ELECTRON MAIN PROCESS: ok=${results.realMainProcess.ok} byId=${results.realMainProcess.byId} ftsHits=${results.realMainProcess.ftsHits} integrity=${results.realMainProcess.integrity}`);
  } catch {
    results.realMainProcess = { ok: false, stdout: r.stdout?.slice(0, 500), stderr: r.stderr?.slice(0, 500) };
    console.log('REAL ELECTRON MAIN PROCESS: FAILED', results.realMainProcess);
  }
}

results.summary = {
  nodeSqliteAvailableInElectron: results.runAsNode?.success === true || results.realMainProcess?.ok === true,
  worksInRealMainProcess: results.realMainProcess?.ok === true,
  fts5TrigramAvailable: (results.realMainProcess?.ftsHits ?? 0) > 0,
  electronNode: results.realMainProcess?.node,
  electronSqlite: results.realMainProcess?.sqlite,
  note: 'node:sqlite is compiled into Electron\'s bundled Node — no native module, no electron-rebuild, no asarUnpack changes, no npmRebuild. Packaged-app verification (electron-builder --dir) still recommended before ship; this probe covers the runtime capability.'
};

console.log(JSON.stringify(results.summary, null, 1));
await saveResults('electron-runtime', results);
