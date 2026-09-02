/**
 * Traces the JS-side retainer chain of detached `.song-item` DOM rows.
 *
 * Unlike find-detached-retainers.mjs (which walks only 4 levels from DOM wrapper
 * nodes and stops at V8-internal handles), this script walks the incoming-edge
 * graph upward from each detached element until it reaches a JavaScript object
 * (FiberNode / Map / Array / closure / etc.) or a GC root, printing the full path.
 */
import { spawn } from 'child_process';
import path from 'path';
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
    const res = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true });
    return res?.result?.value;
  }
}

async function getCDPTarget(port, retries = 40) {
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

  const child = spawn(electronExe, [mainEntry, '--remote-debugging-port=9876'], {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'production', NORA_USER_DATA: path.join(appData, 'nora') },
    stdio: 'ignore'
  });

  console.log('Spawning production Nora...');
  const target = await getCDPTarget(9876);
  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await sleep(3000);

  await cdp.evaluate(`document.querySelector('a[href*="songs"]')?.click()`);
  await sleep(4000);

  console.log('Scrolling the FULL library list (down then up)...');
  await cdp.evaluate(`(async () => {
    const scroller = document.querySelector('[data-virtuoso-scroller="true"]');
    const totalHeight = scroller.scrollHeight;
    for (let pos = 0; pos <= totalHeight; pos += 80) {
      scroller.scrollTop = pos;
      await new Promise((r) => requestAnimationFrame(r));
    }
    for (let pos = totalHeight; pos >= 0; pos -= 160) {
      scroller.scrollTop = pos;
      await new Promise((r) => requestAnimationFrame(r));
    }
  })()`);
  await sleep(2000);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(1000);

  const perf = await cdp.send('Performance.getMetrics');
  const nodesMetric = perf.metrics.find((m) => m.name === 'Nodes');
  const liveCounts = await cdp.evaluate(
    `document.querySelectorAll('body *').length`
  );
  console.log('CDP Nodes metric:', nodesMetric?.value, '| live in document:', liveCounts);

  console.log('Capturing heap snapshot...');
  const chunks = [];
  cdp.ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(msg.params.chunk);
    } catch {}
  });
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  await sleep(6000);

  child.kill();

  const parsed = JSON.parse(chunks.join(''));
  const { strings, nodes, edges } = parsed;
  const meta = parsed.snapshot.meta;
  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields;
  const nodeStride = nodeFields.length;
  const edgeStride = edgeFields.length;

  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const idIdx = nodeFields.indexOf('id');
  const edgeCountIdx = nodeFields.indexOf('edge_count');
  const edgeTypeIdx = edgeFields.indexOf('type');
  const edgeNameIdx = edgeFields.indexOf('name_or_index');
  const edgeToIdx = edgeFields.indexOf('to_node');
  const nodeTypes = meta.node_types[typeIdx];
  const edgeTypes = meta.edge_types[edgeTypeIdx];

  const nodeCount = nodes.length / nodeStride;
  console.log('Total heap nodes:', nodeCount);

  // Incoming edges: toNode -> [{ fromNode, edgeType, edgeName }]
  console.log('Indexing incoming edges...');
  const incoming = new Map();
  for (let e = 0; e < edges.length; e += edgeStride) {
    const to = edges[e + edgeToIdx] / nodeStride;
    // The source node must be found via prefix sums of edge_count — build both here.
    let list = incoming.get(to);
    if (!list) {
      list = [];
      incoming.set(to, list);
    }
    list.push(e);
  }

  const typeName = (n) => nodeTypes[nodes[n * nodeStride + typeIdx]];
  const nodeName = (n) => {
    const v = nodes[n * nodeStride + nameIdx];
    return typeof v === 'string' ? v : strings[v] ?? String(v);
  };
  const nodeId = (n) => nodes[n * nodeStride + idIdx];

  // Prefix sums of edge_count so edge index -> source node
  const edgeBase = new Array(nodeCount + 1);
  edgeBase[0] = 0;
  for (let n = 0; n < nodeCount; n++) {
    edgeBase[n + 1] = edgeBase[n] + nodes[n * nodeStride + edgeCountIdx];
  }
  const edgeSource = (e) => {
    // binary search edgeBase for the node containing edge index e
    let lo = 0;
    let hi = nodeCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (edgeBase[mid] <= e) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  console.log('Marking attached DOM subtree...');
  const attachedSet = new Set();
  const docQueue = [];
  const docQueueOriginal = [];
  for (let n = 0; n < nodeCount; n++) {
    if (nodeName(n) === 'Document') {
      docQueue.push(n);
      docQueueOriginal.push(n);
    }
  }
  while (docQueue.length) {
    const cur = docQueue.pop();
    if (attachedSet.has(cur)) continue;
    attachedSet.add(cur);
    for (let e = edgeBase[cur]; e < edgeBase[cur + 1]; e++) {
      const to = edges[e * edgeStride + edgeToIdx] / nodeStride;
      if (!attachedSet.has(to)) docQueue.push(to);
    }
  }
  console.log('Attached (document-reachable) nodes:', attachedSet.size);

  // Per-Document subtree sizes: the CDP Nodes metric counts all documents, so a
  // second (offscreen/detached) document would explain metric >> live body nodes.
  console.log('Per-Document subtree sizes...');
  for (const doc of docQueueOriginal) {
    const seen = new Set([doc]);
    const q = [doc];
    let size = 0;
    while (q.length) {
      const cur = q.pop();
      size++;
      for (let e = edgeBase[cur]; e < edgeBase[cur + 1]; e++) {
        const to = edges[e * edgeStride + edgeToIdx] / nodeStride;
        if (!seen.has(to)) {
          seen.add(to);
          q.push(to);
        }
      }
    }
    console.log(
      `Document id=${nodeId(doc)} subtree=${size} name=${String(nodeName(doc)).slice(0, 40)} url-ish=${String(nodeName(doc)).slice(0, 40)}`
    );
    // first-level children names
    const kids = [];
    for (let e = edgeBase[doc]; e < edgeBase[doc + 1]; e++) {
      const to = edges[e * edgeStride + edgeToIdx] / nodeStride;
      kids.push(`${typeName(to)}:${String(nodeName(to)).slice(0, 30)}`);
    }
    console.log('  children:', kids.slice(0, 8).join(' | '));
  }

  console.log('Finding detached elements...');
  const candidates = [];
  for (let n = 0; n < nodeCount; n++) {
    const name = nodeName(n);
    if (typeof name === 'string' && name.startsWith('<div') && name.length > 10) {
      candidates.push(n);
    }
  }
  const detached = candidates.filter((n) => !attachedSet.has(n));
  console.log(
    'div-like heap nodes:',
    candidates.length,
    '| detached:',
    detached.length
  );
  // distribution of detached element classes for a quick overview
  const classCounts = new Map();
  for (const n of detached) {
    const m = nodeName(n).match(/class="([^"]{0,60})/);
    const key = m ? m[1].slice(0, 50) : '(no class)';
    classCounts.set(key, (classCounts.get(key) || 0) + 1);
  }
  console.log(
    'Top detached classes:',
    [...classCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  );

  const MAX_HOPS = 15;
  const JS_TYPES = new Set(['object', 'closure', 'array']);
  const describe = (n) => `[${typeName(n)}] ${nodeName(n)}`.slice(0, 140);

  for (const startNode of detached.slice(0, 3)) {
    console.log('\n=====================================================');
    console.log('TRACE for:', describe(startNode));
    console.log('=====================================================');
    const prev = new Map();
    const queue = [startNode];
    const visited = new Set([startNode]);
    let end = null;
    while (queue.length && !end) {
      const cur = queue.shift();
      const list = incoming.get(cur) || [];
      const depth = prev.get(cur)?.depth ?? 0;
      if (depth > MAX_HOPS) continue;
      for (const e of list) {
        const from = edgeSource(e);
        if (visited.has(from)) continue;
        visited.add(from);
        prev.set(from, {
          node: cur,
          depth: depth + 1,
          edgeType: edgeTypes[edges[e * edgeStride + edgeTypeIdx]],
          edgeName:
            typeof edges[e * edgeStride + edgeNameIdx] === 'number'
              ? `[${edges[e * edgeStride + edgeNameIdx]}]`
              : strings[edges[e * edgeStride + edgeNameIdx]]
        });
        const tn = typeName(from);
        const nm = nodeName(from);
        if (
          tn === 'synthetic' ||
          nm === 'GC roots' ||
          /FiberNode|ReactElement|Map|Set|Array|Window|global/.test(String(nm)) === false
        ) {
          // keep walking; we terminate on synthetic roots only
        }
        if (tn === 'synthetic' || nm === '' ) {
          // synthetic root
        }
        queue.push(from);
      }
    }
    // Walk the path: repeatedly step to any node that is a GC root (no incoming) or synthetic,
    // preferring shortest path found. We reconstruct by BFS from start to the FIRST node with
    // no incoming edges (root) or type synthetic.
    let rootFound = null;
    for (const n of visited) {
      if (typeName(n) === 'synthetic') {
        rootFound = n;
        break;
      }
    }
    if (rootFound === null) {
      // fall back: deepest node visited
      let best = null;
      let bestDepth = -1;
      for (const n of visited) {
        const d = prev.get(n)?.depth ?? 0;
        if (d > bestDepth) {
          bestDepth = d;
          best = n;
        }
      }
      rootFound = best;
    }
    const chain = [];
    let cur = rootFound;
    while (cur !== undefined && cur !== startNode) {
      chain.push(cur);
      cur = prev.get(cur)?.node;
    }
    chain.push(startNode);
    chain.reverse();
    for (let i = 0; i < chain.length; i++) {
      const n = chain[i];
      const via = i > 0 ? prev.get(n) : null;
      console.log(
        `${String(i).padStart(2)}) ${describe(n)}  ${via ? `<- [${via.edgeType}] ${via.edgeName}` : '(start)'}`
      );
    }
    void JS_TYPES;
    void idIdx;
    void nodeId;
    void strings;
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
