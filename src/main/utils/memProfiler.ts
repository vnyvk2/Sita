import fs from 'fs';
import path from 'path';

import { app, type BrowserWindow, type WebContents } from 'electron';

const PROFILE_DIR = process.env.NORA_PROFILE_DIR ?? '';

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;
const kbToMb = (kb: number) => Math.round((kb / 1024) * 10) / 10;

const writeJsonl = (file: string, obj: unknown) => {
  if (!PROFILE_DIR) return;
  try {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    fs.appendFileSync(path.join(PROFILE_DIR, file), `${JSON.stringify(obj)}\n`);
  } catch {
    return undefined;
  }
};

type MetricsSummary = Record<string, { wsMB: number; peakWsMB: number; pid: number }[]>;

const summarizeAppMetrics = (): MetricsSummary => {
  const summary: MetricsSummary = {};
  for (const metric of app.getAppMetrics()) {
    const type = metric.type || 'unknown';
    if (!summary[type]) summary[type] = [];
    summary[type].push({
      wsMB: kbToMb(metric.memory?.workingSetSize ?? 0),
      peakWsMB: kbToMb(metric.memory?.peakWorkingSetSize ?? 0),
      pid: metric.pid
    });
  }
  return summary;
};

const totalWsMb = (summary: MetricsSummary): number => {
  let total = 0;
  for (const list of Object.values(summary)) {
    for (const proc of list) total += proc.wsMB;
  }
  return Math.round(total * 10) / 10;
};

interface RendererProbeResult {
  href: string;
  readyState: string;
  rootHtmlLen: number;
  mem: { usedJSHeapMB: number; totalJSHeapMB: number } | null;
  nodes: number;
  fetching: number | null;
  queryCount: number | null;
  cacheJsonBytes: number | null;
  queries: { key: string; status: string; bytes: number }[];
}

const RENDERER_PROBE = `(async () => {
  const qc = window.__noraProfile && window.__noraProfile.qc;
  const perf = performance && performance.memory ? performance.memory : null;
  const root = document.getElementById('root');
  const out = {
    href: location.href,
    readyState: document.readyState,
    rootHtmlLen: root ? root.innerHTML.length : -1,
    mem: perf ? { usedJSHeapMB: Math.round(perf.usedJSHeapSize / 10485.76) / 100, totalJSHeapMB: Math.round(perf.totalJSHeapSize / 10485.76) / 100 } : null,
    nodes: document.getElementsByTagName('*').length,
    fetching: null,
    queryCount: null,
    cacheJsonBytes: null,
    queries: []
  };
  if (qc) {
    const all = qc.getQueryCache().getAll();
    out.fetching = all.filter(function (q) { return q.state.fetchStatus === 'fetching'; }).length;
    out.queryCount = all.length;
    var bytes = 0;
    for (var i = 0; i < all.length; i++) {
      var q = all[i];
      var b = 0;
      try { b = q.state.data ? JSON.stringify(q.state.data).length : 0; } catch (e) { b = -1; }
      bytes += b;
      out.queries.push({ key: JSON.stringify(q.queryKey), status: q.state.status, bytes: b });
    }
    out.cacheJsonBytes = bytes;
  }
  return out;
})()`;

const probeRenderer = async (wc: WebContents): Promise<RendererProbeResult | null> => {
  try {
    return (await wc.executeJavaScript(RENDERER_PROBE, false)) as RendererProbeResult;
  } catch {
    return null;
  }
};

const evalInRenderer = async <T>(wc: WebContents, expr: string): Promise<T | null> => {
  try {
    return (await wc.executeJavaScript(expr, false)) as T;
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class MemProfiler {
  readonly enabled = PROFILE_DIR.length > 0;

  private samplingTimer: NodeJS.Timeout | null = null;

  stage(label: string, details?: Record<string, unknown>) {
    if (!this.enabled) return;
    const pm = process.memoryUsage();
    writeJsonl('stages.jsonl', {
      kind: 'stage',
      label,
      ts: Date.now(),
      iso: new Date().toISOString(),
      uptimeMs: Math.round(process.uptime() * 1000),
      rssMB: mb(pm.rss),
      heapUsedMB: mb(pm.heapUsed),
      heapTotalMB: mb(pm.heapTotal),
      externalMB: mb(pm.external),
      arrayBuffersMB: mb(pm.arrayBuffers),
      ...details
    });
  }

  startSampling(intervalMs = 1500) {
    if (!this.enabled || this.samplingTimer) return;
    this.samplingTimer = setInterval(() => {
      const pm = process.memoryUsage();
      const metrics = summarizeAppMetrics();
      writeJsonl('samples.jsonl', {
        kind: 'sample',
        ts: Date.now(),
        uptimeMs: Math.round(process.uptime() * 1000),
        mainRssMB: mb(pm.rss),
        mainHeapUsedMB: mb(pm.heapUsed),
        mainArrayBuffersMB: mb(pm.arrayBuffers),
        totalWsMB: totalWsMb(metrics),
        metrics
      });
    }, intervalMs);
  }

  stopSampling() {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
  }

  async wrapHandler<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const t0 = Date.now();
    try {
      const result = await fn();
      let jsonBytes = 0;
      let count: number | undefined;
      try {
        jsonBytes = result === undefined ? 0 : JSON.stringify(result)?.length ?? 0;
      } catch {
        jsonBytes = -1;
      }
      if (
        result &&
        typeof result === 'object' &&
        Array.isArray((result as unknown as { data?: unknown[] }).data)
      ) {
        count = (result as unknown as { data: unknown[] }).data.length;
      }
      writeJsonl('ipc.jsonl', {
        kind: 'ipc',
        name,
        ms: Date.now() - t0,
        jsonBytes,
        count,
        ts: Date.now()
      });
      return result;
    } catch (error) {
      writeJsonl('ipc.jsonl', {
        kind: 'ipc-error',
        name,
        ms: Date.now() - t0,
        error: String(error),
        ts: Date.now()
      });
      throw error;
    }
  }

  private async snapshotStep(label: string, wc: WebContents, extra?: Record<string, unknown>) {
    const renderer = await probeRenderer(wc);
    const metrics = summarizeAppMetrics();
    writeJsonl('scenario.jsonl', {
      kind: 'step',
      label,
      ts: Date.now(),
      renderer,
      metrics,
      totalWsMB: totalWsMb(metrics),
      ...extra
    });
    this.stage(`step:${label}`);
  }

  private async waitForQueriesSettled(wc: WebContents, timeoutMs: number): Promise<number> {
    const start = Date.now();
    let consecutiveIdle = 0;
    while (Date.now() - start < timeoutMs) {
      await sleep(500);
      const state = await evalInRenderer<{ fetching: number; count: number }>(
        wc,
        `(function(){ var qc = window.__noraProfile && window.__noraProfile.qc; if(!qc) return {fetching:-1,count:0}; var all=qc.getQueryCache().getAll(); return {fetching: all.filter(function(q){return q.state.fetchStatus==='fetching';}).length, count: all.length}; })()`
      );
      if (state && state.fetching === 0) {
        consecutiveIdle += 1;
        if (consecutiveIdle >= 3 && Date.now() - start >= 2500) return Date.now() - start;
      } else {
        consecutiveIdle = 0;
      }
    }
    return Date.now() - start;
  }

  async runBootScenario(mainWindowRef: BrowserWindow) {
    if (!this.enabled) return;
    this.stage('scenario:start');
    const wc = mainWindowRef.webContents;

    await new Promise<void>((resolve) => {
      if (wc.isLoading()) {
        wc.once('did-finish-load', () => resolve());
        setTimeout(() => resolve(), 30000);
      } else resolve();
    });

    await sleep(6000);
    await this.snapshotStep('home-baseline', wc);

    const settleStart = Date.now();
    await wc.executeJavaScript(`location.hash = '#/main-player/songs'`, false).catch(() => undefined);
    const songsSettleMs = await this.waitForQueriesSettled(wc, 20000);
    await sleep(2000);
    await this.snapshotStep('songs-loaded', wc, {
      settleMs: songsSettleMs,
      navToSettleMs: Date.now() - settleStart
    });

    const refetchT0 = Date.now();
    const refetchResult = await evalInRenderer<string>(
      wc,
      `(async function(){ try { await window.__noraProfile.qc.refetchQueries({ type: 'all' }); return 'ok'; } catch(e) { return String(e); } })()`
    );
    const refetchMs = Date.now() - refetchT0;
    await sleep(1500);
    await this.snapshotStep('post-full-refetch', wc, { refetchMs, refetchResult });

    const albumsNavT0 = Date.now();
    await wc.executeJavaScript(`location.hash = '#/main-player/albums'`, false).catch(() => undefined);
    const albumsSettleMs = await this.waitForQueriesSettled(wc, 20000);
    await sleep(2000);
    await this.snapshotStep('albums-loaded', wc, {
      settleMs: albumsSettleMs,
      navToSettleMs: Date.now() - albumsNavT0
    });

    const directProbe = await evalInRenderer<{ ms: number; count: number; error?: string }>(
      wc,
      `(async function(){ var t0 = performance.now(); try { var r = await window.api.audioLibraryControls.getAllSongs('aToZ', undefined, {start:0,end:0}); return { ms: Math.round(performance.now() - t0), count: r.data.length }; } catch(e) { return { ms: Math.round(performance.now()-t0), error: String(e), count: -1 }; } })()`
    );
    writeJsonl('scenario.jsonl', { kind: 'direct-getAllSongs-probe', probe: directProbe, ts: Date.now() });

    await wc.executeJavaScript(`location.hash = '#/main-player/home'`, false).catch(() => undefined);
    await sleep(4000);
    await this.snapshotStep('return-home', wc);

    this.stage('scenario:end');
    writeJsonl('scenario.jsonl', { kind: 'scenario-complete', ts: Date.now() });
    setTimeout(() => app.quit(), 2000);
  }

  async attachWindowDiagnostics(win: BrowserWindow) {
    if (!this.enabled) return;
    const wc = win.webContents;
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      this.stage('did-fail-load', { errorCode, errorDescription, validatedURL });
    });
    wc.on('render-process-gone', (_e, details) => {
      this.stage('render-process-gone', {
        reason: details.reason,
        exitCode: details.exitCode
      });
    });
    wc.on('did-navigate', (_e, url) => this.stage('did-navigate', { url }));
    wc.on('console-message', (_e, level, message, line, sourceId) => {
      this.stage('renderer-console', {
        level,
        message: String(message).slice(0, 600),
        sourceId: String(sourceId).slice(0, 160),
        line
      });
    });
  }

  shutdown() {
    this.stopSampling();
    if (this.enabled) this.stage('profiler-shutdown');
  }
}

const memProfiler = new MemProfiler();
export default memProfiler;
