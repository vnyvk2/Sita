import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CDPClient, sleep, killAllNora } from './ab_benchmark_harness.mjs';

const rootDir = 'c:\\Users\\VINAY\\intellije-workspace\\Nora';
const db50kPath = 'c:\\Users\\VINAY\\intellije-workspace\\Nora\\temp\\nora-50k.sqlite.db';
const logFilePath = path.join(rootDir, 'temp', 'fling_main.log');

export async function captureFlingTrace(runLabel = 'Post_Revert_ScrollSeek_OFF') {
  console.log(`\n======================================================`);
  console.log(`>>> CAPTURING FLING TRACE: [${runLabel}] <<<`);
  console.log(`======================================================\n`);

  killAllNora();
  await sleep(1500);

  // Clear or initialize log file
  if (!fs.existsSync(path.dirname(logFilePath))) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  }
  const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });

  const PORT = 9876;
  const child = spawn(
    'npx.cmd',
    ['electron-vite', 'dev', '--watch=false', '--remoteDebuggingPort', String(PORT)],
    {
      cwd: rootDir,
      shell: true,
      env: {
        ...process.env,
        NORA_DEVTOOLS_CLOSED: '1',
        NORA_SCENARIO: '0',
        NORA_DB_FILE: db50kPath
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  let page = null;
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      if (res.ok) {
        const list = await res.json();
        const p = list.find((t) => t.type === 'page' && t.title === 'Nora');
        if (p?.webSocketDebuggerUrl) {
          page = p;
          break;
        }
      }
    } catch (e) {}
    await sleep(1000);
  }

  if (!page) {
    killAllNora();
    throw new Error('Failed to connect to Nora renderer via CDP');
  }

  const cdp = new CDPClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');

  console.log(`[${runLabel}] Connected to CDP. Waiting for initial load (6s)...`);
  await sleep(6000);

  console.log(`[${runLabel}] Navigating to Songs View...`);
  await cdp.evaluate(`location.hash = '#/main-player/songs'`);
  await sleep(4000);

  // Inject performance harness
  await cdp.evaluate(`(() => {
    window.__perfHarness = {
      frames: [],
      longTasks: [],
      running: false,
      start() {
        this.frames = [];
        this.longTasks = [];
        this.running = true;
        let lastTime = performance.now();
        const onFrame = (now) => {
          if (!this.running) return;
          this.frames.push(now - lastTime);
          lastTime = now;
          requestAnimationFrame(onFrame);
        };
        requestAnimationFrame(onFrame);
        try {
          this.observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              this.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
            }
          });
          this.observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {}
      },
      stop() {
        this.running = false;
        if (this.observer) this.observer.disconnect();
        const f = this.frames.slice(2);
        const avgFrameTime = f.reduce((a, b) => a + b, 0) / (f.length || 1);
        const fps = 1000 / avgFrameTime;
        const totalLongTaskDuration = this.longTasks.reduce((a, b) => a + b.duration, 0);
        return {
          totalFrames: f.length,
          avgFps: Math.round(fps * 10) / 10,
          avgFrameTimeMs: Math.round(avgFrameTime * 100) / 100,
          longTasksCount: this.longTasks.length,
          totalLongTaskDurationMs: Math.round(totalLongTaskDuration * 100) / 100
        };
      }
    };
    if (window.__SCROLL_TRACE__) {
      window.__SCROLL_TRACE__.reset();
    }
  })()`);

  console.log(`[${runLabel}] Executing 0 -> 4000 song fling (240,000px at high velocity)...`);
  await cdp.evaluate(`window.__perfHarness.start()`);

  // 68 steps of 3529px every 20ms = ~240,000px (song index ~4000)
  const STEPS = 68;
  const STEP_PX = 3529;
  const STEP_INTERVAL_MS = 20;

  for (let i = 0; i < STEPS; i++) {
    await cdp.evaluate(`(() => {
      const s = document.querySelector('[data-virtuoso-scroller="true"]');
      if (s) s.scrollTop += ${STEP_PX};
    })()`);
    await sleep(STEP_INTERVAL_MS);
  }

  console.log(`[${runLabel}] Fling stopped. Measuring post-stop catch-up period (4s)...`);
  await sleep(4000);

  const frameStats = await cdp.evaluate(`window.__perfHarness.stop()`);
  const traceSummary = await cdp.evaluate(`window.__SCROLL_TRACE__ ? window.__SCROLL_TRACE__.getSummary() : null`);

  cdp.close();
  killAllNora();
  await sleep(1000);

  // Read main process log
  const mainLogs = fs.existsSync(logFilePath) ? fs.readFileSync(logFilePath, 'utf8') : '';
  const traceLines = mainLogs.split('\n').filter((l) => l.includes('[TRACE:Main:getSongInfo'));
  const driftLines = mainLogs.split('\n').filter((l) => l.includes('[Main EventLoop Drift]'));

  const parsedSqlTimes = [];
  const parsedCloneTimes = [];
  const parsedTotalTimes = [];

  for (const line of traceLines) {
    const sqlMatch = line.match(/sql=([\d\.]+)ms/);
    const cloneMatch = line.match(/clone=([\d\.]+)ms/);
    const totalMatch = line.match(/total=([\d\.]+)ms/);
    if (sqlMatch) parsedSqlTimes.push(parseFloat(sqlMatch[1]));
    if (cloneMatch) parsedCloneTimes.push(parseFloat(cloneMatch[1]));
    if (totalMatch) parsedTotalTimes.push(parseFloat(totalMatch[1]));
  }

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr) => (arr.length ? (sum(arr) / arr.length).toFixed(2) : '0');
  const p95 = (arr) => {
    if (!arr.length) return '0';
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.95)].toFixed(2);
  };

  const results = {
    runLabel,
    renderer: {
      totalScheduled: traceSummary?.totalScheduled ?? 0,
      totalResolved: traceSummary?.totalResolved ?? 0,
      maxQueueDepth: traceSummary?.maxQueueDepth ?? 0,
      seekDurationMs: traceSummary?.seekDurationMs ?? 'N/A',
      timeToRealRowMs: traceSummary?.timeToRealRowMs ?? 'N/A',
      avgFpsDuringFling: frameStats?.avgFps,
      longTasksCount: frameStats?.longTasksCount,
      totalLongTaskMs: frameStats?.totalLongTaskDurationMs,
      queueTimeline: traceSummary?.queueDepthSamples?.map((s) => s.depth) ?? []
    },
    mainProcess: {
      totalQueriesExecuted: traceLines.length,
      totalSqlMs: sum(parsedSqlTimes).toFixed(1),
      avgSqlMs: avg(parsedSqlTimes),
      p95SqlMs: p95(parsedSqlTimes),
      totalCloneMs: sum(parsedCloneTimes).toFixed(1),
      avgCloneMs: avg(parsedCloneTimes),
      p95CloneMs: p95(parsedCloneTimes),
      totalHandlerMs: sum(parsedTotalTimes).toFixed(1),
      eventLoopDriftWarnings: driftLines.length
    }
  };

  console.log(`\n================== TRACE RESULTS: [${runLabel}] ==================`);
  console.log('Renderer Metrics:');
  console.log(`  Total Windows Scheduled:       ${results.renderer.totalScheduled}`);
  console.log(`  Total Windows Resolved:        ${results.renderer.totalResolved}`);
  console.log(`  Max Queue Depth (In-Flight):   ${results.renderer.maxQueueDepth}`);
  console.log(`  Seek Duration (Blank Viewport): ${results.renderer.seekDurationMs} ms`);
  console.log(`  Time-to-Real-Row Post-Stop:    ${results.renderer.timeToRealRowMs} ms`);
  console.log(`  Avg FPS during Fling:          ${results.renderer.avgFpsDuringFling} FPS`);
  console.log(`  Long Tasks during Fling:       ${results.renderer.longTasksCount} (${results.renderer.totalLongTaskMs} ms total)`);
  console.log(`  Queue Depth Timeline:          ${results.renderer.queueTimeline.join(' -> ')}`);

  console.log('\nMain Process (Node.js & SQLite) Metrics:');
  console.log(`  Total Windows Processed:       ${results.mainProcess.totalQueriesExecuted}`);
  console.log(`  Total SQL Execution Time:      ${results.mainProcess.totalSqlMs} ms (avg: ${results.mainProcess.avgSqlMs} ms, p95: ${results.mainProcess.p95SqlMs} ms)`);
  console.log(`  Total IPC Clone (Marshalling): ${results.mainProcess.totalCloneMs} ms (avg: ${results.mainProcess.avgCloneMs} ms, p95: ${results.mainProcess.p95CloneMs} ms)`);
  console.log(`  Total Main Handler Wall Time:  ${results.mainProcess.totalHandlerMs} ms`);
  console.log(`  Main EventLoop Drift Warnings: ${results.mainProcess.eventLoopDriftWarnings}`);
  console.log(`==================================================================\n`);

  return results;
}

captureFlingTrace().catch((e) => {
  console.error('Trace capture failed:', e);
  killAllNora();
  process.exit(1);
});
