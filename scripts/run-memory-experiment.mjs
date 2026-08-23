import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const flagsFilePath = path.join(rootDir, 'src', 'renderer', 'src', 'utils', 'debug', 'memoryExperiments.ts');

export const RUN_CONFIGS = {
  '0A': {
    name: 'Run 0A: DevTools CLOSED (Current Code)',
    flags: { DISABLE_STORE_CLONE_LOGGING: false, DISABLE_AMBIENT_BACKGROUND: false, DISABLE_LYRICS_POSITION_LISTENERS: false, SUPPRESS_LASTFM_ERRORS: false },
    devtoolsClosed: true
  },
  '0B': {
    name: 'Run 0B: DevTools OPEN (Current Code Baseline)',
    flags: { DISABLE_STORE_CLONE_LOGGING: false, DISABLE_AMBIENT_BACKGROUND: false, DISABLE_LYRICS_POSITION_LISTENERS: false, SUPPRESS_LASTFM_ERRORS: false },
    devtoolsClosed: false
  },
  '1': {
    name: 'Run 1: Disable cloneDeep logging (DevTools Open)',
    flags: { DISABLE_STORE_CLONE_LOGGING: true, DISABLE_AMBIENT_BACKGROUND: false, DISABLE_LYRICS_POSITION_LISTENERS: false, SUPPRESS_LASTFM_ERRORS: false },
    devtoolsClosed: false
  },
  '2': {
    name: 'Run 2: Disable Ambient Background (DevTools Open)',
    flags: { DISABLE_STORE_CLONE_LOGGING: false, DISABLE_AMBIENT_BACKGROUND: true, DISABLE_LYRICS_POSITION_LISTENERS: false, SUPPRESS_LASTFM_ERRORS: false },
    devtoolsClosed: false
  },
  '3': {
    name: 'Run 3: Disable Lyrics Position Listeners (DevTools Open)',
    flags: { DISABLE_STORE_CLONE_LOGGING: false, DISABLE_AMBIENT_BACKGROUND: false, DISABLE_LYRICS_POSITION_LISTENERS: true, SUPPRESS_LASTFM_ERRORS: false },
    devtoolsClosed: false
  },
  '4': {
    name: 'Run 4: Suppress Last.fm Errors (DevTools Open)',
    flags: { DISABLE_STORE_CLONE_LOGGING: false, DISABLE_AMBIENT_BACKGROUND: false, DISABLE_LYRICS_POSITION_LISTENERS: false, SUPPRESS_LASTFM_ERRORS: true },
    devtoolsClosed: false
  },
  '5': {
    name: 'Run 5: Combined Validation (A + B + C) (DevTools Open)',
    flags: { DISABLE_STORE_CLONE_LOGGING: true, DISABLE_AMBIENT_BACKGROUND: true, DISABLE_LYRICS_POSITION_LISTENERS: true, SUPPRESS_LASTFM_ERRORS: false },
    devtoolsClosed: false
  },
  'permanent': {
    name: 'Run Permanent: Production Fixes Applied (DevTools OPEN)',
    flags: {},
    devtoolsClosed: false
  },
  'permanent_closed': {
    name: 'Run Permanent: Production Fixes Applied (DevTools CLOSED)',
    flags: {},
    devtoolsClosed: true
  }
};

export function writeFlags(flags) {
  if (!flags || Object.keys(flags).length === 0) return;
  if (!fs.existsSync(path.dirname(flagsFilePath))) {
    fs.mkdirSync(path.dirname(flagsFilePath), { recursive: true });
  }
  if (!fs.existsSync(flagsFilePath) && (!flags || Object.keys(flags).length === 0)) return;
  const content = `export const MEMORY_EXPERIMENTS = {
  // Test A: Disable cloneDeep(currentState) in store.subscribe
  DISABLE_STORE_CLONE_LOGGING: ${flags.DISABLE_STORE_CLONE_LOGGING ?? false},

  // Test B: Disable LyricsAmbientBackground component entirely (render null)
  DISABLE_AMBIENT_BACKGROUND: ${flags.DISABLE_AMBIENT_BACKGROUND ?? false},

  // Test C: Disable per-line and per-word 10Hz positionChange listeners entirely
  DISABLE_LYRICS_POSITION_LISTENERS: ${flags.DISABLE_LYRICS_POSITION_LISTENERS ?? false},

  // Test D: Suppress Last.fm online queries in dev mode
  SUPPRESS_LASTFM_ERRORS: ${flags.SUPPRESS_LASTFM_ERRORS ?? false},
};
`;
  if (fs.existsSync(flagsFilePath) || (flags && Object.keys(flags).length > 0 && flags.DISABLE_STORE_CLONE_LOGGING !== undefined)) {
    fs.writeFileSync(flagsFilePath, content, 'utf8');
  }
}

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

export async function runExperiment(runKey) {
  const config = RUN_CONFIGS[runKey];
  if (!config) {
    console.error(`Unknown runKey: ${runKey}. Supported: ${Object.keys(RUN_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=================================================================`);
  console.log(` STARTING EXPERIMENT: ${config.name}`);
  console.log(` Flags: ${JSON.stringify(config.flags)} | DevToolsClosed: ${config.devtoolsClosed}`);
  console.log(`=================================================================\n`);

  killAllNora();
  await sleep(2000);

  // Write experiment flags
  writeFlags(config.flags);

  // Prepare environment
  const env = {
    ...process.env,
    NORA_DEVTOOLS_CLOSED: config.devtoolsClosed ? '1' : ''
  };

  // Launch Electron with remote debugging port 9876
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

  const timeline = [];

  try {
    console.log('[Runner] Waiting for Nora CDP target on port 9876...');
    const target = await getCDPTarget(9876, 45);
    console.log(`[Runner] Connected to Nora CDP Target: ${target.title} (${target.url})`);

    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Performance.enable');

    async function recordStep(stepName, elapsedSec) {
      const proc = getProcessMemoryMetrics();
      let cdpMetrics = null;
      try {
        cdpMetrics = await cdp.getPerformanceMetrics();
      } catch (e) { }

      const jsHeapUsedMB = cdpMetrics?.JSHeapUsedSize ? Math.round((cdpMetrics.JSHeapUsedSize / 1024 / 1024) * 100) / 100 : null;
      const jsHeapTotalMB = cdpMetrics?.JSHeapTotalSize ? Math.round((cdpMetrics.JSHeapTotalSize / 1024 / 1024) * 100) / 100 : null;
      const listeners = cdpMetrics?.JSEventListeners ?? null;

      const record = {
        step: stepName,
        elapsedSec,
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

      timeline.push(record);
      console.log(`[T+${Math.round(elapsedSec / 60)}m | ${stepName}] Total: ${record.totalWS} MB (PM: ${record.totalPM} MB) | Renderer: ${record.rendererWS} MB (PM: ${record.rendererPM} MB) | GPU: ${record.gpuWS} MB | Main: ${record.mainWS} MB | Heap: ${record.jsHeapUsedMB ?? 'N/A'} MB | Listeners: ${listeners ?? 'N/A'}`);
      return record;
    }

    // Step 0: Initial launch
    console.log('\n--- Step 0: Fresh Launch (T0) ---');
    await recordStep('T0 (Launch)', 0);

    // Step 1: Idle 60s
    console.log('\n--- Step 1: Idle on Home (Waiting 60s)... ---');
    for (let s = 1; s <= 60; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+1m (Idle)', 60);

    // Step 2: Start playback + open Lyrics
    console.log('\n--- Step 2: Start Playback & Open Lyrics (T+2m)... ---');
    await cdp.evaluate(`(() => {
      // 1. If not playing, click play button
      const playBtn = document.querySelector('.play-pause-btn');
      if (playBtn) playBtn.click();
      
      // 2. Click lyrics button to open lyrics view
      setTimeout(() => {
        const lyricsBtn = document.querySelector('.lyrics-btn');
        if (lyricsBtn) lyricsBtn.click();
      }, 1000);
    })()`);

    for (let s = 1; s <= 60; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+2m (Play+Lyrics)', 120);

    // Step 3: 5 Skips
    console.log('\n--- Step 3: 5 Rapid Track Skips (T+3m)... ---');
    for (let i = 1; i <= 5; i++) {
      await cdp.evaluate(`(() => {
        const skipBtn = document.querySelector('.skip-forward-btn');
        if (skipBtn) skipBtn.click();
      })()`);
      await sleep(2000);
    }
    // Wait remaining 50s
    for (let s = 1; s <= 50; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+3m (5 Skips)', 180);

    // Step 4: 10 Rapid Skips
    console.log('\n--- Step 4: 10 Rapid Track Skips (T+4m)... ---');
    for (let i = 1; i <= 10; i++) {
      await cdp.evaluate(`(() => {
        const skipBtn = document.querySelector('.skip-forward-btn');
        if (skipBtn) skipBtn.click();
      })()`);
      await sleep(500);
    }
    // Wait remaining 55s
    for (let s = 1; s <= 55; s++) {
      await sleep(1000);
      if (s % 15 === 0) process.stdout.write(` ${s}s...`);
    }
    console.log('');
    await recordStep('T+4m (10 Rapid Skips Peak)', 240);

    // Step 5: Stop playback & return to Home
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

    // Step 6: Rest measurement (Retention)
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
    // Reset flags if run was using flags
    if (config?.flags && Object.keys(config.flags).length > 0) {
      writeFlags({
        DISABLE_STORE_CLONE_LOGGING: false,
        DISABLE_AMBIENT_BACKGROUND: false,
        DISABLE_LYRICS_POSITION_LISTENERS: false,
        SUPPRESS_LASTFM_ERRORS: false
      });
    }
  }

  // Save report
  const reportPath = path.join(rootDir, `memory_report_run_${runKey}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ config, timeline }, null, 2), 'utf8');
  console.log(`\n[Runner] Report saved to ${reportPath}`);

  return { config, timeline };
}

const targetRun =
  process.argv.find((a) => a.startsWith('--run='))?.split('=')[1] ||
  (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined) ||
  'permanent';
runExperiment(targetRun).then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
