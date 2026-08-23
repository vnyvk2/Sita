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

    const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8', timeout: 6000 });
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
        } catch (e) { }
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
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
    } catch (e) { }
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
    } catch (e) { }
    await sleep(1000);
  }
  throw new Error(`Could not find Nora CDP target on port ${port} after ${maxAttempts}s`);
}

export function killAllNora() {
  try {
    execSync('taskkill /IM electron.exe /F /T', { stdio: 'ignore' });
  } catch (e) { }
  try {
    execSync('taskkill /IM nora.exe /F /T', { stdio: 'ignore' });
  } catch (e) { }
}

async function runMultiCycleAttributionTest() {
  console.log(`\n=================================================================`);
  console.log(` RENDERER MEMORY ATTRIBUTION & MULTI-CYCLE TRANSITION TEST`);
  console.log(` Testing Lifecycle: Main -> Standard Mini -> Compact Mini (3 Consecutive Cycles)`);
  console.log(` Measuring: OS Working Set, V8 JS Heap, DOM Nodes, LayoutObjects, Documents, Listeners`);
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
    [path.join(rootDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev', '--watch=false', '--remoteDebuggingPort', '9876'],
    {
      cwd: rootDir,
      env,
      stdio: 'ignore',
      detached: true
    }
  );

  const telemetryLog = [];

  try {
    console.log('[Runner] Waiting for Nora CDP target on port 9876...');
    const target = await getCDPTarget(9876, 45);
    console.log(`[Runner] Connected to Nora CDP Target: ${target.title}`);

    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    async function sample(phaseLabel) {
      await sleep(4000);
      const proc = getProcessMemoryMetrics();
      let metrics = {};
      try {
        metrics = await cdp.getPerformanceMetrics();
      } catch (e) { }

      const record = {
        phase: phaseLabel,
        totalWS: proc?.totalWS ?? 0,
        rendererWS: proc?.renderer?.ws ?? 0,
        rendererPM: proc?.renderer?.pm ?? 0,
        gpuWS: proc?.gpu?.ws ?? 0,
        mainWS: proc?.main?.ws ?? 0,
        jsHeapUsedMB: metrics.JSHeapUsedSize ? Math.round((metrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100 : null,
        jsHeapTotalMB: metrics.JSHeapTotalSize ? Math.round((metrics.JSHeapTotalSize / 1024 / 1024) * 100) / 100 : null,
        domNodes: metrics.Nodes ?? null,
        documents: metrics.Documents ?? null,
        layoutObjects: metrics.LayoutObjects ?? null,
        listeners: metrics.JSEventListeners ?? null
      };

      telemetryLog.push(record);
      console.log(`  [${record.phase}] Total: ${record.totalWS} MB | Renderer WS: ${record.rendererWS} MB | GPU: ${record.gpuWS} MB | Main: ${record.mainWS} MB | Heap: ${record.jsHeapUsedMB} MB | Nodes: ${record.domNodes} | Listeners: ${record.listeners}`);
      return record;
    }

    console.log('\n--- 0. Cold Launch Baseline ---');
    await sample('0. Cold Launch Baseline');

    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`\n========================================================`);
      console.log(` >>> STARTING CYCLE ${cycle} OF 3 <<<`);
      console.log(`========================================================`);

      // 1. Switch to Main Player
      console.log(`\n[Cycle ${cycle}] 1. Main Player: Full View + Play + Lyrics + 3 Skips`);
      await cdp.evaluate(`(async () => {
        if (window.api && window.api.windowControls) {
          await window.api.windowControls.changePlayerType('normal');
        }
      })()`);
      await sleep(2000);

      // Play & Open Lyrics
      await cdp.evaluate(`(() => {
        const playBtn = document.querySelector('.play-pause-btn');
        if (playBtn) playBtn.click();
        const lyricsBtn = document.querySelector('.lyrics-btn');
        if (lyricsBtn) lyricsBtn.click();
      })()`);

      // 3 Skips
      for (let s = 1; s <= 3; s++) {
        await sleep(1500);
        await cdp.evaluate(`(() => {
          const skipBtn = document.querySelector('.skip-forward-btn');
          if (skipBtn) skipBtn.click();
        })()`);
      }
      await sample(`Cycle ${cycle} - Main Player (Active + Lyrics)`);

      // Close lyrics in Main Player
      await cdp.evaluate(`(() => {
        const lyricsBtn = document.querySelector('.lyrics-btn');
        if (lyricsBtn) lyricsBtn.click();
      })()`);
      await sleep(2000);

      // 2. Switch to Standard MiniPlayer
      console.log(`\n[Cycle ${cycle}] 2. Standard MiniPlayer: Enter + 2 Skips`);
      await cdp.evaluate(`(async () => {
        if (window.api && window.api.miniPlayer) {
          await window.api.miniPlayer.setMiniPlayerMode('standard');
        }
        if (window.api && window.api.windowControls) {
          await window.api.windowControls.changePlayerType('mini');
        }
      })()`);
      await sleep(2000);

      for (let s = 1; s <= 2; s++) {
        await sleep(1500);
        await cdp.evaluate(`(() => {
          const skipBtn = document.querySelector('.skip-forward-btn, button[title*="Next" i]');
          if (skipBtn) skipBtn.click();
        })()`);
      }
      await sample(`Cycle ${cycle} - Standard MiniPlayer`);

      // 3. Switch to Compact MiniPlayer
      console.log(`\n[Cycle ${cycle}] 3. Compact MiniPlayer: Enter + 2 Skips`);
      await cdp.evaluate(`(async () => {
        if (window.api && window.api.miniPlayer) {
          await window.api.miniPlayer.setMiniPlayerMode('compact');
        }
      })()`);
      await sleep(2000);

      for (let s = 1; s <= 2; s++) {
        await sleep(1500);
        await cdp.evaluate(`(() => {
          const skipBtn = document.querySelector('.skip-forward-btn, button[title*="Next" i]');
          if (skipBtn) skipBtn.click();
        })()`);
      }
      await sample(`Cycle ${cycle} - Compact MiniPlayer`);
    }

    // Return to Main Player and Rest
    console.log('\n--- Final Post-Cycle Rest on Main Player (30s) ---');
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.windowControls) {
        await window.api.windowControls.changePlayerType('normal');
      }
    })()`);
    for (let s = 1; s <= 30; s++) {
      await sleep(1000);
      if (s % 10 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await sample('4. Final Rest Main Player');

    cdp.close();
  } catch (err) {
    console.error(`[Test Error]: ${err.message}`, err);
  } finally {
    console.log('\n[Runner] Cleaning up and terminating Nora...');
    killAllNora();
  }

  const outPath = path.join(rootDir, 'memory_attribution_cycles_report.json');
  fs.writeFileSync(outPath, JSON.stringify(telemetryLog, null, 2), 'utf8');
  console.log(`\n[Runner] Report saved to ${outPath}\n`);
}

runMultiCycleAttributionTest();
