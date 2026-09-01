import { spawn, execSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch (e) {}
  }
}

async function main() {
  console.log('=== EXACT LISTENER & DOM BREAKDOWN ===\n');
  killAllNora();
  await sleep(1500);

  spawn('npx.cmd', ['electron-vite', 'dev', '--watch=false', '--remoteDebuggingPort', '9876'], {
    shell: true,
    env: { ...process.env, NORA_DEVTOOLS_CLOSED: '1' },
    stdio: 'ignore'
  });

  let rendererTarget = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9876/json');
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.title === 'Nora');
        if (page && page.webSocketDebuggerUrl) {
          rendererTarget = page;
          break;
        }
      }
    } catch (e) {}
    await sleep(1000);
  }

  const cdp = new CDPClient(rendererTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Performance.enable');

  await sleep(10000);

  const perf = await cdp.send('Performance.getMetrics');
  const perfMap = {};
  for (const m of perf.metrics || []) perfMap[m.name] = m.value;

  console.log('--- CDP PERFORMANCE METRICS (Home Page) ---');
  console.log(`DOM Nodes: ${perfMap.Nodes}`);
  console.log(`Documents: ${perfMap.Documents}`);
  console.log(`JS Event Listeners (CDP reported): ${perfMap.JSEventListeners}`);
  console.log(
    `JS Heap Used: ${Math.round(((perfMap.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100} MB`
  );
  console.log(
    `JS Heap Total: ${Math.round(((perfMap.JSHeapTotalSize || 0) / 1024 / 1024) * 100) / 100} MB`
  );

  // Start playback and open lyrics
  console.log('\n--- PLAYBACK & LYRICS METRICS ---');
  await cdp.evaluate(`(() => {
    const playBtn = document.querySelector('.play-pause-btn');
    if (playBtn) playBtn.click();
    const lyricsBtn = document.querySelector('.lyrics-btn');
    if (lyricsBtn) lyricsBtn.click();
  })()`);
  await sleep(8000);

  const perfPlay = await cdp.send('Performance.getMetrics');
  const perfPlayMap = {};
  for (const m of perfPlay.metrics || []) perfPlayMap[m.name] = m.value;

  console.log(`During Playback + Lyrics:`);
  console.log(`DOM Nodes: ${perfPlayMap.Nodes}`);
  console.log(`JS Event Listeners: ${perfPlayMap.JSEventListeners}`);
  console.log(
    `JS Heap Used: ${Math.round(((perfPlayMap.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100} MB`
  );

  // Inspect what the listeners are attached to
  const listenerDetails = await cdp.evaluate(`(() => {
    // React synthetic event listeners are attached at the root document / container
    // Let's count elements with event properties or custom attributes
    const elementsWithHandlers = [];
    const all = document.querySelectorAll('*');
    let inlineHandlers = 0;
    all.forEach(el => {
      const keys = Object.keys(el);
      const reactPropsKey = keys.find(k => k.startsWith('__reactProps'));
      if (reactPropsKey && el[reactPropsKey]) {
        const props = el[reactPropsKey];
        const handlers = Object.keys(props).filter(p => p.startsWith('on'));
        if (handlers.length > 0) inlineHandlers += handlers.length;
      }
    });

    return {
      totalElements: all.length,
      reactEventPropsCount: inlineHandlers,
      rootListenersAttached: 'React 18 delegates most synthetic events to the root container (document/root div)'
    };
  })()`);
  console.log('\n--- LISTENER ARCHITECTURE DETAILS ---');
  console.log(JSON.stringify(listenerDetails, null, 2));

  cdp.close();
  killAllNora();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  killAllNora();
  process.exit(1);
});
