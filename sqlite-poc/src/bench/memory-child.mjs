// Memory child: runs a fixed workload against one engine (or none) and reports
// checkpoints via IPC. Parent (b1-memory.mjs) samples Windows commit size for this pid.
import { performance } from 'node:perf_hooks';
import path from 'node:path';

const engine = process.argv[2]; // baseline | sqlite | pglite
const size = Number(process.argv[3] ?? 50000);
const POC_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');

const send = (label) => {
  if (global.gc) global.gc(); // measure steady-state, not un-collected module-init garbage
  const mu = process.memoryUsage();
  process.send({
    type: 'checkpoint',
    label,
    mem: {
      rssMb: Math.round((mu.rss / 1048576) * 10) / 10,
      heapUsedMb: Math.round((mu.heapUsed / 1048576) * 10) / 10,
      externalMb: Math.round((mu.external / 1048576) * 10) / 10,
      arrayBuffersMb: Math.round((mu.arrayBuffers / 1048576) * 10) / 10
    }
  });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

send('baseline-process');

let e = null;
if (engine === 'sqlite') {
  const { openSqlite } = await import('../engines/sqlite-engine.mjs');
  e = await openSqlite(path.join(POC_ROOT, 'data', `sqlite-${size}.db`));
} else if (engine === 'pglite') {
  const { openPglite } = await import('../engines/pglite-engine.mjs');
  e = await openPglite(path.join(POC_ROOT, 'data', `pglite-${size}`));
}
send(engine === 'baseline' ? 'after-noop-open' : 'after-engine-open');

await sleep(2500); // let V8's idle memory reducer return freed pages
send('idle-after-init');

// load all songs into JS (mirrors the DIFF phase of LibraryScanner which selects all songs)
if (e) {
  const rows = await e.all(`SELECT id, title, duration, path, is_favorite, year FROM songs ORDER BY id`);
  globalThis.__loaded = rows.length;
  send('after-full-songs-scan');
  void rows;
}

// representative queries
if (e) {
  await e.all(`SELECT s.id, s.title, a.name FROM songs s JOIN artists_songs ars ON ars.song_id = s.id JOIN artists a ON a.id = ars.artist_id WHERE s.is_blacklisted = ${engine === 'pglite' ? 'false' : '0'} ORDER BY s.title LIMIT 200`);
  await e.all(`SELECT * FROM albums ORDER BY title LIMIT 500`);
  send('after-representative-queries');
}

// large ingestion: 10k songs (run-unique paths so reruns never collide)
if (e) {
  const runTag = `${size}-${process.pid}`;
  const t0 = performance.now();
  const cols = 20;
  await e.tx(async (tx) => {
    for (let i = 0; i < 10000; i += 400) {
      const n = Math.min(400, 10000 - i);
      const ph = [];
      const params = [];
      let p = 0;
      for (let r = 0; r < n; r++) {
        const placeholders = [];
        for (let c = 0; c < cols; c++) placeholders.push(engine === 'pglite' ? `$${++p}` : '?');
        ph.push(`(${placeholders.join(',')})`);
        const bool = engine === 'pglite' ? (v) => v : (v) => (v ? 1 : 0);
        params.push(
          `ingest test song ${i + r}`,
          200.5, 0, `C:\\ingest\\${runTag}-${i + r}.mp3`, bool(false), 44100, 192000, 2,
          2020, 1, 1, 1, bool(false), '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
          null, null, 'en', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
      }
      const sql = `INSERT INTO songs (title, duration, skip_count, path, is_favorite, sample_rate, bit_rate, no_of_channels, year, disk_number, track_number, folder_id, is_blacklisted, file_created_at, file_modified_at, music_brainz_recording_id, isrc, language, created_at, updated_at) VALUES ${ph.join(',')}`;
      await tx.run(sql, params);
    }
  });
  const ingestMs = performance.now() - t0;
  await e.tx(async (tx) => {
    // PG LIKE treats '\' as escape char (needs doubling); SQLite treats it literally.
    const pattern = engine === 'pglite'
      ? `C:\\\\ingest\\\\${runTag}%`
      : `C:\\ingest\\${runTag}%`;
    await tx.run(`DELETE FROM songs WHERE path LIKE ?`, [pattern]);
  });
  send(`after-10k-ingestion-${Math.round(ingestMs)}ms`);
}

if (e) {
  const closeMs = await e.close();
  process.send({ type: 'closeMs', closeMs });
}
await sleep(300);
send('after-close');
process.send({ type: 'done' });
process.exit(0);
