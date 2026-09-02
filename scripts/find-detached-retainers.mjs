import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

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
      } catch (e) {}
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
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function getCDPTarget(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const list = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      const page = list.find((t) => t.type === 'page' && !t.url.includes('devtools://'));
      if (page) return page;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Failed to find target on port ${port}`);
}

async function run() {
  const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const mainEntry = path.join(rootDir, 'out', 'main', 'main.js');

  const appData = process.env.APPDATA || 'C:\\Users\\VINAY\\AppData\\Roaming';
  const realUserData = path.join(appData, 'nora');

  const child = spawn(
    electronExe,
    [mainEntry, '--remote-debugging-port=9876'],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NORA_USER_DATA: realUserData,
        NORA_DEVTOOLS_CLOSED: '1'
      },
      stdio: 'ignore'
    }
  );

  console.log('Spawning production Nora...');
  const target = await getCDPTarget(9876, 40);
  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  await sleep(3000);

  // Navigate to Songs
  await cdp.evaluate(`document.querySelector('a[href*="songs"]')?.click()`);
  await sleep(4000);

  // Scroll through 100 songs
  console.log('Scrolling through 100 songs...');
  await cdp.evaluate(`(async () => {
    const scroller = document.querySelector('[data-virtuoso-scroller="true"]');
    for (let i = 0; i < 100 * 60; i += 120) {
      scroller.scrollTop = i;
      await new Promise(r => requestAnimationFrame(r));
    }
  })()`);

  await sleep(2000);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(1000);

  console.log('Capturing heap snapshot...');
  const chunks = [];
  cdp.ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
        chunks.push(msg.params.chunk);
      }
    } catch {}
  });

  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await sleep(6000);

  const fullSnapshot = chunks.join('');
  const parsed = JSON.parse(fullSnapshot);
  const { strings, nodes, edges } = parsed;
  const nodeFieldCount = parsed.snapshot.meta.node_fields.length;
  const edgeFieldCount = parsed.snapshot.meta.edge_fields.length;

  const nodeNameOffset = parsed.snapshot.meta.node_fields.indexOf('name');
  const nodeIdOffset = parsed.snapshot.meta.node_fields.indexOf('id');
  const nodeEdgeCountOffset = parsed.snapshot.meta.node_fields.indexOf('edge_count');

  const edgeTypeOffset = parsed.snapshot.meta.edge_fields.indexOf('type');
  const edgeNameOffset = parsed.snapshot.meta.edge_fields.indexOf('name_or_index');
  const edgeToNodeOffset = parsed.snapshot.meta.edge_fields.indexOf('to_node');
  const edgeTypes = parsed.snapshot.meta.edge_types[edgeTypeOffset];

  // Map of incoming retainers for all nodes: toNodeIdx -> array of { fromNodeIdx, edgeType, edgeName }
  console.log('Indexing retainers...');
  const retainers = new Map();
  let edgeIndex = 0;
  const internalNodeIndices = [];

  for (let i = 0; i < nodes.length; i += nodeFieldCount) {
    const nameIdx = nodes[i + nodeNameOffset];
    const name = strings[nameIdx] || '';
    const numEdges = nodes[i + nodeEdgeCountOffset];

    if (name === 'InternalNode') {
      internalNodeIndices.push(i);
    }

    for (let e = 0; e < numEdges; e++) {
      const eIdx = edgeIndex + (e * edgeFieldCount);
      const toNodeIdx = edges[eIdx + edgeToNodeOffset];
      const eType = edgeTypes[edges[eIdx + edgeTypeOffset]] || 'unknown';
      const nameOrIndex = edges[eIdx + edgeNameOffset];
      const eName = typeof nameOrIndex === 'number' ? (strings[nameOrIndex] || String(nameOrIndex)) : String(nameOrIndex);

      let list = retainers.get(toNodeIdx);
      if (!list) {
        list = [];
        retainers.set(toNodeIdx, list);
      }
      if (list.length < 5) {
        list.push({ fromNodeIdx: i, edgeType: eType, edgeName: eName });
      }
    }
    edgeIndex += numEdges * edgeFieldCount;
  }

  console.log('Total InternalNodes found: ' + internalNodeIndices.length);

  // Sample retainers of InternalNodes that are NOT connected to document
  console.log('\n--- SAMPLE RETAINER CHAINS FOR InternalNode ---');
  const samples = internalNodeIndices.slice(0, 10);
  for (const nodeIdx of samples) {
    const id = nodes[nodeIdx + nodeIdOffset];
    console.log('\nInternalNode (id: ' + id + '):');
    let curr = nodeIdx;
    for (let depth = 0; depth < 8; depth++) {
      const rets = retainers.get(curr);
      if (!rets || rets.length === 0) {
        console.log('  [depth ' + depth + '] No incoming retainers (root/detached)');
        break;
      }
      const r = rets[0];
      const fromName = strings[nodes[r.fromNodeIdx + nodeNameOffset]] || 'unknown';
      const fromId = nodes[r.fromNodeIdx + nodeIdOffset];
      console.log('  <- [' + r.edgeType + ': ' + r.edgeName + '] ' + fromName + ' (id: ' + fromId + ')');
      curr = r.fromNodeIdx;
    }
  }

  cdp.close();
  try { child.kill('SIGKILL'); } catch {}
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
