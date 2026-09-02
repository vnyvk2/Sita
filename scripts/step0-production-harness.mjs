import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CDPClient, getCDPTarget, killAllNora, sleep } from './benchmark-songs-tab.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function getDetailedProcessMemory() {
  try {
    const stdout = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match \'electron|nora\' } | Select-Object ProcessId, CommandLine, WorkingSetSize, PrivatePageCount | ConvertTo-Json"',
      { encoding: 'utf-8' }
    );
    const parsed = JSON.parse(stdout || '[]');
    const procs = Array.isArray(parsed) ? parsed : [parsed];
    const result = {
      main: 0,
      renderer: 0,
      gpu: 0,
      utility: 0,
      crashpad: 0,
      totalWS: 0,
      privateBytes: 0,
      details: []
    };

    for (const p of procs) {
      const cmd = p.CommandLine || '';
      const wsMB = +(p.WorkingSetSize / 1024 / 1024).toFixed(2);
      const privMB = +(p.PrivatePageCount / 1024 / 1024).toFixed(2);
      let type = 'Main';
      if (cmd.includes('--type=renderer')) {
        type = 'Renderer';
        result.renderer += wsMB;
      } else if (cmd.includes('--type=gpu-process')) {
        type = 'GPU';
        result.gpu += wsMB;
      } else if (cmd.includes('--type=utility')) {
        type = 'Utility';
        result.utility += wsMB;
      } else if (cmd.includes('--type=crashpad-handler')) {
        type = 'Crashpad';
        result.crashpad += wsMB;
      } else {
        result.main += wsMB;
      }

      result.totalWS += wsMB;
      result.privateBytes += privMB;
      result.details.push({ pid: p.ProcessId, type, wsMB, privMB });
    }

    result.main = +result.main.toFixed(2);
    result.renderer = +result.renderer.toFixed(2);
    result.gpu = +result.gpu.toFixed(2);
    result.utility = +result.utility.toFixed(2);
    result.crashpad = +result.crashpad.toFixed(2);
    result.totalWS = +result.totalWS.toFixed(2);
    result.privateBytes = +result.privateBytes.toFixed(2);
    return result;
  } catch {
    return null;
  }
}

async function runStep0ProductionHarness() {
  killAllNora();
  await sleep(1500);

  console.log('======================================================================');
  console.log(' STEP 0 ACCEPTANCE GATE: PACKAGED PRODUCTION BENCHMARK & MEMORY HARNESS');
  console.log(' (Real Minified Production Build | 1,297-Song Scripted Scroll)');
  console.log('======================================================================\n');

  console.log('[1/4] Ensuring clean production build...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  const electronBin = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const mainJs = path.join(rootDir, 'out', 'main', 'main.js');

  console.log('\n[2/4] Spawning Production Nora with real library and remote debugging port 9876...');
  const child = spawn(electronBin, [mainJs, '--remote-debugging-port=9876'], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NORA_USER_DATA: path.join(process.env.APPDATA, 'nora'),
      REMOTE_DEBUGGING_PORT: '9876',
      // Measure the application alone: React DevTools mirrors the component tree
      // in the renderer and dominates the DOM-node metric.
      NORA_NO_DEVTOOLS: '1'
    },
    stdio: 'ignore',
    detached: true
  });

  // Wait for CDP target (in production title is index.html, in dev it is Nora)
  let target = null;
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9876/json');
      if (res.ok) {
        const list = await res.json();
        const page = list.find(
          (t) =>
            t.type === 'page' &&
            t.title !== 'DevTools' &&
            (t.title === 'Nora' || t.title.includes('index.html') || t.url.includes('renderer/index.html'))
        );
        if (page && page.webSocketDebuggerUrl) {
          target = page;
          break;
        }
      }
    } catch {}
    await sleep(1000);
  }

  if (!target) {
    throw new Error('Could not find production Nora CDP page target on port 9876');
  }

  console.log(`[CDP] Connected to Production Target: ${target.title} (${target.url})`);

  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');

  const timeline = [];
  let isSampling = true;

  // Background 2-second sampler
  const samplerPromise = (async () => {
    const startTime = Date.now();
    while (isSampling) {
      const elapsedSec = +((Date.now() - startTime) / 1000).toFixed(1);
      const procMem = getDetailedProcessMemory();
      let cdpMetrics = null;
      try {
        const perf = await cdp.getPerformanceMetrics();
        cdpMetrics = {
          jsHeapUsedMB: +(perf.JSHeapUsedSize / 1024 / 1024).toFixed(2),
          jsHeapTotalMB: +(perf.JSHeapTotalSize / 1024 / 1024).toFixed(2),
          domNodes: perf.Nodes,
          listeners: perf.JSEventListeners
        };
      } catch {
        // Window might be navigating
      }

      if (procMem) {
        timeline.push({
          sec: elapsedSec,
          phase: currentPhase,
          mainWS: procMem.main,
          rendererWS: procMem.renderer,
          gpuWS: procMem.gpu,
          utilWS: +(procMem.utility + procMem.crashpad).toFixed(2),
          totalWS: procMem.totalWS,
          privateMB: procMem.privateBytes,
          jsHeapUsedMB: cdpMetrics?.jsHeapUsedMB ?? null,
          domNodes: cdpMetrics?.domNodes ?? null
        });
      }
      await sleep(2000);
    }
  })();

  let currentPhase = 'Cold Launch (Home)';
  console.log('\n--- PHASE 1: COLD LAUNCH (HOME TAB IDLE 6s) ---');
  await sleep(6000);

  currentPhase = 'Navigating to Songs';
  console.log('\n--- PHASE 2: NAVIGATING TO SONGS TAB (IDLE 5s) ---');
  await cdp.evaluate(`(() => {
    const link = document.querySelector('a[href*="songs"]');
    if (link) link.click();
  })()`);

  // Fail loudly if the renderer app never booted (empty window produces garbage numbers)
  const bootProbe = await cdp.evaluate(
    `({ ready: document.readyState, nodes: document.querySelectorAll('*').length, title: document.title })`
  );
  if (!bootProbe || bootProbe.nodes < 100) {
    throw new Error(
      `Renderer app did not boot (nodes=${bootProbe?.nodes}, readyState=${bootProbe?.readyState}, title=${bootProbe?.title}) — aborting to avoid invalid measurements`
    );
  }

  // Wait for Virtuoso scroller to mount
  for (let i = 0; i < 30; i++) {
    const hasScroller = await cdp.evaluate(
      `Boolean(document.querySelector('[data-virtuoso-scroller="true"]'))`
    );
    if (hasScroller) break;
    await sleep(500);
  }
  await sleep(3000);

  currentPhase = 'Active 1,297-Song Scroll';
  console.log('\n--- PHASE 3: CONTINUOUS SCRIPTED SCROLL (1,297 SONGS) ---');
  const scrollStats = await cdp.evaluate(`(async () => {
    const scroller = document.querySelector('[data-virtuoso-scroller="true"]');
    if (!scroller) return { error: 'No scroller found' };

    const totalHeight = scroller.scrollHeight;
    const step = 80;
    const frameTimes = [];
    let lastTime = performance.now();

    for (let pos = 0; pos <= totalHeight; pos += step) {
      const now = performance.now();
      frameTimes.push(now - lastTime);
      lastTime = now;
      scroller.scrollTop = pos;
      await new Promise(r => requestAnimationFrame(r));
    }
    await new Promise(r => setTimeout(r, 400));
    for (let pos = totalHeight; pos >= 0; pos -= step * 2) {
      const now = performance.now();
      frameTimes.push(now - lastTime);
      lastTime = now;
      scroller.scrollTop = pos;
      await new Promise(r => requestAnimationFrame(r));
    }

    const valid = frameTimes.slice(2);
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const jank16 = valid.filter(t => t > 16.67).length;
    const jank33 = valid.filter(t => t > 33.33).length;

    return {
      totalFrames: valid.length,
      avgFrameTimeMs: +avg.toFixed(2),
      fps: +(1000 / avg).toFixed(1),
      jank16Percent: +((jank16 / valid.length) * 100).toFixed(1),
      jank33Percent: +((jank33 / valid.length) * 100).toFixed(1)
    };
  })()`);

  console.log('Scroll Execution Telemetry:', scrollStats);

  currentPhase = 'Settling (10s Rest)';
  console.log('\n--- PHASE 4: POST-SCROLL SETTLED (10s REST) ---');
  await sleep(10000);

  currentPhase = 'Post-GC Check';
  console.log('\n--- PHASE 5: POST-GC STABILITY CHECK ---');
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
  } catch {}
  await sleep(4000);

  isSampling = false;
  await samplerPromise;

  // Inspect Query Cache state in production
  const queryState = await cdp.evaluate(`(() => {
    const qc = window.__noraProfile?.qc;
    if (!qc) return { available: false };
    const all = qc.getQueryCache().getAll();
    return {
      available: true,
      totalQueries: all.length,
      keys: all.map(q => JSON.stringify(q.queryKey))
    };
  })()`);

  cdp.close();
  killAllNora();

  console.log('\n======================================================================');
  console.log(' PRODUCTION BENCHMARK TIME-SERIES TELEMETRY (EVERY ~2 SECONDS)');
  console.log('======================================================================');
  console.table(timeline);

  const report = {
    summary: {
      coldLaunchWS: timeline.find(t => t.phase.includes('Cold'))?.totalWS,
      songsIdleWS: timeline.find(t => t.phase.includes('Navigating'))?.totalWS,
      peakActiveScrollWS: Math.max(...timeline.map(t => t.totalWS)),
      settledWS: timeline.find(t => t.phase.includes('Settling'))?.totalWS,
      postGCWS: timeline[timeline.length - 1]?.totalWS,
      mainProcessAvgWS: +(timeline.reduce((s, t) => s + t.mainWS, 0) / timeline.length).toFixed(2),
      gpuProcessPeakWS: Math.max(...timeline.map(t => t.gpuWS)),
      rendererPeakWS: Math.max(...timeline.map(t => t.rendererWS)),
      rendererSettledWS: timeline.find(t => t.phase.includes('Settling'))?.rendererWS,
      peakJSHeapMB: Math.max(...timeline.map(t => t.jsHeapUsedMB || 0)),
      settledJSHeapMB: timeline.find(t => t.phase.includes('Settling'))?.jsHeapUsedMB,
      scrollStats
    },
    queryState,
    timeline
  };

  const reportPath = path.join(rootDir, 'scripts', 'step0-production-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Saved full Step 0 report to ${reportPath}`);
}

runStep0ProductionHarness().catch(console.error);
