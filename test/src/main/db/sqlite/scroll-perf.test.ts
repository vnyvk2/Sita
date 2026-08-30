import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Runtime-feedback investigation: fast-scroll hydration performance at 50k songs.
// Reproduces the Songs page pattern: full id list + bursts of 200-id window
// hydrations (preserveIdOrder, relational with-branches), plus a concurrent
// write-transaction scenario to expose any txLock read-stall.
process.env.NORA_DB_FILE = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-scroll-')) + path.sep + 'scroll.db';

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: undefined, payloads: undefined }),
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

import { getEngine, db } from '@main/db/db';
import getSongInfo from '@main/core/getSongInfo';
import { musicFolders } from '@main/db/schema';
import { performance } from 'node:perf_hooks';
// inline mulberry32 (same PRNG as the POC generator)
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 50000;
const rng = makeRng(1234);
const WORDS_A = ['midnight', 'golden', 'silent', 'electric', 'crimson', 'velvet', 'lonely', 'neon', 'paper', 'wild'];
const WORDS_B = ['heart', 'city', 'fire', 'dream', 'river', 'sky', 'love', 'road', 'rain', 'star'];

describe('scroll hydration performance @50k', { timeout: 60000 }, () => {
  beforeAll(async () => {
    const engine = getEngine()!;
    await db.insert(musicFolders).values({ name: 'Lib', path: 'C:\\Lib' });

    // bulk-populate 50k songs the fast way (raw multi-row, outside drizzle)
    const COLS = `title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, language, created_at, updated_at`;
    engine.exec('BEGIN');
    for (let i = 0; i < N; i += 400) {
      const chunk = Math.min(400, N - i);
      const rows: string[] = [];
      for (let j = 0; j < chunk; j++) {
        const idx = i + j;
        const a = WORDS_A[Math.floor(rng() * WORDS_A.length)];
        const b = WORDS_B[Math.floor(rng() * WORDS_B.length)];
        const title = `'${a} ${b} ${idx}'`;
        const dur = (120 + rng() * 240).toFixed(1);
        const path = `'C:\\\\Lib\\\\track_${idx}.mp3'`;
        const fav = rng() < 0.1 ? 1 : 0;
        const year = 1970 + Math.floor(rng() * 55);
        const lang = rng() < 0.15 ? `'ja'` : `'en'`;
        const now = 1700000000000 + idx * 1000;
        rows.push(`(${title}, ${dur}, 0, ${path}, ${fav}, 44100, 320000, 2, ${year}, 1, ${idx + 1}, 1, 0, ${now}, ${now}, ${lang}, ${now}, ${now})`);
      }
      engine.exec(`INSERT INTO songs (${COLS}) VALUES ${rows.join(',')}`);
    }
    engine.exec('COMMIT');

    // warm the FTS/index caches with one full pass
    engine.all('SELECT id FROM songs ORDER BY title');
  }, 60000);

  afterAll(async () => {
    const { closeDatabaseInstance } = await import('@main/db/db');
    await closeDatabaseInstance();
    try {
      fs.rmSync(path.dirname(process.env.NORA_DB_FILE!), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch { /* transient locks */ }
  });

  it('full id list (Songs page open)', async () => {
    const t0 = performance.now();
    const rows = getEngine()!.all('SELECT id FROM songs WHERE is_blacklisted = 0 ORDER BY title');
    const ms = performance.now() - t0;
    console.log(`[scroll] full id list: ${rows.length} rows in ${ms.toFixed(1)}ms`);
    expect(rows.length).toBe(N);
  });

  it('50 concurrent 200-row windows (fast-scroll burst)', async () => {
    // simulate a fast scroll: jump to 50 different windows, all requested ~concurrently
    const windows = Array.from({ length: 50 }, (_, i) => {
      const start = Math.floor((i * N) / 50);
      return Array.from({ length: 200 }, (_, k) => Math.min(N, start + k + 1));
    });
    const t0 = performance.now();
    const results = await Promise.all(
      windows.map((ids) => getSongInfo(ids, undefined, undefined, undefined, true))
    );
    const total = performance.now() - t0;
    expect(results.every((r) => r.length === 200)).toBe(true);
    console.log(`[scroll] 50 concurrent windows (10k rows): ${total.toFixed(1)}ms total, ${(total / 50).toFixed(2)}ms/window`);
    expect(total).toBeLessThan(5000);
  });

  it('rapid sequential hydration (slow-scroll pattern)', async () => {
    const times: number[] = [];
    for (let w = 0; w < 20; w++) {
      const start = Math.floor((w * N) / 20);
      const ids = Array.from({ length: 200 }, (_, k) => Math.min(N, start + k + 1));
      const t0 = performance.now();
      await getSongInfo(ids, undefined, undefined, undefined, true);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    console.log(`[scroll] sequential x20: p50=${times[10].toFixed(2)}ms p95=${times[18].toFixed(2)}ms max=${times[19].toFixed(2)}ms`);
    expect(times[19]).toBeLessThan(1000);
  });

  it('hydration during concurrent write transactions (txLock stall check)', async () => {
    // background write tx (like a job committing) while hydrating
    const writeLoop = (async () => {
      for (let i = 0; i < 10; i++) {
        await db.transaction(async (trx) => {
          await trx.insert(musicFolders).values({ name: `w${i}`, path: `C:\\w${i}` });
          // hold the tx open briefly like a real job commit
          await new Promise((r) => setTimeout(r, 30));
        });
      }
    })();
    await new Promise((r) => setTimeout(r, 10)); // let the first tx start

    const t0 = performance.now();
    const ids = Array.from({ length: 200 }, (_, k) => k + 1);
    await getSongInfo(ids, undefined, undefined, undefined, true);
    const ms = performance.now() - t0;
    await writeLoop;
    console.log(`[scroll] hydration during write txs: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(5000);
  });
});
