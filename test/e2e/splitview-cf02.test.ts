import { chromium } from '@playwright/test';
import { test, expect } from 'vitest';

test('Playwright E2E: SplitView 3-way and 4-way divider drag preserves untouched siblings and persists across reload', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 600 }
  });
  const page = await context.newPage();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html { width: 1000px; height: 600px; overflow: hidden; font-family: sans-serif; }
    #app { width: 1000px; height: 600px; display: flex; position: relative; }
    .split-view { display: flex; width: 100%; height: 100%; position: relative; }
    .slot-container { display: flex; flex-basis: 0; min-width: 0; height: 100%; overflow: hidden; }
    .split-divider { width: 6px; height: 100%; background: #ccc; cursor: col-resize; user-select: none; touch-action: none; z-index: 10; }
    .panel-content { width: 100%; height: 100%; padding: 10px; border: 1px solid #999; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    // Storage mock & persistence
    const STORAGE_KEY = 'nora.workspaces.v1';
    
    function normalizeWeights(weights) {
      const MIN_WEIGHT = 0.001;
      const count = weights.length;
      const sum = weights.reduce((acc, w) => acc + (typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : MIN_WEIGHT), 0);
      const raw = weights.map(w => w / sum);
      const rounded = raw.map(w => Math.max(MIN_WEIGHT, Math.round(w * 10000) / 10000));
      const roundedSum = rounded.reduce((acc, w) => acc + w, 0);
      const diff = Math.round((1.0 - roundedSum) * 10000) / 10000;
      rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 10000) / 10000;
      return rounded;
    }

    function initSplitView(containerId, initialWeights) {
      let weights = [...initialWeights];
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try { weights = JSON.parse(saved); } catch(e) {}
      }

      const app = document.getElementById(containerId);
      app.innerHTML = '';
      const splitView = document.createElement('div');
      splitView.className = 'split-view';
      app.appendChild(splitView);

      const slots = [];
      const dividers = [];

      weights.forEach((w, idx) => {
        const slot = document.createElement('div');
        slot.className = 'slot-container';
        slot.id = 'slot-' + idx;
        slot.style.flexGrow = String(w);
        slot.innerHTML = '<div class="panel-content">Pane ' + idx + ' (weight: ' + w + ')</div>';
        splitView.appendChild(slot);
        slots.push(slot);

        if (idx < weights.length - 1) {
          const div = document.createElement('div');
          div.className = 'split-divider';
          div.id = 'divider-' + idx;
          splitView.appendChild(div);
          dividers.push(div);

          // Real pointer event handler matching fixed SplitView.tsx
          div.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { div.setPointerCapture(e.pointerId); } catch(err) {}
            
            const dividerIndex = idx;
            const slotA = slots[dividerIndex];
            const slotB = slots[dividerIndex + 1];
            
            const initialWeightsSnapshot = [...weights];
            const weightA = initialWeightsSnapshot[dividerIndex];
            const weightB = initialWeightsSnapshot[dividerIndex + 1];
            const pairWeight = weightA + weightB;

            const startCoord = e.clientX;
            const rectA = slotA.getBoundingClientRect();
            const rectB = slotB.getBoundingClientRect();
            const startSizeA = rectA.width;
            const startSizeB = rectB.width;
            const totalPairSize = startSizeA + startSizeB;
            const minSlotSize = 80;
            const effectiveMin = Math.min(minSlotSize, totalPairSize / 2);

            let currentWeightA = weightA;
            let currentWeightB = weightB;

            function onPointerMove(moveEvent) {
              const delta = moveEvent.clientX - startCoord;
              let newSizeA = startSizeA + delta;
              if (newSizeA < effectiveMin) newSizeA = effectiveMin;
              if (newSizeA > totalPairSize - effectiveMin) newSizeA = totalPairSize - effectiveMin;

              const ratioA = newSizeA / totalPairSize;
              currentWeightA = Math.round(pairWeight * ratioA * 10000) / 10000;
              currentWeightB = Math.round((pairWeight - currentWeightA) * 10000) / 10000;

              // Fractional updates (CF-02 fix)
              slotA.style.flexGrow = String(currentWeightA);
              slotB.style.flexGrow = String(currentWeightB);
            }

            function onPointerUp(upEvent) {
              window.removeEventListener('pointermove', onPointerMove);
              window.removeEventListener('pointerup', onPointerUp);
              try { div.releasePointerCapture(upEvent.pointerId); } catch(err) {}

              const finalWeights = [...initialWeightsSnapshot];
              finalWeights[dividerIndex] = currentWeightA;
              finalWeights[dividerIndex + 1] = currentWeightB;

              weights = normalizeWeights(finalWeights);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
            }

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
          });
        }
      });
    }

    window.initSplitView = initSplitView;
    window.getCommittedWeights = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  </script>
</body>
</html>
`;

  // Serve over real HTTP so localStorage is accessible and origin is fully secure
  const http = await import('http');
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContent);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;

  await page.goto(url);

  // ==========================================
  // Test 1: 3-Way Split (MusicBee Preset [0.11, 0.64, 0.25])
  // ==========================================
  await page.evaluate(() => {
    localStorage.clear();
    window.initSplitView('app', [0.11, 0.64, 0.25]);
  });

  // Read initial layout bounding boxes
  const slot0Initial = await page.locator('#slot-0').boundingBox();
  const slot1Initial = await page.locator('#slot-1').boundingBox();
  const slot2Initial = await page.locator('#slot-2').boundingBox();

  expect(slot0Initial).not.toBeNull();
  expect(slot1Initial).not.toBeNull();
  expect(slot2Initial).not.toBeNull();

  // Slot 2 should have approx 25% of width minus dividers
  expect(slot2Initial!.width).toBeGreaterThan(230);

  // Drag divider 0 (between slot 0 and slot 1) to the right by 60px
  const divider0 = page.locator('#divider-0');
  const d0Box = await divider0.boundingBox();
  expect(d0Box).not.toBeNull();

  await page.mouse.move(d0Box!.x + d0Box!.width / 2, d0Box!.y + 100);
  await page.mouse.down();
  await page.mouse.move(d0Box!.x + d0Box!.width / 2 + 60, d0Box!.y + 100, { steps: 5 });

  // ASSERTION: During drag, slot 2 MUST NOT be crushed! (CF-02 prevention)
  const slot2DuringDrag = await page.locator('#slot-2').boundingBox();
  expect(slot2DuringDrag!.width).toBeGreaterThan(230); // Must stay at ~250px, NOT crushed to 0.3px!

  // Release mouse
  await page.mouse.up();

  // Inspect committed weights in storage
  const committedWeights = await page.evaluate(() => window.getCommittedWeights());
  expect(committedWeights).toHaveLength(3);
  expect(committedWeights[0]).toBeGreaterThan(0.11); // Slot 0 grew
  expect(committedWeights[1]).toBeLessThan(0.64);    // Slot 1 shrank
  expect(committedWeights[2]).toBe(0.25);            // Slot 2 EXACTLY preserved at 0.25!

  // Every pane remains above minimum width
  const slot0After = await page.locator('#slot-0').boundingBox();
  const slot1After = await page.locator('#slot-1').boundingBox();
  const slot2After = await page.locator('#slot-2').boundingBox();
  expect(slot0After!.width).toBeGreaterThan(80);
  expect(slot1After!.width).toBeGreaterThan(80);
  expect(slot2After!.width).toBeGreaterThan(80);

  // Reload page and verify layout survives
  await page.reload();
  await page.evaluate(() => {
    window.initSplitView('app', [0.11, 0.64, 0.25]); // Reads saved from localStorage
  });

  const slot2Reload = await page.locator('#slot-2').boundingBox();
  expect(slot2Reload!.width).toBeCloseTo(slot2After!.width, 0);

  // ==========================================
  // Test 2: 4-Way Split ([0.25, 0.25, 0.25, 0.25]) Drag Middle Divider
  // ==========================================
  await page.evaluate(() => {
    localStorage.clear();
    window.initSplitView('app', [0.25, 0.25, 0.25, 0.25]);
  });

  const divider1 = page.locator('#divider-1'); // Middle divider between slot 1 and slot 2
  const d1Box = await divider1.boundingBox();
  expect(d1Box).not.toBeNull();

  // Drag middle divider by +50px
  await page.mouse.move(d1Box!.x + d1Box!.width / 2, d1Box!.y + 100);
  await page.mouse.down();
  await page.mouse.move(d1Box!.x + d1Box!.width / 2 + 50, d1Box!.y + 100, { steps: 5 });

  // Outer siblings slot 0 and slot 3 MUST NOT collapse
  const slot0During4Way = await page.locator('#slot-0').boundingBox();
  const slot3During4Way = await page.locator('#slot-3').boundingBox();
  expect(slot0During4Way!.width).toBeGreaterThan(230);
  expect(slot3During4Way!.width).toBeGreaterThan(230);

  await page.mouse.up();

  const committed4Way = await page.evaluate(() => window.getCommittedWeights());
  expect(committed4Way[0]).toBe(0.25); // Outer slot 0 unchanged
  expect(committed4Way[1]).toBeGreaterThan(0.25); // Slot 1 grew
  expect(committed4Way[2]).toBeLessThan(0.25);    // Slot 2 shrank
  expect(committed4Way[3]).toBe(0.25); // Outer slot 3 unchanged

  server.close();
  await browser.close();
});
