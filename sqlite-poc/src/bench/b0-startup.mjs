// Phase 4 — Startup benchmark: PGlite vs node:sqlite.
//
// Measures, in FRESH child processes (true cold start each iteration):
//   1. engine create (PGlite.create vs new DatabaseSync + pragmas)
//   2. extensions / pragmas
//   3. schema init (verify-DDL exec)
//   4. drizzle init
//   5. first query (SELECT 1)
//   6. first meaningful query (join across songs/albums/artists LIMIT 100)
//   7. close
//
// Both engines run against the SAME populated disk-backed dataset (data/sqlite-<size>.db
// / data/pglite-<size>). 7 iterations per condition; median/min/max reported, outliers kept.
// "Cold" = fresh OS process; OS page cache is warm for both after run 1 (matches Nora's
// real-world restart pattern). True disk-cold measurement is noted as a limitation.
import { fork } from 'node:child_process';
import path from 'node:path';
import { statSync, existsSync, readdirSync } from 'node:fs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';

const SIZES = [1300, 50000];
const ITERATIONS = 7;
const CHILD = path.join(POC_ROOT, 'src', 'bench', 'startup-child.mjs');

function runChild(engine, size) {
  return new Promise((resolve, reject) => {
    const child = fork(CHILD, [engine, String(size)], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`child timeout: ${engine} ${size}: ${err || out}`));
    }, 300000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`child exit ${code}: ${err || out}`));
      try {
        resolve(JSON.parse(out.trim().split('\n').pop()));
      } catch {
        reject(new Error(`child output parse failed: ${out}\n${err}`));
      }
    });
  });
}

function dirSizeMb(dir) {
  const bytes = dirBytes(dir);
  return Math.round((bytes / 1048576) * 10) / 10;
}

function dirBytes(dir) {
  let total = 0;
  if (!existsSync(dir)) return 0;
  for (const f of readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (statSync(fp).isDirectory()) total += dirBytes(fp);
    else total += statSync(fp).size;
  }
  return total;
}

const results = { sizes: {} };

for (const size of SIZES) {
  const sqliteDb = path.join(POC_ROOT, 'data', `sqlite-${size}.db`);
  const pgliteDir = path.join(POC_ROOT, 'data', `pglite-${size}`);
  if (!existsSync(sqliteDb) || !existsSync(pgliteDir)) {
    console.error(`Missing populated DBs for size ${size}. Run: node src/populate.mjs ${size} both`);
    process.exit(1);
  }
  results.sizes[size] = {
    sqliteMb: Math.round((statSync(sqliteDb).size / 1048576) * 10) / 10,
    pgliteMb: dirSizeMb(pgliteDir),
    runs: {}
  };
  console.log(`\n=== size ${size} (sqlite ${results.sizes[size].sqliteMb} MB, pglite ${results.sizes[size].pgliteMb} MB) ===`);

  for (const engine of ['sqlite', 'pglite']) {
    const runs = [];
    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const r = await runChild(engine, size);
        runs.push(r);
        console.log(`  ${engine} run ${i + 1}: create=${r.engineCreateMs?.toFixed(0)}ms ext/pragma=${(r.extensionsMs ?? r.pragmaMs ?? 0)?.toFixed(0)}ms drizzle=${r.drizzleInitMs?.toFixed(1)}ms firstQ=${r.firstQueryMs?.toFixed(1)}ms meaningful=${r.firstMeaningfulQueryMs?.toFixed(1)}ms close=${r.closeMs?.toFixed(0)}ms`);
      } catch (e) {
        console.log(`  ${engine} run ${i + 1}: FAILED ${e.message.split('\n')[0]}`);
        runs.push({ error: e.message });
      }
    }
    results.sizes[size].runs[engine] = runs;
  }
}

await saveResults('startup', {
  method: 'forked fresh process per iteration; populated disk-backed DBs; warm OS page cache',
  env: envInfo(),
  results
});
