import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function killAllNora() {
  try { execSync('taskkill /IM electron.exe /F /T', { stdio: 'ignore' }); } catch (e) {}
  try { execSync('taskkill /IM nora.exe /F /T', { stdio: 'ignore' }); } catch (e) {}
}

export class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) cb.reject(new Error(msg.error.message));
            else cb.resolve(msg.result);
          }
        } catch (e) {}
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }

  async getPerformanceMetrics() {
    try {
      const res = await this.send('Performance.getMetrics');
      const map = {};
      for (const m of res?.metrics || []) {
        map[m.name] = m.value;
      }
      return map;
    } catch (e) {
      return {};
    }
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch (e) {}
  }
}

export function getProcessMemoryMetrics() {
  try {
    const psCmd = `
      $procs = Get-Process -Name "electron", "nora" -ErrorAction SilentlyContinue
      if (-not $procs) { return "[]" }
      $cimMap = @{}
      try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'electron*' -or $_.Name -like 'nora*' } | ForEach-Object {
          $cimMap[[string]$_.ProcessId] = $_.CommandLine
        }
      } catch {}

      $list = foreach ($p in $procs) {
        $cmd = $cimMap[[string]$p.Id]
        $role = "Main"
        if ($cmd -match "--type=renderer") { $role = "Renderer" }
        elseif ($cmd -match "--type=gpu-process") { $role = "GPU" }
        elseif ($cmd -match "--type=utility") { $role = "Utility" }
        elseif ($cmd -match "--type=crashpad-handler") { $role = "Crashpad" }

        [PSCustomObject]@{
          pid = $p.Id
          role = $role
          workingSetMB = [math]::Round($p.WorkingSet64 / 1MB, 2)
          privateMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 2)
        }
      }
      $list | ConvertTo-Json -Compress
    `;

    const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      encoding: 'utf8',
      timeout: 5000
    });
    const raw = res.stdout?.trim();
    if (!raw || raw === '[]') return null;

    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    const summary = {
      main: { ws: 0, pm: 0 },
      renderer: { ws: 0, pm: 0 },
      gpu: { ws: 0, pm: 0 },
      utility: { ws: 0, pm: 0 },
      totalWS: 0,
      totalPM: 0,
      processes: list
    };

    for (const item of list) {
      summary.totalWS += item.workingSetMB;
      summary.totalPM += item.privateMB;
      const roleKey = item.role.toLowerCase();
      if (summary[roleKey]) {
        summary[roleKey].ws += item.workingSetMB;
        summary[roleKey].pm += item.privateMB;
      }
    }

    summary.totalWS = Math.round(summary.totalWS * 100) / 100;
    summary.totalPM = Math.round(summary.totalPM * 100) / 100;
    summary.main.ws = Math.round(summary.main.ws * 100) / 100;
    summary.main.pm = Math.round(summary.main.pm * 100) / 100;
    summary.renderer.ws = Math.round(summary.renderer.ws * 100) / 100;
    summary.renderer.pm = Math.round(summary.renderer.pm * 100) / 100;
    summary.gpu.ws = Math.round(summary.gpu.ws * 100) / 100;
    summary.gpu.pm = Math.round(summary.gpu.pm * 100) / 100;

    return summary;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('================================================================');
  console.log(' NORA 3-MINUTE COMPREHENSIVE MULTI-TASK MEMORY AUDIT');
  console.log(' Duration: 185+ Seconds | Tasks: 6 Operations + Rest Phase');
  console.log(' Telemetry: Main (Node/SQLite), Renderer (V8/Blink), GPU, Utility');
  console.log('================================================================\\n');

  killAllNora();
  await sleep(2000);

  const PORT_RENDERER = 9876;
  const PORT_NODE = 9229;

  console.log('[Phase 0] Spawning Nora dev instance (DevTools closed, Scenario disabled)...');
  const child = spawn(
    'npx.cmd',
    ['electron-vite', 'dev', '--watch=false', '--remoteDebuggingPort', String(PORT_RENDERER), `--inspect=${PORT_NODE}`],
    {
      shell: true,
      env: {
        ...process.env,
        NORA_DEVTOOLS_CLOSED: '1',
        NORA_SCENARIO: '0'
      },
      stdio: 'ignore'
    }
  );

  let rendererTarget = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT_RENDERER}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.title === 'Nora');
        if (page && page.webSocketDebuggerUrl) {
          rendererTarget = page;
          break;
        }
      }
    } catch (e) {}
    await sleep(1000);
  }

  if (!rendererTarget) {
    console.error('ERROR: Failed to connect to Renderer CDP on port', PORT_RENDERER);
    killAllNora();
    process.exit(1);
  }

  const rendererCDP = new CDPClient(rendererTarget.webSocketDebuggerUrl);
  await rendererCDP.connect();
  await rendererCDP.send('Runtime.enable');
  await rendererCDP.send('Performance.enable');
  await rendererCDP.send('HeapProfiler.enable');
  console.log(' connected to Renderer CDP on port', PORT_RENDERER);

  let nodeCDP = null;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT_NODE}/json`);
      if (res.ok) {
        const list = await res.json();
        const nodeTarget = list.find((t) => t.type === 'node' || t.title.includes('main.js') || t.title.includes('electron'));
        if (nodeTarget && nodeTarget.webSocketDebuggerUrl) {
          nodeCDP = new CDPClient(nodeTarget.webSocketDebuggerUrl);
          await nodeCDP.connect();
          await nodeCDP.send('Runtime.enable');
          await nodeCDP.send('HeapProfiler.enable');
          console.log(' connected to Main Node Process CDP on port', PORT_NODE);
          break;
        }
      }
    } catch (e) {}
    await sleep(1000);
  }

  const telemetry = [];
  const startTime = Date.now();

  async function recordSample(taskName, details = {}) {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const proc = getProcessMemoryMetrics();
    let perf = {};
    try {
      perf = await rendererCDP.getPerformanceMetrics();
    } catch (e) {}

    let mainNodeMem = null;
    if (nodeCDP) {
      try {
        mainNodeMem = await nodeCDP.evaluate(`(() => {
          const m = process.memoryUsage();
          return {
            rssMB: Math.round(m.rss / 1048576 * 10) / 10,
            heapUsedMB: Math.round(m.heapUsed / 1048576 * 10) / 10,
            heapTotalMB: Math.round(m.heapTotal / 1048576 * 10) / 10,
            externalMB: Math.round(m.external / 1048576 * 10) / 10,
            arrayBuffersMB: Math.round(m.arrayBuffers / 1048576 * 10) / 10
          };
        })()`);
      } catch (e) {}
    }

    let rendererExtra = {};
    try {
      rendererExtra = await rendererCDP.evaluate(`(() => {
        const qc = window.__noraProfile && window.__noraProfile.qc;
        const qCount = qc ? qc.getQueryCache().getAll().length : null;
        const imgCount = document.querySelectorAll('img').length;
        return { qCount, imgCount };
      })()`);
    } catch (e) {}

    const sample = {
      timestamp: new Date().toISOString(),
      elapsedSec,
      task: taskName,
      totalWS: proc?.totalWS ?? 0,
      totalPM: proc?.totalPM ?? 0,
      mainWS: proc?.main?.ws ?? 0,
      mainPM: proc?.main?.pm ?? 0,
      rendererWS: proc?.renderer?.ws ?? 0,
      rendererPM: proc?.renderer?.pm ?? 0,
      gpuWS: proc?.gpu?.ws ?? 0,
      gpuPM: proc?.gpu?.pm ?? 0,
      utilityWS: proc?.utility?.ws ?? 0,
      utilityPM: proc?.utility?.pm ?? 0,
      rendererHeapUsedMB: perf.JSHeapUsedSize ? Math.round((perf.JSHeapUsedSize / 1048576) * 100) / 100 : 0,
      rendererHeapTotalMB: perf.JSHeapTotalSize ? Math.round((perf.JSHeapTotalSize / 1048576) * 100) / 100 : 0,
      domNodes: perf.Nodes ?? 0,
      domDocuments: perf.Documents ?? 0,
      layoutObjects: perf.LayoutObjects ?? 0,
      jsListeners: perf.JSEventListeners ?? 0,
      queryCacheCount: rendererExtra?.qCount ?? 0,
      domImgCount: rendererExtra?.imgCount ?? 0,
      mainNode: mainNodeMem,
      details
    };

    telemetry.push(sample);
    console.log(
      `[T+${String(elapsedSec).padStart(3, ' ')}s] [${taskName.padEnd(28, ' ')}] TotalWS:${String(sample.totalWS).padStart(7, ' ')} MB | MainWS:${String(sample.mainWS).padStart(6, ' ')} MB | RendWS:${String(sample.rendererWS).padStart(6, ' ')} MB | GPUWS:${String(sample.gpuWS).padStart(6, ' ')} MB | RendHeap:${String(sample.rendererHeapUsedMB).padStart(5, ' ')} MB | Nodes:${String(sample.domNodes).padStart(5, ' ')}`
    );
    return sample;
  }

  // TASK 1: Cold Launch & Baseline Idle (0s - 20s)
  console.log('\\n--- TASK 1: Cold Launch & Baseline Idle (0 - 20s) ---');
  for (let s = 0; s < 7; s++) {
    await recordSample('Task 1: Cold Launch Idle');
    await sleep(3000);
  }

  // TASK 2: Library Navigation - Songs Page (20s - 50s)
  console.log('\\n--- TASK 2: Library Navigation - Songs Page (20 - 50s) ---');
  await rendererCDP.evaluate(`location.hash = '#/main-player/songs'`);
  for (let s = 0; s < 10; s++) {
    await recordSample('Task 2: Songs Page Load');
    await sleep(3000);
  }

  // TASK 3: Virtualized List Rapid Scrolling & Image Decoding (50s - 80s)
  console.log('\\n--- TASK 3: Virtualized List Rapid Scrolling & Image Decoding (50 - 80s) ---');
  const scrollInterval = setInterval(async () => {
    try {
      await rendererCDP.evaluate(`(() => {
        const container = document.querySelector('.virtualized-list') || document.querySelector('.songs-container') || document.documentElement;
        if (container) container.scrollTop += 600;
      })()`);
    } catch (e) {}
  }, 300);

  for (let s = 0; s < 10; s++) {
    await recordSample('Task 3: Rapid Scroll & Images');
    await sleep(3000);
  }
  clearInterval(scrollInterval);

  // TASK 4: Rapid Navigation Across Multiple Views (80s - 110s)
  console.log('\\n--- TASK 4: Multi-View Navigation (Albums, Artists, Playlists, Genres) (80 - 110s) ---');
  const views = [
    { name: 'Albums', hash: '#/main-player/albums' },
    { name: 'Artists', hash: '#/main-player/artists' },
    { name: 'Playlists', hash: '#/main-player/playlists' },
    { name: 'Genres', hash: '#/main-player/genres' },
    { name: 'Folders', hash: '#/main-player/folders' }
  ];

  for (const v of views) {
    await rendererCDP.evaluate(`location.hash = '${v.hash}'`);
    await sleep(1500);
    await recordSample(`Task 4: Nav -> ${v.name}`);
    await sleep(4000);
    await recordSample(`Task 4: Settle ${v.name}`);
  }

  // TASK 5: Search Query Filtering (110s - 135s)
  console.log('\\n--- TASK 5: Search Query Filtering (110 - 135s) ---');
  await rendererCDP.evaluate(`location.hash = '#/main-player/search'`);
  await sleep(2000);
  const searchQueries = ['love', 'the', 'star', 'night', 'rock'];
  for (const q of searchQueries) {
    await rendererCDP.evaluate(`(() => {
      const input = document.querySelector('input[type="search"], input[type="text"], input');
      if (input) {
        input.value = '${q}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(2500);
    await recordSample(`Task 5: Search [${q}]`);
    await sleep(2500);
  }

  // TASK 6: Player Mode Transitions & Lyrics Overhead (135s - 165s)
  console.log('\\n--- TASK 6: Mode Transitions & Lyrics (135 - 165s) ---');
  console.log('>> Switching to Standard MiniPlayer...');
  await rendererCDP.evaluate(`window.api && window.api.playerControls && window.api.playerControls.changePlayerType('mini', 'standard')`);
  await sleep(7000);
  await recordSample('Task 6: Standard MiniPlayer');

  console.log('>> Switching to Compact MiniPlayer...');
  await rendererCDP.evaluate(`window.api && window.api.playerControls && window.api.playerControls.changePlayerType('mini', 'compact')`);
  await sleep(7000);
  await recordSample('Task 6: Compact MiniPlayer');

  console.log('>> Returning to Normal Main Player...');
  await rendererCDP.evaluate(`window.api && window.api.playerControls && window.api.playerControls.changePlayerType('normal')`);
  await sleep(7000);
  await recordSample('Task 6: Return to Normal Player');

  console.log('>> Navigating to Lyrics View...');
  await rendererCDP.evaluate(`location.hash = '#/main-player/lyrics'`);
  await sleep(8000);
  await recordSample('Task 6: Theatre Lyrics View');

  // TASK 7: Settling, Rest & Garbage Collection Audit (165s - 195s)
  console.log('\\n--- TASK 7: Final Rest & Garbage Collection Audit (165 - 195s) ---');
  await rendererCDP.evaluate(`location.hash = '#/main-player/home'`);
  await sleep(5000);
  await recordSample('Task 7: Rest Home (Pre-GC)');
  await sleep(15000);
  await recordSample('Task 7: Rest Home (+15s)');

  console.log('>> Triggering V8 Garbage Collection in Renderer & Main Node Process...');
  await rendererCDP.send('HeapProfiler.collectGarbage');
  if (nodeCDP) {
    try { await nodeCDP.send('HeapProfiler.collectGarbage'); } catch (e) {}
  }
  await sleep(5000);
  const finalSample = await recordSample('Task 7: Post-GC Settled');

  // Save report
  const reportFileName = process.argv[2] || 'audit_3min_memory_report.json';
  const reportPath = path.join(rootDir, reportFileName);
  fs.writeFileSync(reportPath, JSON.stringify(telemetry, null, 2), 'utf8');
  console.log(`\\n Audit Complete! Full telemetry saved to: ${reportPath}`);

  rendererCDP.close();
  if (nodeCDP) nodeCDP.close();
  killAllNora();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Error in 3min audit]:', err);
  killAllNora();
  process.exit(1);
});
