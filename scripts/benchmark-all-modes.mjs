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
    summary.gpu.ws = Math.round(summary.gpu.gpu || summary.gpu.ws * 100) / 100;
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

async function benchmark() {
  console.log(`\n=================================================================`);
  console.log(` STARTING 3-MODE COMPREHENSIVE MEMORY BENCHMARK`);
  console.log(` Modes: 1. Main Player | 2. Standard MiniPlayer | 3. Compact MiniPlayer`);
  console.log(` States per mode: (1) Normally Playing | (2) Opened Lyrics | (3) Traversing Queue`);
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

  const results = {};

  try {
    console.log('[Runner] Waiting for Nora CDP target on port 9876...');
    const target = await getCDPTarget(9876, 45);
    console.log(`[Runner] Connected to Nora CDP Target: ${target.title}`);

    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    async function recordSnapshot(label) {
      // Settle time
      await sleep(5000);
      const proc = getProcessMemoryMetrics();
      let cdpMetrics = null;
      try {
        cdpMetrics = await cdp.getPerformanceMetrics();
      } catch (e) { }

      const jsHeapUsedMB = cdpMetrics?.JSHeapUsedSize ? Math.round((cdpMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100 : null;
      const jsHeapTotalMB = cdpMetrics?.JSHeapTotalSize ? Math.round((cdpMetrics.JSHeapTotalSize / 1024 / 1024) * 100) / 100 : null;
      const listeners = cdpMetrics?.JSEventListeners ?? null;

      const record = {
        label,
        mainWS: proc?.main?.ws ?? 0,
        mainPM: proc?.main?.pm ?? 0,
        rendererWS: proc?.renderer?.ws ?? 0,
        rendererPM: proc?.renderer?.pm ?? 0,
        gpuWS: proc?.gpu?.ws ?? 0,
        gpuPM: proc?.gpu?.pm ?? 0,
        totalWS: proc?.totalWS ?? 0,
        totalPM: proc?.totalPM ?? 0,
        jsHeapUsedMB,
        jsHeapTotalMB,
        listeners
      };

      console.log(`  [${label}] Total WS: ${record.totalWS} MB (PM: ${record.totalPM} MB) | Renderer: ${record.rendererWS} MB | GPU: ${record.gpuWS} MB | Main: ${record.mainWS} MB | JS Heap: ${record.jsHeapUsedMB} MB`);
      return record;
    }

    // Initial launch stabilization
    console.log('\n--- Stabilizing Nora Launch State (10s) ---');
    await sleep(10000);

    // ==========================================
    // 1. MAIN PLAYER BENCHMARK
    // ==========================================
    console.log('\n=== [MODE 1: MAIN PLAYER (FULL WINDOW)] ===');

    // Make sure we are in normal player
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.windowControls) {
        await window.api.windowControls.changePlayerType('normal');
      }
    })()`);
    await sleep(3000);

    // 1.1 Normally Playing
    console.log('\n(1) Main Player - Normally Playing:');
    await cdp.evaluate(`(() => {
      const playBtn = document.querySelector('.play-pause-btn');
      if (playBtn) playBtn.click();
    })()`);
    results['MainPlayer_Playing'] = await recordSnapshot('Main Player: Normally Playing');

    // 1.2 Opened Lyrics
    console.log('\n(2) Main Player - Opened Lyrics:');
    await cdp.evaluate(`(() => {
      const lyricsBtn = document.querySelector('.lyrics-btn');
      if (lyricsBtn) lyricsBtn.click();
    })()`);
    results['MainPlayer_Lyrics'] = await recordSnapshot('Main Player: Opened Lyrics');

    // 1.3 Traversing Queue (5 skips)
    console.log('\n(3) Main Player - Traversing Queue (5 skips):');
    for (let i = 1; i <= 5; i++) {
      await cdp.evaluate(`(() => {
        const skipBtn = document.querySelector('.skip-forward-btn');
        if (skipBtn) skipBtn.click();
      })()`);
      await sleep(1500);
    }
    results['MainPlayer_TraversingQueue'] = await recordSnapshot('Main Player: Traversing Queue');

    // Close lyrics view back
    await cdp.evaluate(`(() => {
      const lyricsBtn = document.querySelector('.lyrics-btn');
      if (lyricsBtn) lyricsBtn.click();
    })()`);
    await sleep(3000);

    // ==========================================
    // 2. STANDARD MINI PLAYER BENCHMARK
    // ==========================================
    console.log('\n=== [MODE 2: STANDARD MINI PLAYER] ===');

    // Set standard mode and switch to mini player
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.settingsHelpers) {
        await window.api.miniPlayer.setMiniPlayerMode('standard');
      }
      if (window.api && window.api.windowControls) {
        await window.api.windowControls.changePlayerType('mini');
      }
    })()`);
    await sleep(5000);

    // 2.1 Standard MiniPlayer - Normally Playing
    console.log('\n(1) Standard MiniPlayer - Normally Playing:');
    results['StandardMini_Playing'] = await recordSnapshot('Standard MiniPlayer: Normally Playing');

    // 2.2 Standard MiniPlayer - Opened Lyrics
    console.log('\n(2) Standard MiniPlayer - Opened Lyrics:');
    await cdp.evaluate(`(async () => {
      const lyricsBtn = document.querySelector('.mini-player-lyrics-btn, button[title*="Lyrics" i], button[title*="lyric" i]');
      if (lyricsBtn) lyricsBtn.click();
      else if (window.api && window.api.miniPlayer) {
        await window.api.miniPlayer.toggleMiniPlayerLyrics(true);
      }
    })()`);
    results['StandardMini_Lyrics'] = await recordSnapshot('Standard MiniPlayer: Opened Lyrics');

    // 2.3 Standard MiniPlayer - Traversing Queue (5 skips)
    console.log('\n(3) Standard MiniPlayer - Traversing Queue (5 skips):');
    for (let i = 1; i <= 5; i++) {
      await cdp.evaluate(`(() => {
        const skipBtn = document.querySelector('.skip-forward-btn, button[title*="Next" i]');
        if (skipBtn) skipBtn.click();
      })()`);
      await sleep(1500);
    }
    results['StandardMini_TraversingQueue'] = await recordSnapshot('Standard MiniPlayer: Traversing Queue');

    // Close lyrics in standard mini
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.miniPlayer) {
        await window.api.miniPlayer.toggleMiniPlayerLyrics(false);
      }
    })()`);
    await sleep(3000);

    // ==========================================
    // 3. COMPACT MINI PLAYER BENCHMARK
    // ==========================================
    console.log('\n=== [MODE 3: COMPACT MINI PLAYER] ===');

    // Switch to compact mode
    await cdp.evaluate(`(async () => {
      if (window.api && window.api.miniPlayer) {
        await window.api.miniPlayer.setMiniPlayerMode('compact');
      }
    })()`);
    await sleep(5000);

    // 3.1 Compact MiniPlayer - Normally Playing
    console.log('\n(1) Compact MiniPlayer - Normally Playing:');
    results['CompactMini_Playing'] = await recordSnapshot('Compact MiniPlayer: Normally Playing');

    // 3.2 Compact MiniPlayer - Opened Lyrics
    console.log('\n(2) Compact MiniPlayer - Opened Lyrics:');
    await cdp.evaluate(`(async () => {
      const lyricsBtn = document.querySelector('.compact-mini-player-lyrics-btn, button[title*="Lyrics" i]');
      if (lyricsBtn) lyricsBtn.click();
      else if (window.api && window.api.miniPlayer) {
        await window.api.miniPlayer.toggleMiniPlayerLyrics(true);
      }
    })()`);
    results['CompactMini_Lyrics'] = await recordSnapshot('Compact MiniPlayer: Opened Lyrics');

    // 3.3 Compact MiniPlayer - Traversing Queue (5 skips)
    console.log('\n(3) Compact MiniPlayer - Traversing Queue (5 skips):');
    for (let i = 1; i <= 5; i++) {
      await cdp.evaluate(`(() => {
        const skipBtn = document.querySelector('.skip-forward-btn, button[title*="Next" i]');
        if (skipBtn) skipBtn.click();
      })()`);
      await sleep(1500);
    }
    results['CompactMini_TraversingQueue'] = await recordSnapshot('Compact MiniPlayer: Traversing Queue');

    cdp.close();
  } catch (err) {
    console.error(`[Benchmark Error]: ${err.message}`, err);
  } finally {
    console.log('\n[Runner] Cleaning up and terminating Nora...');
    killAllNora();
  }

  const outPath = path.join(rootDir, 'memory_report_modes_comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n[Runner] Full multi-mode benchmark report saved to ${outPath}\n`);
}

benchmark();
