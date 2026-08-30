// b15 — PACKAGED-BUILD verification (Phase 16 completion):
//   1. electron-builder --dir packages the REAL Nora app (run separately at repo root).
//   2. Probe A: node:sqlite + FTS5 inside the PACKAGED Nora binary (ELECTRON_RUN_AS_NODE
//      on dist/win-unpacked/Nora.exe — the exact packaged electron.exe).
//   3. Probe B: a minimal asar-packaged Electron app (real packaged MAIN PROCESS, no
//      ELECTRON_RUN_AS_NODE) built with the repo's own electron-builder, whose main probes
//      node:sqlite at app ready and writes a result file.
import { spawnSync, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { POC_ROOT, saveResults } from '../lib/util.mjs';

const repoRoot = path.join(POC_ROOT, '..');
const results = {};

// ---------- Probe A: packaged Nora binary ----------
const packagedExe = path.join(repoRoot, 'dist', 'win-unpacked', 'Nora.exe');
results.packagedNoraExists = existsSync(packagedExe);
if (results.packagedNoraExists) {
  const probe = `
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(':memory:');
    d.exec("CREATE VIRTUAL TABLE fts USING fts5(t, content='', tokenize='trigram')");
    d.prepare("INSERT INTO fts(rowid, t) VALUES (1, 'golden hour')").run();
    const hits = d.prepare("SELECT rowid FROM fts WHERE fts MATCH 'golden'").all();
    d.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    d.prepare('INSERT INTO t (v) VALUES (?)').run('packaged ok');
    console.log(JSON.stringify({ ok: true, node: process.version, sqlite: d.prepare('select sqlite_version() v').get().v, ftsHits: hits.length }));
  `;
  const probePath = path.join(POC_ROOT, 'data', 'packaged-probe.cjs');
  writeFileSync(probePath, probe);
  const r = spawnSync(packagedExe, [probePath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8', timeout: 60000
  });
  try {
    const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    results.probeA_packagedBinary = JSON.parse(line);
  } catch {
    results.probeA_packagedBinary = { ok: false, stderr: (r.stderr || '').slice(0, 300), stdout: (r.stdout || '').slice(0, 300) };
  }
  console.log('Probe A (packaged Nora.exe, ELECTRON_RUN_AS_NODE):', JSON.stringify(results.probeA_packagedBinary));
} else {
  console.log('Probe A skipped: dist/win-unpacked/Nora.exe not found (build Nora first: npm run build && npx electron-builder --dir --publish=never)');
}

// ---------- Probe B: minimal asar-packaged app, real main process ----------
{
  const appDir = path.join(POC_ROOT, 'data', 'packaged-probe-app');
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });
  const mainCjs = `
    const { app } = require('electron');
    const { DatabaseSync } = require('node:sqlite');
    const fs = require('node:fs');
    const path = require('node:path');
    const resultPath = path.join(os.tmpdir(), 'sqlite-probe-result.json');
    app.whenReady().then(() => {
      const out = { packaged: app.isPackaged, exePath: process.execPath };
      try {
        const dbPath = path.join(app.getPath('userData'), 'probe.db');
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
        const db = new DatabaseSync(dbPath);
        db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
        db.exec('CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT, title_ci TEXT GENERATED ALWAYS AS (lower(title)) STORED)');
        for (let i = 0; i < 500; i++) db.prepare('INSERT INTO songs (title) VALUES (?)').run('Packaged Song ' + i);
        db.exec("CREATE VIRTUAL TABLE fts_songs USING fts5(title_ci, content='', tokenize='trigram')");
        db.prepare('INSERT INTO fts_songs(rowid, title_ci) SELECT id, title_ci FROM songs').run();
        const hits = db.prepare("SELECT s.title FROM fts_songs f JOIN songs s ON s.id = f.rowid WHERE fts_songs MATCH ? LIMIT 3").all('"packaged song"');
        out.ok = true;
        out.sqlite = db.prepare('select sqlite_version() v').get().v;
        out.node = process.versions.node;
        out.byId = db.prepare('SELECT title FROM songs WHERE id = ?').get(250).title;
        out.ftsHits = hits.length;
        out.integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
        db.close();
      } catch (e) {
        out.ok = false;
        out.error = e.message;
      }
      fs.writeFileSync(resultPath, JSON.stringify(out, null, 1));
      app.quit();
    });
  `;
  writeFileSync(path.join(appDir, 'main.cjs'), mainCjs);
  writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'sqlite-packaged-probe',
    version: '1.0.0',
    main: 'main.cjs',
    devDependencies: { electron: JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8')).version }
  }, null, 2));

  // electron-builder config: minimal, asar on (default), portable dir target
  writeFileSync(path.join(appDir, 'electron-builder.yml'), [
    'appId: net.nora.sqlite-probe',
    'productName: SqliteProbe',
    'directories:',
    '  output: dist',
    'files:',
    '  - main.cjs',
    '  - package.json',
    'asar: true'
  ].join('\n'));

  // install nothing: point electron-builder at the repo's electron + use its binary
  const build = spawnSync('npx', ['electron-builder', '--dir', '--publish=never', '-c.electronDist=' + path.join(repoRoot, 'node_modules', 'electron', 'dist')], {
    cwd: appDir, encoding: 'utf8', timeout: 300000, shell: true
  });
  const probeExe = path.join(appDir, 'dist', 'win-unpacked', 'SqliteProbe.exe');
  results.probeB_packagedAppBuilt = existsSync(probeExe);
  if (!results.probeB_packagedAppBuilt) {
    results.probeB_buildLog = (build.stdout + build.stderr).slice(-800);
    console.log('Probe B build FAILED:', results.probeB_buildLog);
  } else {
    spawnSync(probeExe, [], { encoding: 'utf8', timeout: 120000 });
    // GUI-subsystem apps can outlive spawnSync bookkeeping; poll for the result file
    let resultText = null;
    for (let i = 0; i < 30 && !resultText; i++) {
      try { resultText = readFileSync(os.tmpdir() + '/sqlite-probe-result.json', 'utf8'); } catch { execSync('timeout /t 1 >nul', { shell: true }); }
    }
    try {
      results.probeB_packagedApp = JSON.parse(resultText);
    } catch {
      results.probeB_packagedApp = { ok: false, note: 'result file not written', stderr: (r.stderr || '').slice(0, 300) };
    }
    console.log('Probe B (asar-packaged app, real main process):', JSON.stringify(results.probeB_packagedApp));
  }
}

results.summary = {
  packagedNoraBinaryWorks: results.probeA_packagedBinary?.ok === true,
  asarPackagedMainProcessWorks: results.probeB_packagedApp?.ok === true,
  fts5InPackagedApp: (results.probeB_packagedApp?.ftsHits ?? 0) > 0 || (results.probeA_packagedBinary?.ftsHits ?? 0) > 0
};
console.log(JSON.stringify(results.summary, null, 1));
await saveResults('packaged-build', results);
