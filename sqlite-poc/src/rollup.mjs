// Merges results/*.json into the final benchmark-results.json deliverable.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const RESULTS_DIR = path.join(here, '..', 'results');

const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json') && f !== 'search-detail.json');
const suites = {};
for (const f of files.sort()) {
  try {
    suites[f.replace('.json', '')] = JSON.parse(readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
  } catch (e) {
    suites[f] = { error: String(e) };
  }
}

// drizzle / engine versions
let versions = {};
try {
  const repoRoot = path.resolve(here, '..', '..');
  versions = {
    drizzleOrm: JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'drizzle-orm', 'package.json'), 'utf8')).version,
    pglite: JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', '@electric-sql', 'pglite', 'package.json'), 'utf8')).version,
    electron: JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    node: process.version
  };
} catch (e) { versions = { error: String(e) }; }

const payload = {
  name: 'nora-sqlite-poc benchmark results',
  generatedAt: new Date().toISOString(),
  environment: {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()[0]?.model?.trim(),
    cores: os.cpus().length,
    totalMemGb: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
    node: process.version,
    versions
  },
  reproduction: 'See README.md — each suite is a standalone script: node src/bench/b<N>-<name>.js',
  suites
};

writeFileSync(path.join(here, '..', 'benchmark-results.json'), JSON.stringify(payload, null, 2));
console.log(`benchmark-results.json written with suites: ${Object.keys(suites).join(', ')}`);
