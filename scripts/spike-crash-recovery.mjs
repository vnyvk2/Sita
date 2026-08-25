/**
 * SPIKE (Tiny Phase 0 / P0-5): empirical renderer-crash recovery verification.
 *
 * Proves/disproves: "A Tiny renderer crash must not corrupt persisted queue/settings state, and the
 * existing restore path must recover correctly after renderer recovery."
 *
 * Method: boot the app, start playback, snapshot persisted queue/settings, crash the renderer via
 * CDP Page.crash, reconnect, reload, then verify the persisted state survived and the existing
 * restore path recovers the queue.
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.on('exit', (code) => console.log('[CrashSpike] process exit', code));
process.on('uncaughtException', (e) => console.log('[CrashSpike] uncaughtException', e));
process.on('unhandledRejection', (e) => console.log('[CrashSpike] unhandledRejection', e));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killAllNora() {
  try {
    spawnSync('taskkill', ['/IM', 'electron.exe', '/F', '/T'], { stdio: 'ignore' });
  } catch {}
}

function killRendererOnly() {
  // Page.crash tears down the whole Electron instance in this dev setup
  // (verified empirically), so kill ONLY the renderer process via the OS.
  // This triggers a real render-process-gone event in Main.
  try {
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -match '--type=renderer' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
      ],
      { stdio: 'ignore' }
    );
    return true;
  } catch (e) {
    console.log('[CrashSpike] killRendererOnly failed:', e.message);
    return false;
  }
}

async function getCDPTarget(port = 9876, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page =
          list.find((t) => t.type === 'page' && t.title === 'Nora') ||
          list.find((t) => t.type === 'page' && /localhost:5173/.test(t.url || '')) ||
          list.find((t) => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) return page;
      }
    } catch (e) {}
    await sleep(1000);
  }
  throw new Error(`No Nora CDP target on port ${port}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      // A renderer crash kills the CDP socket without responses; fail any
      // in-flight calls fast instead of hanging forever.
      this.ws.onclose = () => {
        for (const cb of this.callbacks.values()) cb.reject(new Error('CDP connection closed'));
        this.callbacks.clear();
      };
      this.ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) cb.reject(new Error(msg.error.message));
            else cb.resolve(msg.result);
          }
        } catch {}
      });
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        this.callbacks.delete(id);
        reject(err);
      }
    });
  }
  evaluate(expression) {
    return this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }).then((r) => r?.result?.value);
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function main() {
  killAllNora();
  await sleep(2000);

  const env = { ...process.env, NORA_DEVTOOLS_CLOSED: '1', REMOTE_DEBUGGING_PORT: '9876' };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('[CrashSpike] Launching Nora dev...');
  spawn(
    process.execPath,
    [
      path.join(rootDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
      'dev',
      '--watch=false'
    ],
    { cwd: rootDir, env, stdio: 'ignore', detached: true }
  );

  let cdp = new CDPClient((await getCDPTarget()).webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await sleep(8000);

  // Start playback so a real queue exists
  console.log('[CrashSpike] Starting playback...');
  await cdp.evaluate(`(() => {
    const btn = document.querySelector('.play-pause-btn');
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(4000);

  const before = await cdp.evaluate(`(() => {
    const lsRaw = localStorage.getItem('localStorage');
    const ls = lsRaw ? JSON.parse(lsRaw) : null;
    const p = window.__NORA_AUDIO_PLAYER__;
    return {
      queuePersisted: Boolean(ls && ls.queue && Array.isArray(ls.queue.queues) && ls.queue.queues.length > 0),
      activeQueueSongCount: p && p.queue ? (p.queue.songs ? p.queue.songs.length : null) : null,
      currentSongId: p && p.queue ? p.queue.currentSongId : null,
      paused: p ? p.audio.paused : null,
      localStorageBytes: lsRaw ? lsRaw.length : 0
    };
  })()`);
  console.log('[CrashSpike] Before crash:', JSON.stringify(before));

  // Crash the renderer (OS-level kill of just the renderer process)
  console.log('[CrashSpike] Killing renderer process ...');
  killRendererOnly();
  await sleep(6000);

  // Reconnect: the previous websocket is dead after renderer crash
  let after = null;
  let recoveredViaAutoReload = false;
  try {
    cdp.close();
  } catch {}
  console.log('[CrashSpike] Reconnecting to CDP target...');
  const target2 = await getCDPTarget(9876, 30);
  console.log('[CrashSpike] Reconnected to:', target2.title || target2.url);
  cdp = new CDPClient(target2.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp
    .send('Runtime.evaluate', { expression: '1+1', returnByValue: true })
    .then(() => {
      recoveredViaAutoReload = true;
    })
    .catch(() => {});

  if (!recoveredViaAutoReload) {
    console.log('[CrashSpike] Renderer not auto-recovered by main; reloading manually...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/' }).catch((e) => {
      console.log('[CrashSpike] navigate error:', e.message);
    });
  }
  await sleep(10000);

  after = await cdp
    .evaluate(`(() => {
    const lsRaw = localStorage.getItem('localStorage');
    const ls = lsRaw ? JSON.parse(lsRaw) : null;
    const p = window.__NORA_AUDIO_PLAYER__;
    return {
      rendererResponds: true,
      queuePersistedAfterCrash: Boolean(ls && ls.queue && Array.isArray(ls.queue.queues) && ls.queue.queues.length > 0),
      activeQueueRestored: Boolean(p && p.queue),
      restoredQueueSongCount: p && p.queue ? (p.queue.songs ? p.queue.songs.length : null) : null,
      restoredCurrentSongId: p && p.queue ? p.queue.currentSongId : null,
      localStorageBytes: lsRaw ? lsRaw.length : 0,
      playerSingletonRecreated: Boolean(p)
    };
  })()`)
    .catch((e) => ({ error: e.message }));

  // ── Phase B: mini-mode presentation restore ─────────────────────────────
  // Mini presentation is renderer-store-driven (not URL-driven), so after a
  // crash-triggered reload Main must re-assert it via
  // RESTORE_PLAYER_TYPE_AFTER_RECOVERY. Verify empirically.
  console.log('[CrashSpike] Switching to mini player...');
  const miniSwitchClicked = await cdp.evaluate(`(() => {
    const btn = document.querySelector('.mini-player-btn');
    if (btn) btn.click();
    return Boolean(btn);
  })()`);
  await sleep(4000);

  const miniBefore = await cdp
    .evaluate(`(() => ({
    miniUiMounted: Boolean(document.querySelector('.mini-player')),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight
  }))()`)
    .catch((e) => ({ error: e.message }));
  console.log('[CrashSpike] Mini before crash:', JSON.stringify(miniBefore));

  console.log('[CrashSpike] Killing renderer process again (mini mode) ...');
  killRendererOnly();
  await sleep(6000);

  try {
    cdp.close();
  } catch {}
  const target3 = await getCDPTarget(9876, 30);
  cdp = new CDPClient(target3.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Give the post-reload re-assertion window (~6 s) time to run.
  await sleep(10000);

  const miniAfter = await cdp
    .evaluate(`(() => ({
    rendererResponds: true,
    miniUiRestored: Boolean(document.querySelector('.mini-player')),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight
  }))()`)
    .catch((e) => ({ error: e.message }));

  const results = {
    before,
    recoveredViaAutoReload,
    after,
    miniMode: { miniSwitchClicked, miniBefore, miniAfter }
  };
  console.log('\n[CrashSpike] Result:', JSON.stringify(results, null, 2));

  fs.writeFileSync(
    path.join(rootDir, 'spike_crash_recovery.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log('[CrashSpike] Saved to spike_crash_recovery.json');

  cdp.close();
  killAllNora();
}

main().catch((err) => {
  console.error('[CrashSpike Error]', err);
  killAllNora();
  process.exit(1);
});
