// Shared benchmark utilities: deterministic PRNG, timing, percentiles, result persistence.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const POC_ROOT = path.resolve(here, '..', '..');
export const RESULTS_DIR = path.join(POC_ROOT, 'results');
export const DATA_DIR = path.join(POC_ROOT, 'data');
mkdirSync(RESULTS_DIR, { recursive: true });

// ---------------------------------------------------------------- PRNG
/** mulberry32 — deterministic, fast, good enough for synthetic data. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- timing
export const now = () => performance.now();

export async function timeAsync(fn) {
  const t0 = performance.now();
  const out = await fn();
  return { ms: performance.now() - t0, out };
}

export function timeSync(fn) {
  const t0 = performance.now();
  const out = fn();
  return { ms: performance.now() - t0, out };
}

const round = (v) => Math.round(v * 1000) / 1000;

export function stats(samples) {
  if (!samples.length) return { n: 0 };
  const s = [...samples].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    min: round(s[0]),
    median: round(s[Math.floor(s.length / 2)]),
    p95: round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]),
    max: round(s[s.length - 1]),
    mean: round(sum / s.length)
  };
}

// ---------------------------------------------------------------- results
const registry = new Map();

export function record(suite, entry) {
  if (!registry.has(suite)) registry.set(suite, []);
  registry.get(suite).push(entry);
  console.log(`  [${suite}] ${JSON.stringify(entry)}`);
}

export function envInfo() {
  const cpus = os.cpus();
  return {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: cpus[0]?.model?.trim(),
    cores: cpus.length,
    totalMemGb: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
    node: process.version
  };
}

export async function saveResults(name, extra = {}) {
  const payload = {
    name,
    recordedAt: new Date().toISOString(),
    host: envInfo(),
    ...extra,
    suites: Object.fromEntries(registry)
  };
  const file = path.join(RESULTS_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`\nResults -> ${file}`);
  return payload;
}
