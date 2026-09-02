import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      $list = @()
      foreach ($p in $procs) {
        $cmd = $cimMap[[string]$p.Id]
        $role = "Main"
        if ($cmd -match "--type=renderer") { $role = "Renderer" }
        elseif ($cmd -match "--type=gpu-process") { $role = "GPU" }
        elseif ($cmd -match "--type=utility") { $role = "Utility" }
        elseif ($cmd -match "--type=crashpad-handler") { $role = "Crashpad" }

        $list += [PSCustomObject]@{
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
      timeout: 6000
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
      totalPM: 0
    };

    for (const item of list) {
      summary.totalWS += item.workingSetMB;
      summary.totalPM += item.privateMB;
      if (item.role === 'Main') {
        summary.main.ws += item.workingSetMB;
        summary.main.pm += item.privateMB;
      } else if (item.role === 'Renderer') {
        summary.renderer.ws += item.workingSetMB;
        summary.renderer.pm += item.privateMB;
      } else if (item.role === 'GPU') {
        summary.gpu.ws += item.workingSetMB;
        summary.gpu.pm += item.privateMB;
      } else if (item.role === 'Utility') {
        summary.utility.ws += item.workingSetMB;
        summary.utility.pm += item.privateMB;
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
    if (res?.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'CDP Error'
      );
    }
    return res?.result?.value;
  }

  async getPerformanceMetrics() {
    const res = await this.send('Performance.getMetrics');
    const map = {};
    for (const m of res?.metrics || []) {
      map[m.name] = m.value;
    }
    return map;
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch (e) {}
  }
}

export async function getCDPTarget(port = 9876, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.title === 'Nora');
        if (page && page.webSocketDebuggerUrl) {
          return page;
        }
      }
    } catch (e) {}
    await sleep(1000);
  }
  throw new Error(`Could not find Nora CDP target on port ${port} after ${maxAttempts}s`);
}

export function killAllNora() {
  try {
    execSync('taskkill /IM electron.exe /F /T', { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync('taskkill /IM nora.exe /F /T', { stdio: 'ignore' });
  } catch (e) {}
}

async function runSongsTabBenchmark() {
  console.log(`\n=================================================================`);
  console.log(` SONGS TAB PERFORMANCE & SCROLLING BENCHMARK`);
  console.log(` Workload: Continuous Smooth Scroll + Fast Fling Across Song Library`);
  console.log(` Metrics: FPS, Frame Times, Janky Frames (>16.6ms, >33.3ms), RAM, JS Heap, DOM Nodes`);
  console.log(`=================================================================\n`);

  killAllNora();
  await sleep(2000);

  const env = {
    ...process.env,
    NORA_DEVTOOLS_CLOSED: '1'
  };

  console.log('[Runner] Launching Nora in dev mode with --remoteDebuggingPort 9876...');
  spawn(
    process.execPath,
    [
      path.join(rootDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
      'dev',
      '--watch=false',
      '--remoteDebuggingPort',
      '9876'
    ],
    {
      cwd: rootDir,
      env,
      stdio: 'ignore',
      detached: true
    }
  );

  try {
    console.log('[Runner] Waiting for Nora CDP target on port 9876...');
    const target = await getCDPTarget(9876, 45);
    console.log(`[Runner] Connected to Nora CDP Target: ${target.title}`);

    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    console.log('\n--- Stabilizing Launch State (8s) ---');
    await sleep(8000);

    // 1. Navigate to Songs Tab if not already there
    console.log('\n[1] Navigating to Songs Tab (/main-player/songs)...');
    const navResult = await cdp.evaluate(`(async () => {
      const t0 = performance.now();
      if (window.__noraProfile?.router) {
        await window.__noraProfile.router.navigate({ to: '/main-player/songs/' });
      } else {
        window.location.hash = '#/main-player/songs/';
      }
      
      // Wait for scroller / virtuoso container
      let elapsed = 0;
      while (elapsed < 15000) {
        const songRows = document.querySelectorAll('.song-item');
        if (songRows.length > 0) {
          return {
            loadTimeMs: Math.round(performance.now() - t0),
            renderedRows: songRows.length
          };
        }
        await new Promise((r) => setTimeout(r, 100));
        elapsed += 100;
      }
      return { loadTimeMs: Math.round(performance.now() - t0), renderedRows: document.querySelectorAll('.song-item').length };
    })()`);
    console.log(`  Initial Load Time: ${navResult.loadTimeMs} ms | Initial Rendered Rows: ${navResult.renderedRows}`);

    await sleep(3000);

    async function recordSnapshot(label) {
      const proc = getProcessMemoryMetrics();
      let cdpMetrics = null;
      try {
        cdpMetrics = await cdp.getPerformanceMetrics();
      } catch (e) {}

      const jsHeapUsedMB = cdpMetrics?.JSHeapUsedSize
        ? Math.round((cdpMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100
        : 0;
      const jsHeapTotalMB = cdpMetrics?.JSHeapTotalSize
        ? Math.round((cdpMetrics.JSHeapTotalSize / 1024 / 1024) * 100) / 100
        : 0;
      const nodes = cdpMetrics?.Nodes ?? 0;
      const layoutObjects = cdpMetrics?.LayoutObjects ?? 0;
      const listeners = cdpMetrics?.JSEventListeners ?? 0;

      const record = {
        label,
        mainWS: proc?.main?.ws ?? 0,
        mainPM: proc?.main?.pm ?? 0,
        rendererWS: proc?.renderer?.ws ?? 0,
        rendererPM: proc?.renderer?.pm ?? 0,
        gpuWS: proc?.gpu?.ws ?? 0,
        totalWS: proc?.totalWS ?? 0,
        jsHeapUsedMB,
        jsHeapTotalMB,
        nodes,
        layoutObjects,
        listeners
      };

      console.log(
        `  [${label}] Total WS: ${record.totalWS} MB | Renderer WS: ${record.rendererWS} MB | Main WS: ${record.mainWS} MB | JS Heap: ${record.jsHeapUsedMB} MB | DOM Nodes: ${record.nodes}`
      );
      return record;
    }

    const baselineSnapshot = await recordSnapshot('Baseline Before Scroll');

    // 2. Perform Multi-Pass Scrolling Benchmark
    const passes = [];

    for (let pass = 1; pass <= 3; pass++) {
      console.log(`\n=================================================================`);
      console.log(` EXECUTING SCROLL PASS ${pass} / 3`);
      console.log(`=================================================================`);

      // Inject FPS & Frame Timing Collector into Renderer
      console.log(`[Pass ${pass}] Starting Continuous Smooth Scroll down & up...`);
      const scrollMetrics = await cdp.evaluate(`(async () => {
        const scroller = document.querySelector('[data-virtuoso-scroller="true"]') || document.querySelector('.songs-container div[style*="overflow"]') || document.querySelector('.songs-container div');
        if (!scroller) return { error: 'No scroller element found' };

        const frameTimes = [];
        let lastTime = performance.now();
        let isCollecting = true;

        function recordFrame() {
          if (!isCollecting) return;
          const now = performance.now();
          const delta = now - lastTime;
          frameTimes.push(delta);
          lastTime = now;
          requestAnimationFrame(recordFrame);
        }
        requestAnimationFrame(recordFrame);

        const totalScrollHeight = scroller.scrollHeight - scroller.clientHeight;
        const scrollDistance = Math.min(totalScrollHeight, 35000); // Scroll deep into library
        const step = 80;
        let currentPos = 0;

        const startTime = performance.now();

        // 1. Scroll Down
        while (currentPos < scrollDistance) {
          const frameStart = performance.now();
          currentPos = Math.min(currentPos + step, scrollDistance);
          scroller.scrollTop = currentPos;
          await new Promise((r) => setTimeout(r, 16));
          frameTimes.push(performance.now() - frameStart);
        }

        await new Promise((r) => setTimeout(r, 400));

        // 2. Fast Fling Up
        while (currentPos > 0) {
          const frameStart = performance.now();
          currentPos = Math.max(currentPos - (step * 2), 0);
          scroller.scrollTop = currentPos;
          await new Promise((r) => setTimeout(r, 16));
          frameTimes.push(performance.now() - frameStart);
        }

        const endTime = performance.now();
        isCollecting = false;
        await new Promise((r) => setTimeout(r, 500));

        // Compute metrics
        const validFrames = frameTimes.slice(2);
        const totalFrames = validFrames.length;
        const totalDuration = endTime - startTime;
        const avgFrameTime = totalFrames > 0 ? validFrames.reduce((a, b) => a + b, 0) / totalFrames : 0;
        
        const jank16 = validFrames.filter((t) => t > 16.67).length;
        const jank33 = validFrames.filter((t) => t > 33.33).length;
        const jank50 = validFrames.filter((t) => t > 50.0).length;
        const maxFrameTime = validFrames.length > 0 ? Math.max(...validFrames) : 0;

        const sorted = [...validFrames].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

        return {
          totalDurationMs: Math.round(totalDuration),
          totalFrames,
          avgFrameTimeMs: Math.round(avgFrameTime * 100) / 100,
          fps: Math.round((1000 / (avgFrameTime || 16.67)) * 10) / 10,
          jank16Count: jank16,
          jank16Percent: totalFrames > 0 ? Math.round((jank16 / totalFrames) * 1000) / 10 : 0,
          jank33Count: jank33,
          jank33Percent: totalFrames > 0 ? Math.round((jank33 / totalFrames) * 1000) / 10 : 0,
          jank50Count: jank50,
          p95Ms: Math.round(p95 * 100) / 100,
          p99Ms: Math.round(p99 * 100) / 100,
          maxFrameTimeMs: Math.round(maxFrameTime * 100) / 100,
          renderedRows: document.querySelectorAll('.song-item').length
        };
      })()`);

      console.log(`  Scroll Duration: ${scrollMetrics.totalDurationMs} ms | Total Frames: ${scrollMetrics.totalFrames}`);
      console.log(`  Avg Frame Time: ${scrollMetrics.avgFrameTimeMs} ms (${scrollMetrics.fps} FPS)`);
      console.log(`  Janky Frames (>16.6ms): ${scrollMetrics.jank16Count} (${scrollMetrics.jank16Percent}%)`);
      console.log(`  Severe Jank (>33.3ms): ${scrollMetrics.jank33Count} (${scrollMetrics.jank33Percent}%)`);
      console.log(`  Long Tasks (>50ms): ${scrollMetrics.jank50Count}`);
      console.log(`  95th Percentile: ${scrollMetrics.p95Ms} ms | 99th Percentile: ${scrollMetrics.p99Ms} ms | Max Frame Time: ${scrollMetrics.maxFrameTimeMs} ms`);

      const peakSnapshot = await recordSnapshot(`Pass ${pass} Peak Active`);
      
      console.log(`[Pass ${pass}] Resting 6s for memory stabilization...`);
      await sleep(6000);
      const settledSnapshot = await recordSnapshot(`Pass ${pass} Settled`);

      passes.push({
        pass,
        scrollMetrics,
        peakSnapshot,
        settledSnapshot
      });
    }

    console.log(`\n=================================================================`);
    console.log(` BENCHMARK SUMMARY & ATTRIBUTION`);
    console.log(`=================================================================`);
    console.log(JSON.stringify({ baselineSnapshot, passes }, null, 2));

    cdp.close();
    killAllNora();

    return { baselineSnapshot, passes };
  } catch (err) {
    console.error('Benchmark Error:', err);
    killAllNora();
    throw err;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runSongsTabBenchmark().then(() => {
    console.log('\n[Runner] Benchmark Completed Successfully.');
    process.exit(0);
  }).catch((e) => {
    console.error('\n[Runner] Benchmark Failed:', e);
    process.exit(1);
  });
}
