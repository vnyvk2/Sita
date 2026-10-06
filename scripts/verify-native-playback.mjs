import path from 'path';

import { _electron as electron } from 'playwright';

async function run() {
  console.log('=== STARTING FULL END-TO-END VERIFICATION ===');
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd()
  });

  const page = await app.firstWindow();
  console.log('Window title:', await page.title());

  // Listen to renderer console messages
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('Native') ||
      text.includes('native') ||
      text.includes('fallback') ||
      text.includes('Fallback') ||
      text.includes('daemon') ||
      text.includes('error') ||
      text.includes('Error') ||
      text.includes('warn')
    ) {
      console.log(`[Renderer Console] [${msg.type()}] ${text}`);
    }
  });

  // Wait for window.api
  await page.waitForFunction(
    () =>
      typeof window.api !== 'undefined' && typeof window.api.audioLibraryControls !== 'undefined'
  );
  console.log('window.api and audioLibraryControls are ready');

  // Step 1: Navigate to Settings Page
  console.log('\n--- Step 1: Navigate to Settings Page ---');
  await page.evaluate(() => {
    const link = document.querySelector('a.settings');
    if (link) link.click();
    else window.location.hash = '#/main-player/settings';
  });
  await page.waitForTimeout(1500);

  // Check the Native Audio Engine checkbox
  console.log('\n--- Step 2: Ensure "Use Native Audio Engine" is ON ---');
  const isCheckedBefore = await page.evaluate(() => {
    const cb = document.querySelector('#useNativeAudioEngineCheckbox');
    return cb ? cb.checked : null;
  });
  console.log('Native Audio Engine Checkbox isChecked before toggle:', isCheckedBefore);

  if (!isCheckedBefore) {
    console.log('Clicking to enable Native Audio Engine...');
    await page.evaluate(() => {
      const cb = document.querySelector('#useNativeAudioEngineCheckbox');
      if (cb) cb.click();
    });
    await page.waitForTimeout(1500);
  }

  const isCheckedAfter = await page.evaluate(() => {
    const cb = document.querySelector('#useNativeAudioEngineCheckbox');
    return cb ? cb.checked : null;
  });
  console.log('Native Audio Engine Checkbox isChecked after toggle:', isCheckedAfter);

  // Check Sound Profile badge
  const profileBadge = await page.evaluate(() => {
    const el = document.querySelector('#soundProfileSettings span.uppercase');
    return el ? el.textContent.trim() : null;
  });
  console.log('Sound Profile Badge text:', profileBadge);

  // Check daemon state via window.api.audioEngine
  const daemonState = await page.evaluate(async () => {
    return await window.api.audioEngine.send({ cmd: 'get_state' });
  });
  console.log('Daemon state after toggle:', JSON.stringify(daemonState));

  // Step 3: Navigate to Songs Page
  console.log('\n--- Step 3: Navigate to Songs Page ---');
  await page.evaluate(() => {
    const link = document.querySelector('a.songs');
    if (link) link.click();
    else window.location.hash = '#/main-player/songs';
  });
  await page.waitForTimeout(2000);

  // Wait for .play-all-btn
  await page.waitForFunction(() => document.querySelector('button.play-all-btn') !== null, {
    timeout: 15000
  });

  // Step 4: Click Play All
  console.log('\n--- Step 4: Starting playback with Play All ---');
  await page.evaluate(() => {
    const playAll = document.querySelector('button.play-all-btn');
    if (playAll) playAll.click();
  });
  console.log('Clicked play-all-btn.');

  // Monitor playback for 5 seconds
  let song1Data = null;
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(1000);
    const playState = await page.evaluate(async () => {
      const bottomTitleEl = document.querySelector('.song-controls-container .song-title');
      const bottomTitle = bottomTitleEl ? bottomTitleEl.textContent?.trim() : null;
      const nativeSetting = JSON.parse(
        localStorage.getItem('playback') || '{}'
      )?.useNativeAudioEngine;
      let daemon = null;
      try {
        daemon = await window.api.audioEngine.send({ cmd: 'get_state' });
      } catch (e) {
        daemon = { error: e.message };
      }
      return {
        bottomPlayerTitle: bottomTitle,
        useNativeAudioEngine: nativeSetting,
        daemonState: daemon
      };
    });
    if (playState.bottomPlayerTitle && !song1Data) {
      song1Data = playState.bottomPlayerTitle;
    }
    console.log(`[Track 1 Playing Tick ${i}s]:`, JSON.stringify(playState));
  }

  // Step 5: Shift song by clicking Skip Forward button
  console.log('\n--- Step 5: Shifting song by clicking Skip Forward button ---');
  await page.evaluate(() => {
    const skipBtn = document.querySelector('button.skip-forward-btn');
    if (skipBtn) skipBtn.click();
  });
  console.log('Clicked skip-forward-btn.');

  // Monitor for 5 seconds after shift
  let song2Data = null;
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(1000);
    const playState = await page.evaluate(async () => {
      const bottomTitleEl = document.querySelector('.song-controls-container .song-title');
      const bottomTitle = bottomTitleEl ? bottomTitleEl.textContent?.trim() : null;
      const nativeSetting = JSON.parse(
        localStorage.getItem('playback') || '{}'
      )?.useNativeAudioEngine;
      let daemon = null;
      try {
        daemon = await window.api.audioEngine.send({ cmd: 'get_state' });
      } catch (e) {
        daemon = { error: e.message };
      }
      return {
        bottomPlayerTitle: bottomTitle,
        useNativeAudioEngine: nativeSetting,
        daemonState: daemon
      };
    });
    if (playState.bottomPlayerTitle && playState.bottomPlayerTitle !== song1Data && !song2Data) {
      song2Data = playState.bottomPlayerTitle;
    }
    console.log(`[Track 2 (After Skip) Tick ${i}s]:`, JSON.stringify(playState));
  }

  console.log('\n=== SUMMARY OF PLAYBACK VERIFICATION ===');
  console.log(`Track 1 title in bottom player: "${song1Data}"`);
  console.log(`Track 2 title in bottom player: "${song2Data}"`);

  // Final check: is native engine still active and emitting hardware audio?
  const finalNative = await page.evaluate(() => {
    return JSON.parse(localStorage.getItem('playback') || '{}')?.useNativeAudioEngine;
  });
  console.log(`Final useNativeAudioEngine in localStorage: ${finalNative}`);

  const daemonResp = await page.evaluate(async () => {
    try {
      return await window.api.audioEngine.send({ cmd: 'get_state' });
    } catch (e) {
      return { error: e.message };
    }
  });

  const sinkType = daemonResp?.data?.sink_type ?? null;
  const isPlaying = daemonResp?.data?.state === 'playing';

  console.log(
    `Verification state: ${JSON.stringify({ nativeSetting: finalNative, sinkType, isPlaying })}`
  );

  const pass =
    finalNative === true &&
    sinkType === 'cpal_hardware' &&
    isPlaying === true &&
    song1Data !== null &&
    song2Data !== null &&
    song1Data !== song2Data;

  console.log(`VERIFICATION RESULT: ${pass ? 'PASSED (100% SUCCESS)' : 'FAILED'}`);

  await app.close();
  process.exitCode = pass ? 0 : 1;
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exitCode = 1;
});
