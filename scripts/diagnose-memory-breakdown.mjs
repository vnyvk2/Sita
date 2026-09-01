import { spawn, execSync, spawnSync } from 'child_process';
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

async function main() {
  console.log('=== NORA PHASE 2: RESIDUAL MEMORY DIAGNOSTIC ===\n');
  killAllNora();
  await sleep(2000);

  // Launch Nora with remote debugging port 9876 and DevTools closed
  console.log('[1/4] Launching Nora (DevTools Closed)...');
  const child = spawn(
    'npx.cmd',
    ['electron-vite', 'dev', '--watch=false', '--remoteDebuggingPort', '9876', '--inspect=9229'],
    {
      shell: true,
      env: { ...process.env, NORA_DEVTOOLS_CLOSED: '1' },
      stdio: 'ignore'
    }
  );

  // Wait for Renderer CDP target on 9876
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

  if (!rendererTarget) {
    console.error('Failed to connect to Renderer CDP on port 9876');
    killAllNora();
    process.exit(1);
  }

  const rendererCDP = new CDPClient(rendererTarget.webSocketDebuggerUrl);
  await rendererCDP.connect();
  console.log('[2/4] Connected to Renderer CDP!');

  // Check Node Main Inspector on 9229
  let mainCDP = null;
  try {
    const mainRes = await fetch('http://127.0.0.1:9229/json');
    if (mainRes.ok) {
      const mainList = await mainRes.json();
      const nodeTarget = mainList[0];
      if (nodeTarget && nodeTarget.webSocketDebuggerUrl) {
        mainCDP = new CDPClient(nodeTarget.webSocketDebuggerUrl);
        await mainCDP.connect();
        console.log('[2/4] Connected to Main Process Node Inspector on port 9229!');
      }
    }
  } catch (e) {
    console.log('[2/4] Node inspector port 9229 not available, using renderer IPC probes.');
  }

  // Allow app to settle on Home (15 seconds)
  console.log('\n[3/4] Settling on Home (15s)...');
  await sleep(15000);

  // Probe 1: Process Memory at Baseline
  const procBase = getProcessMemoryMetrics();
  const perfBase = await rendererCDP.getPerformanceMetrics();
  console.log('\n--- BASELINE METRICS (Home Page) ---');
  console.log(
    `Total WS: ${procBase?.totalWS} MB | Renderer: ${procBase?.renderer.ws} MB | Main: ${procBase?.main.ws} MB | GPU: ${procBase?.gpu.ws} MB`
  );
  console.log(
    `Renderer JS Heap Used: ${Math.round(((perfBase.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100} MB / ${Math.round(((perfBase.JSHeapTotalSize || 0) / 1024 / 1024) * 100) / 100} MB`
  );
  console.log(
    `DOM Nodes: ${perfBase.Nodes} | Documents: ${perfBase.Documents} | JS Event Listeners: ${perfBase.JSEventListeners}`
  );

  // Probe 2: Main Process Node.js memory breakdown (if connected to Node inspector)
  if (mainCDP) {
    const nodeMem = await mainCDP.evaluate(`(() => {
      const mem = process.memoryUsage();
      return {
        rssMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
        externalMB: Math.round(mem.external / 1024 / 1024 * 100) / 100,
        arrayBuffersMB: Math.round(mem.arrayBuffers / 1024 / 1024 * 100) / 100,
      };
    })()`);
    console.log('\n--- MAIN PROCESS NODE.JS MEMORY BREAKDOWN ---');
    console.log(JSON.stringify(nodeMem, null, 2));
  }

  // Probe 3: Enumerate Event Listeners in Renderer
  console.log('\n--- AUDITING RENDERER EVENT LISTENERS ---');
  const listenerAudit = await rendererCDP.evaluate(`(() => {
    const results = { window: {}, document: {}, elements: {} };
    // Scan all DOM elements
    const allElements = document.querySelectorAll('*');
    let totalElementListeners = 0;
    
    // Check common custom events or native events attached to window/document
    const eventTypes = [
      'click', 'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove',
      'scroll', 'resize', 'focus', 'blur', 'contextmenu', 'input', 'change',
      'player/positionChange', 'lyrics/scrollIntoView', 'app/systemThemeChange'
    ];
    
    // Count img elements and decoded images in DOM
    const imgElements = document.querySelectorAll('img');
    const imgInfo = Array.from(imgElements).map(img => ({
      src: img.src?.slice(0, 60),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
      complete: img.complete
    }));

    return {
      totalDomElements: allElements.length,
      imgCount: imgElements.length,
      imgDetails: imgInfo.slice(0, 10),
      windowProperties: Object.keys(window).length
    };
  })()`);
  console.log('DOM & Image Summary on Home:', JSON.stringify(listenerAudit, null, 2));

  // Probe 4: Controlled Artwork / Navigation Test
  console.log('\n[4/4] Starting Controlled Artwork Navigation Test...');
  console.log('Step A: Navigate to Songs Page (1,400 songs list)...');
  await rendererCDP.evaluate(`(() => {
    const songsLink = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent?.includes('Songs') || el.getAttribute('href')?.includes('songs'));
    if (songsLink) songsLink.click();
    else window.location.hash = '#/main-player/songs';
  })()`);
  await sleep(8000);

  const procSongs = getProcessMemoryMetrics();
  const perfSongs = await rendererCDP.getPerformanceMetrics();
  console.log(
    `Songs Page Loaded: Total WS: ${procSongs?.totalWS} MB | Renderer: ${procSongs?.renderer.ws} MB | GPU: ${procSongs?.gpu.ws} MB | Nodes: ${perfSongs.Nodes} | JS Heap: ${Math.round(((perfSongs.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100} MB | Listeners: ${perfSongs.JSEventListeners}`
  );

  console.log('Step B: Scroll through Songs List to trigger image decoding (10s)...');
  await rendererCDP.evaluate(`(() => {
    const container = document.querySelector('.virtualized-list') || document.querySelector('.songs-container') || document.documentElement;
    let scrolled = 0;
    const interval = setInterval(() => {
      container.scrollTop += 500;
      scrolled += 500;
      if (scrolled > 10000) clearInterval(interval);
    }, 200);
  })()`);
  await sleep(12000);

  const procSongsScrolled = getProcessMemoryMetrics();
  const perfSongsScrolled = await rendererCDP.getPerformanceMetrics();
  console.log(
    `After Scrolling Songs: Total WS: ${procSongsScrolled?.totalWS} MB | Renderer: ${procSongsScrolled?.renderer.ws} MB | GPU: ${procSongsScrolled?.gpu.ws} MB | Nodes: ${perfSongsScrolled.Nodes} | JS Heap: ${Math.round(((perfSongsScrolled.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100} MB | Listeners: ${perfSongsScrolled.JSEventListeners}`
  );

  console.log('Step C: Navigate back to Home & Rest (30s)...');
  await rendererCDP.evaluate(`(() => {
    const homeLink = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent?.includes('Home') || el.getAttribute('href')?.includes('home'));
    if (homeLink) homeLink.click();
    else window.location.hash = '#/main-player/home';
  })()`);
  await sleep(30000);

  const procHomeRest = getProcessMemoryMetrics();
  const perfHomeRest = await rendererCDP.getPerformanceMetrics();
  console.log(`\n--- POST-NAVIGATION REST MEASUREMENT (Back on Home) ---`);
  console.log(
    `Total WS: ${procHomeRest?.totalWS} MB | Renderer: ${procHomeRest?.renderer.ws} MB | Main: ${procHomeRest?.main.ws} MB | GPU: ${procHomeRest?.gpu.ws} MB`
  );
  console.log(
    `Renderer JS Heap: ${Math.round(((perfHomeRest.JSHeapUsedSize || 0) / 1024 / 1024) * 100) / 100} MB | Nodes: ${perfHomeRest.Nodes} | Listeners: ${perfHomeRest.JSEventListeners}`
  );

  console.log('\n[Finished Diagnostic] Terminating Nora processes...');
  rendererCDP.close();
  if (mainCDP) mainCDP.close();
  killAllNora();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Error in diagnostic]:', err);
  killAllNora();
  process.exit(1);
});
