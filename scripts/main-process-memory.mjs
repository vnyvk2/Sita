/**
 * Measures the Electron MAIN process memory in isolation:
 *  - process.memoryUsage() (rss, heapUsed, external, arrayBuffers)
 *  - v8.getHeapStatistics() (heap size limits, external memory)
 *  - top retained constructors from a V8 heap snapshot (what exactly is retained)
 * Launches the built app with --inspect and attaches to the Node inspector target.
 */
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import WebSocket from 'ws';

const rootDir = path.resolve(process.cwd());

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class CDPClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.msgId = 1;
    this.pending = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {}
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }
}

async function getMainTarget(port, retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const list = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      const target = list.find((t) => t.type === 'node' || t.title.includes('main.js'));
      if (target) return target;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`No node inspector target on port ${port}`);
}

async function run() {
  const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const mainEntry = path.join(rootDir, 'out', 'main', 'main.js');
  const appData = process.env.APPDATA || 'C:\\Users\\VINAY\\AppData\\Roaming';

  try {
    execSync('taskkill /IM electron.exe /F /T', { stdio: 'ignore' });
  } catch {}
  await sleep(1500);

  const child = spawn(electronExe, [mainEntry, '--inspect=9229'], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NORA_USER_DATA: path.join(appData, 'nora'),
      NORA_NO_DEVTOOLS: '1'
    },
    stdio: 'ignore'
  });

  console.log('Spawning Nora main process with inspector...');
  const target = await getMainTarget(9229);
  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await sleep(2000);

  // Sample at boot, then after 20s settle
  for (const label of ['boot', 'settled+20s']) {
    const usage = await cdp.evaluate(`(async () => {
      const out = { ...process.memoryUsage(), uptime: process.uptime() };
      try {
        const mod = await import('node:v8');
        const v8 = mod.default ?? mod;
        out.v8stats = v8.getHeapStatistics();
      } catch (e) {
        out.v8statsError = String(e && e.message ? e.message : e);
      }
      return out;
    })()`);
    if (!usage) throw new Error('evaluate returned no value (main process inspector)');
    const mb = (v) => ((v ?? 0) / 1048576).toFixed(1);
    console.log(`\n=== ${label} (uptime ${(usage.uptime ?? 0).toFixed(1)}s) ===`);
    console.log(
      `rss=${mb(usage.rss)}MB heapUsed=${mb(usage.heapUsed)}MB heapTotal=${mb(usage.heapTotal)}MB ` +
        `external(memUsage)=${mb(usage.external)}MB arrayBuffers=${mb(usage.arrayBuffers)}MB`
    );
    if (usage.v8statsError) console.log('v8stats error:', usage.v8statsError);
    if (usage.v8stats) {
      console.log(
        `v8 external_memory=${mb(usage.v8stats.external_memory)}MB ` +
          `malloced=${mb(usage.v8stats.malloced_memory)}MB peak_malloced=${mb(usage.v8stats.peak_malloced_memory)}MB ` +
          `heap_committed=${mb(usage.v8stats.total_heap_size)}MB ` +
          `code_range=${mb(usage.v8stats.total_code_range_size)}MB ` +
          `external_strings=${mb(usage.v8stats.external_string_memory)}MB`
      );
    }
    if (label === 'boot') await sleep(20000);
  }

  console.log('\nCapturing main-process heap snapshot for constructor breakdown...');
  const chunks = [];
  cdp.ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(msg.params.chunk);
    } catch {}
  });
  await cdp.send('HeapProfiler.enable');
  await cdp.evaluate(`globalThis.__gc ? globalThis.__gc() : undefined`);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await sleep(8000);

  child.kill();

  const parsed = JSON.parse(chunks.join(''));
  const { strings, nodes } = parsed;
  const stride = parsed.snapshot.meta.node_fields.length;
  const typeIdx = parsed.snapshot.meta.node_fields.indexOf('type');
  const nameIdx = parsed.snapshot.meta.node_fields.indexOf('name');
  const selfSizeIdx = parsed.snapshot.meta.node_fields.indexOf('self_size');
  const nodeTypes = parsed.snapshot.meta.node_types[typeIdx];

  const byName = new Map();
  for (let n = 0; n < nodes.length / stride; n++) {
    const base = n * stride;
    const type = nodeTypes[nodes[base + typeIdx]];
    if (type !== 'object' && type !== 'closure' && type !== 'array') continue;
    const raw = nodes[base + nameIdx];
    const name = typeof raw === 'string' ? raw : strings[raw];
    const size = nodes[base + selfSizeIdx];
    const entry = byName.get(name) || { count: 0, size: 0 };
    entry.count++;
    entry.size += size;
    byName.set(name, entry);
  }
  const top = [...byName.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 25);
  console.log('\nTop retained constructors (self_size):');
  for (const [name, { count, size }] of top) {
    console.log(`${(size / 1048576).toFixed(2).padStart(8)} MB  ${String(count).padStart(7)}  ${name}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
