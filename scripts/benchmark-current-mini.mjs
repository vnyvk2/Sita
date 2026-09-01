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

export function sampleProcessMetrics(sampleDurationSeconds = 5) {
  try {
    const psCmd = `
      $sampleSec = ${sampleDurationSeconds}
      $p1 = Get-Process -Name "electron", "nora" -ErrorAction SilentlyContinue
      if (-not $p1) { return "null" }
      
      $t1 = [System.Diagnostics.Stopwatch]::StartNew()
      $cpu1 = @{}
      foreach ($p in $p1) {
        $cpu1[[string]$p.Id] = $p.TotalProcessorTime.TotalMilliseconds
      }
      
      Start-Sleep -Seconds $sampleSec
      $t1.Stop()
      $elapsedMs = $t1.ElapsedMilliseconds
      $coreCount = [Environment]::ProcessorCount
      
      $p2 = Get-Process -Name "electron", "nora" -ErrorAction SilentlyContinue
      $cimMap = @{}
      try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'electron*' -or $_.Name -like 'nora*' } | ForEach-Object {
          $cimMap[[string]$_.ProcessId] = $_.CommandLine
        }
      } catch {}

      $list = @()
      foreach ($p in $p2) {
        $cmd = $cimMap[[string]$p.Id]
        $role = "Main"
        if ($cmd -match "--type=renderer") { $role = "Renderer" }
        elseif ($cmd -match "--type=gpu-process") { $role = "GPU" }
        elseif ($cmd -match "--type=utility") { $role = "Utility" }
        elseif ($cmd -match "--type=crashpad-handler") { $role = "Crashpad" }

        $msPrev = if ($cpu1.ContainsKey([string]$p.Id)) { $cpu1[[string]$p.Id] } else { $p.TotalProcessorTime.TotalMilliseconds }
        $cpuDeltaMs = [math]::Max(0, $p.TotalProcessorTime.TotalMilliseconds - $msPrev)
        $cpuPercent = [math]::Round(($cpuDeltaMs / ($elapsedMs * $coreCount)) * 100, 2)

        $list += [PSCustomObject]@{
          pid = $p.Id
          role = $role
          workingSetMB = [math]::Round($p.WorkingSet64 / 1MB, 2)
          privateMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 2)
          cpuPercent = $cpuPercent
        }
      }
      $list | ConvertTo-Json -Compress
    `;

    const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      encoding: 'utf8',
      timeout: 20000
    });
    const raw = res.stdout?.trim();
    if (!raw || raw === 'null') return null;

    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    const summary = {
      main: { ws: 0, pm: 0, cpu: 0 },
      renderer: { ws: 0, pm: 0, cpu: 0 },
      gpu: { ws: 0, pm: 0, cpu: 0 },
      utility: { ws: 0, pm: 0, cpu: 0 },
      mainWS: 0,
      rendererWS: 0,
      gpuWS: 0,
      totalWS: 0,
      totalPM: 0,
      totalCPU: 0
    };

    for (const item of list) {
      summary.totalWS += item.workingSetMB;
      summary.totalPM += item.privateMB;
      summary.totalCPU += item.cpuPercent;

      const roleKey = item.role.toLowerCase();
      if (summary[roleKey]) {
        summary[roleKey].ws += item.workingSetMB;
        summary[roleKey].pm += item.privateMB;
        summary[roleKey].cpu += item.cpuPercent;
      }
    }

    summary.totalWS = Math.round(summary.totalWS * 100) / 100;
    summary.totalPM = Math.round(summary.totalPM * 100) / 100;
    summary.totalCPU = Math.round(summary.totalCPU * 100) / 100;
    summary.main.ws = Math.round(summary.main.ws * 100) / 100;
    summary.main.cpu = Math.round(summary.main.cpu * 100) / 100;
    summary.renderer.ws = Math.round(summary.renderer.ws * 100) / 100;
    summary.renderer.cpu = Math.round(summary.renderer.cpu * 100) / 100;
    summary.gpu.ws = Math.round(summary.gpu.ws * 100) / 100;
    summary.gpu.cpu = Math.round(summary.gpu.cpu * 100) / 100;

    summary.mainWS = summary.main.ws;
    summary.rendererWS = summary.renderer.ws;
    summary.gpuWS = summary.gpu.ws;

    return summary;
  } catch (err) {
    console.error('Failed to sample process metrics', err);
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

async function runCurrentMiniPlayerBaseline() {
  console.log(`\n=================================================================`);
  console.log(` CURRENT MINIPLAYER EMPIRICAL BASELINE BENCHMARK`);
  console.log(` Capturing the 7 Decision-Point Metrics for Current Nora`);
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

  const baselineResults = {};

  try {
    console.log('[Runner] Waiting for Nora CDP target on port 9876...');
    const target = await getCDPTarget(9876, 45);
    console.log(`[Runner] Connected to Nora CDP Target: ${target.title}`);

    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    console.log('\n[1] Initializing Main Player and populating playback queue...');
    await sleep(3000);

    // 1. Switch to MiniPlayer mode
    console.log('[2] Switching to Standard MiniPlayer mode...');
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.miniPlayer) {
        await window.api.miniPlayer.setMiniPlayerMode('standard');
      }
      if (window.api && window.api.windowControls) {
        await window.api.windowControls.changePlayerType('mini');
      }
    })()`);
    await sleep(4000);

    // ==========================================
    // TEST 1: MiniPlayer Idle / Paused
    // ==========================================
    console.log('\n--- Measuring MiniPlayer IDLE / PAUSED State (5s sample) ---');
    await cdp.evaluate(`(() => {
      const audio = document.querySelector('audio');
      if (audio && !audio.paused) audio.pause();
    })()`);
    await sleep(2000);

    const idleMetrics = await cdp.getPerformanceMetrics();
    const idleProc = sampleProcessMetrics(5);

    console.log(
      `  [Idle] Total WS: ${idleProc.totalWS} MB | Renderer WS: ${idleProc.rendererWS} MB | GPU: ${idleProc.gpuWS} MB | Main: ${idleProc.mainWS} MB`
    );
    console.log(
      `  [Idle] CPU Total: ${idleProc.totalCPU}% (Renderer: ${idleProc.renderer.cpu}%, Main: ${idleProc.main.cpu}%, GPU: ${idleProc.gpu.cpu}%)`
    );
    console.log(
      `  [Idle] Listeners: ${idleMetrics.JSEventListeners} | DOM Nodes: ${idleMetrics.Nodes} | JS Heap: ${Math.round((idleMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100} MB`
    );

    baselineResults.idle = {
      totalWS: idleProc.totalWS,
      rendererWS: idleProc.rendererWS,
      gpuWS: idleProc.gpuWS,
      mainWS: idleProc.mainWS,
      cpuTotal: idleProc.totalCPU,
      cpuRenderer: idleProc.renderer.cpu,
      cpuMain: idleProc.main.cpu,
      cpuGPU: idleProc.gpu.cpu,
      jsHeapUsedMB: Math.round((idleMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100,
      listeners: idleMetrics.JSEventListeners,
      domNodes: idleMetrics.Nodes,
      taskDuration: idleMetrics.TaskDuration ?? 0,
      scriptDuration: idleMetrics.ScriptDuration ?? 0
    };

    // ==========================================
    // TEST 2: MiniPlayer Active PLAYING
    // ==========================================
    console.log('\n--- Measuring MiniPlayer ACTIVE PLAYING State (5s sample) ---');
    await cdp.evaluate(`(() => {
      const playBtn = document.querySelector('.play-pause-btn, button[title*="Play" i]');
      if (playBtn) playBtn.click();
      const audio = document.querySelector('audio');
      if (audio && audio.paused) audio.play();
    })()`);
    await sleep(2000);

    const playingMetrics = await cdp.getPerformanceMetrics();
    const playingProc = sampleProcessMetrics(5);

    console.log(
      `  [Playing] Total WS: ${playingProc.totalWS} MB | Renderer WS: ${playingProc.rendererWS} MB | GPU: ${playingProc.gpuWS} MB | Main: ${playingProc.mainWS} MB`
    );
    console.log(
      `  [Playing] CPU Total: ${playingProc.totalCPU}% (Renderer: ${playingProc.renderer.cpu}%, Main: ${playingProc.main.cpu}%, GPU: ${playingProc.gpu.cpu}%)`
    );
    console.log(
      `  [Playing] Listeners: ${playingMetrics.JSEventListeners} | DOM Nodes: ${playingMetrics.Nodes} | JS Heap: ${Math.round((playingMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100} MB`
    );

    baselineResults.playing = {
      totalWS: playingProc.totalWS,
      rendererWS: playingProc.rendererWS,
      gpuWS: playingProc.gpuWS,
      mainWS: playingProc.mainWS,
      cpuTotal: playingProc.totalCPU,
      cpuRenderer: playingProc.renderer.cpu,
      cpuMain: playingProc.main.cpu,
      cpuGPU: playingProc.gpu.cpu,
      jsHeapUsedMB: Math.round((playingMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100,
      listeners: playingMetrics.JSEventListeners,
      domNodes: playingMetrics.Nodes,
      taskDuration: playingMetrics.TaskDuration ?? 0,
      scriptDuration: playingMetrics.ScriptDuration ?? 0
    };

    // ==========================================
    // TEST 3: Compact MiniPlayer Active PLAYING
    // ==========================================
    console.log('\n--- Measuring Compact MiniPlayer ACTIVE PLAYING State (5s sample) ---');
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.miniPlayer) {
        await window.api.miniPlayer.setMiniPlayerMode('compact');
      }
    })()`);
    await sleep(2000);

    const compactMetrics = await cdp.getPerformanceMetrics();
    const compactProc = sampleProcessMetrics(5);

    console.log(
      `  [Compact Playing] Total WS: ${compactProc.totalWS} MB | Renderer WS: ${compactProc.rendererWS} MB | GPU: ${compactProc.gpuWS} MB | Main: ${compactProc.mainWS} MB`
    );
    console.log(
      `  [Compact Playing] CPU Total: ${compactProc.totalCPU}% (Renderer: ${compactProc.renderer.cpu}%, Main: ${compactProc.main.cpu}%, GPU: ${compactProc.gpu.cpu}%)`
    );
    console.log(
      `  [Compact Playing] Listeners: ${compactMetrics.JSEventListeners} | DOM Nodes: ${compactMetrics.Nodes} | JS Heap: ${Math.round((compactMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100} MB`
    );

    baselineResults.compactPlaying = {
      totalWS: compactProc.totalWS,
      rendererWS: compactProc.rendererWS,
      gpuWS: compactProc.gpuWS,
      mainWS: compactProc.mainWS,
      cpuTotal: compactProc.totalCPU,
      cpuRenderer: compactProc.renderer.cpu,
      cpuMain: compactProc.main.cpu,
      cpuGPU: compactProc.gpu.cpu,
      jsHeapUsedMB: Math.round((compactMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100,
      listeners: compactMetrics.JSEventListeners,
      domNodes: compactMetrics.Nodes,
      taskDuration: compactMetrics.TaskDuration ?? 0,
      scriptDuration: compactMetrics.ScriptDuration ?? 0
    };

    cdp.close();
  } catch (err) {
    console.error(`[Benchmark Error]: ${err.message}`, err);
  } finally {
    console.log('\n[Runner] Cleaning up and terminating Nora...');
    killAllNora();
  }

  const outPath = path.join(rootDir, 'current_mini_baseline_report.json');
  fs.writeFileSync(outPath, JSON.stringify(baselineResults, null, 2), 'utf8');
  console.log(`\n[Runner] Baseline report saved to ${outPath}\n`);
}

runCurrentMiniPlayerBaseline();
