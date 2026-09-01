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
  try {
    execSync('taskkill /IM electron.exe /F /T', { stdio: 'ignore' });
  } catch (e) {}
  try {
    execSync('taskkill /IM nora.exe /F /T', { stdio: 'ignore' });
  } catch (e) {}
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

export async function getCDPTarget(port = 9876, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(
          (t) => t.type === 'page' && (t.title === 'Nora' || t.url?.includes('index.html'))
        );
        if (page && page.webSocketDebuggerUrl) {
          return page;
        }
      }
    } catch (e) {}
    await sleep(1000);
  }
  throw new Error(`Could not find Nora CDP target on port ${port} after ${maxAttempts}s`);
}

async function runProductionWorkload() {
  console.log(`\n=================================================================`);
  console.log(` STARTING PRODUCTION BUNDLE MEMORY EXPERIMENT`);
  console.log(` Mode: Production Build (out/main/main.js) | DevTools: CLOSED`);
  console.log(`=================================================================\n`);

  killAllNora();
  await sleep(2000);

  // Launch compiled production Electron app
  console.log('[Runner] Launching Nora Production Bundle on port 9876...');
  spawn('npx.cmd', ['electron', './out/main/main.js', '--remote-debugging-port=9876'], {
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NORA_DEVTOOLS_CLOSED: '1',
      REMOTE_DEBUGGING_PORT: '9876'
    },
    stdio: 'ignore'
  });

  const timeline = [];

  try {
    const pageTarget = await getCDPTarget(9876);
    console.log(
      `[Runner] Connected to Nora Production CDP Target: ${pageTarget.title} (${pageTarget.url})`
    );

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Performance.enable');

    async function recordStep(stepName, elapsedSec) {
      const proc = getProcessMemoryMetrics();
      const perf = await cdp.getPerformanceMetrics();
      const heapUsedMB = Math.round(((perf.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100;
      const heapTotalMB = Math.round(((perf.JSHeapTotalSize || 0) / 1024 / 1024) * 100) / 100;
      const listeners = perf.JSEventListeners || 0;
      const nodes = perf.Nodes || 0;

      const row = {
        step: stepName,
        elapsedSec,
        mainWS: proc?.main.ws || 0,
        mainPM: proc?.main.pm || 0,
        rendererWS: proc?.renderer.ws || 0,
        rendererPM: proc?.renderer.pm || 0,
        gpuWS: proc?.gpu.ws || 0,
        gpuPM: proc?.gpu.pm || 0,
        totalWS: proc?.totalWS || 0,
        totalPM: proc?.totalPM || 0,
        jsHeapUsedMB: heapUsedMB,
        jsHeapTotalMB: heapTotalMB,
        listeners,
        nodes
      };

      timeline.push(row);

      console.log(
        `[T+${Math.floor(elapsedSec / 60)}m | ${stepName}] Total: ${row.totalWS} MB (PM: ${row.totalPM} MB) | ` +
          `Renderer: ${row.rendererWS} MB (PM: ${row.rendererPM} MB) | ` +
          `GPU: ${row.gpuWS} MB | ` +
          `Main: ${row.mainWS} MB | ` +
          `Heap: ${heapUsedMB} MB | Listeners: ${listeners} | Nodes: ${nodes}`
      );

      return row;
    }

    // Step 0: Launch
    console.log('\n--- Step 0: Fresh Launch (T0) ---');
    await recordStep('T0 (Launch)', 0);

    // Step 1: Idle
    console.log('\n--- Step 1: Idle on Home (Waiting 60s)... ---');
    for (let s = 1; s <= 60; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+1m (Idle)', 60);

    // Step 2: Playback & Lyrics
    console.log('\n--- Step 2: Start Playback & Open Lyrics (T+2m)... ---');
    await cdp.evaluate(`(() => {
      const playBtn = document.querySelector('.play-pause-btn');
      if (playBtn) playBtn.click();
      const lyricsBtn = document.querySelector('.lyrics-btn');
      if (lyricsBtn) lyricsBtn.click();
    })()`);

    for (let s = 1; s <= 60; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+2m (Play+Lyrics)', 120);

    // Step 3: 5 linear skips
    console.log('\n--- Step 3: 5 Track Skips (T+3m)... ---');
    for (let skip = 1; skip <= 5; skip++) {
      await cdp.evaluate(`(() => {
        const nextBtn = document.querySelector('.skip-forward-btn') || document.querySelector('[aria-label*="next" i]');
        if (nextBtn) nextBtn.click();
      })()`);
      console.log(`  Skip ${skip}/5 triggered`);
      for (let s = 1; s <= 10; s++) {
        await sleep(1000);
      }
    }
    for (let s = 1; s <= 10; s++) {
      await sleep(1000);
    }
    await recordStep('T+3m (5 Skips)', 180);

    // Step 4: 10 rapid skips
    console.log('\n--- Step 4: 10 Rapid Track Skips (T+4m)... ---');
    for (let skip = 1; skip <= 10; skip++) {
      await cdp.evaluate(`(() => {
        const nextBtn = document.querySelector('.skip-forward-btn') || document.querySelector('[aria-label*="next" i]');
        if (nextBtn) nextBtn.click();
      })()`);
      await sleep(500);
    }
    for (let s = 1; s <= 55; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+4m (10 Rapid Skips Peak)', 240);

    // Step 5: Stop playback & return home
    console.log('\n--- Step 5: Stop Playback & Navigate Home (T+5m)... ---');
    await cdp.evaluate(`(() => {
      const playBtn = document.querySelector('.play-pause-btn');
      if (playBtn) playBtn.click();
      const lyricsBtn = document.querySelector('.lyrics-btn');
      if (lyricsBtn) lyricsBtn.click();
    })()`);

    for (let s = 1; s <= 60; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+5m (Stopped/Home)', 300);

    // Step 6: 60s Rest
    console.log('\n--- Step 6: Post-Workload Rest (60s)... ---');
    for (let s = 1; s <= 60; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+6m (Post-Rest Retention)', 360);

    cdp.close();
  } catch (err) {
    console.error(`[Runner Error]: ${err.message}`, err);
  } finally {
    console.log('\n[Runner] Cleaning up and terminating Nora processes...');
    killAllNora();
  }

  // Save report
  const reportPath = path.join(rootDir, 'memory_report_run_production.json');
  fs.writeFileSync(reportPath, JSON.stringify({ mode: 'production', timeline }, null, 2), 'utf8');
  console.log(`\n[Runner] Report saved to ${reportPath}`);

  return timeline;
}

runProductionWorkload()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
