import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { CDPClient, killAllNora, sleep } from './benchmark-songs-tab.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function getCDPTarget(port = 9876, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(
          (t) =>
            t.type === 'page' &&
            t.title !== 'DevTools' &&
            (t.title === 'Nora' || t.title.includes('index.html') || t.url.includes('renderer/index.html'))
        );
        if (page && page.webSocketDebuggerUrl) return page;
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Could not find Nora CDP target on port ${port}`);
}

async function checkDomNodes() {
  killAllNora();
  await sleep(1500);

  const electronBin = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const mainJs = path.join(rootDir, 'out', 'main', 'main.js');

  console.log('Spawning production Nora...');
  spawn(electronBin, [mainJs, '--remote-debugging-port=9876'], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NORA_USER_DATA: path.join(process.env.APPDATA, 'nora'),
      REMOTE_DEBUGGING_PORT: '9876'
    },
    stdio: 'ignore'
  });

  const target = await getCDPTarget(9876, 45);
  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');

  await sleep(3000);

  // Navigate to Songs
  await cdp.evaluate(`document.querySelector('a[href*="songs"]')?.click()`);
  await sleep(3000);

  const initialPerf = await cdp.getPerformanceMetrics();
  const initialDom = await cdp.evaluate(`({
    allElements: document.querySelectorAll('*').length,
    virtuosoItems: document.querySelectorAll('[data-item-index]').length,
    allImgs: document.querySelectorAll('img').length
  })`);

  console.log('--- BEFORE SCROLL ---');
  console.log('DOM metrics:', initialDom);
  console.log('CDP Nodes metric (includes detached):', initialPerf.Nodes);

  // Scroll through 300 songs
  console.log('\nScrolling through ~300 songs...');
  await cdp.evaluate(`(async () => {
    const scroller = document.querySelector('[data-virtuoso-scroller="true"]');
    for (let i = 0; i < 300 * 60; i += 120) {
      scroller.scrollTop = i;
      await new Promise(r => requestAnimationFrame(r));
    }
  })()`);

  await sleep(3000);

  const afterScrollPerf = await cdp.getPerformanceMetrics();
  const afterScrollDom = await cdp.evaluate(`({
    allElements: document.querySelectorAll('*').length,
    virtuosoItems: document.querySelectorAll('[data-item-index]').length,
    allImgs: document.querySelectorAll('img').length
  })`);

  console.log('\n--- AFTER SCROLLING 300 SONGS ---');
  console.log('In-Document DOM elements:', afterScrollDom);
  console.log('CDP Nodes metric (includes detached):', afterScrollPerf.Nodes);

  // Force GC
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
  } catch {}
  await sleep(2000);

  const postGcPerf = await cdp.getPerformanceMetrics();
  console.log('\n--- POST-GC ---');
  console.log('CDP Nodes metric after HeapProfiler.collectGarbage:', postGcPerf.Nodes);

  cdp.close();
  killAllNora();
}

checkDomNodes().catch(console.error);
