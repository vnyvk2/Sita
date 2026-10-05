import { _electron as electron } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('Launching Electron with user data from:', path.join(process.env.APPDATA, 'Nora'));
  const app = await electron.launch({
    args: [path.join(rootDir, 'out', 'main', 'main.js')],
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NORA_USER_DATA_DIR: path.join(process.env.APPDATA, 'Nora'),
      NORA_USER_DATA: path.join(process.env.APPDATA, 'Nora')
    }
  });

  const page = await app.firstWindow();
  console.log('Window loaded, waiting for DOM content...');
  await page.waitForLoadState('domcontentloaded');
  await sleep(4000);

  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('[AudioPlayer') ||
      text.includes('NativeAudio') ||
      text.includes('engine') ||
      text.includes('Error') ||
      text.includes('error')
    ) {
      console.log(`[RENDERER CONSOLE ${msg.type()}]`, text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('[RENDERER PAGE ERROR]', err);
  });

  console.log('\n======================================================');
  console.log('STEP 1: INSPECT INITIAL STATE & LIBRARY WITH FEATURE OFF');
  console.log('======================================================');

  const initialCheck = await page.evaluate(async () => {
    const p = window.__NORA_AUDIO_PLAYER__;
    const songIds = await window.api.audioLibraryControls.getAllSongIds();
    const rawStored = window.localStorage?.getItem('localStorage');
    const parsed = rawStored ? JSON.parse(rawStored) : null;
    return {
      songsCount: songIds?.length ?? 0,
      firstSongId: songIds?.[0],
      isNativeEngineActive: p?.isNativeEngineActive,
      paused: p?.paused,
      currentTime: p?.currentTime,
      audioPaused: p?.audio?.paused,
      storedUseNative: parsed?.playback?.useNativeAudioEngine
    };
  });
  console.log('Initial Library and Player state:', initialCheck);

  if (initialCheck.songsCount > 0) {
    console.log(`\nAttempting to play song ID ${initialCheck.firstSongId} with Feature OFF...`);
    const playResult = await page.evaluate(async (songId) => {
      const p = window.__NORA_AUDIO_PLAYER__;
      try {
        await p.playSongById(songId, { autoPlay: true });
        return {
          started: true,
          paused: p.paused,
          currentTime: p.currentTime,
          audioPaused: p.audio.paused,
          audioSrc: p.audio.src,
          audioReadyState: p.audio.readyState
        };
      } catch (err) {
        return { error: String(err) };
      }
    }, initialCheck.firstSongId);
    console.log('Play result (Feature OFF):', playResult);

    await sleep(3000);

    const playProgress = await page.evaluate(() => {
      const p = window.__NORA_AUDIO_PLAYER__;
      return {
        paused: p?.paused,
        currentTime: p?.currentTime,
        duration: p?.duration,
        audioPaused: p?.audio?.paused,
        audioCurrentTime: p?.audio?.currentTime,
        activeFadeGain: p?.activeFadeGain?.gain?.value,
        gainNode: p?.gainNode?.gain?.value,
        contextState: p?.currentContext?.state
      };
    });
    console.log('Playback progress after 3s (Feature OFF):', playProgress);
  }

  console.log('\n======================================================');
  console.log('STEP 2: NAVIGATE TO SETTINGS & TOGGLE FEATURE ON');
  console.log('======================================================');

  // Navigate to settings via route
  await page.evaluate(() => {
    window.location.hash = '#/main-player/settings';
  });
  await sleep(2500);

  // Check if settings page loaded and toggle the checkbox
  console.log('Looking for #useNativeAudioEngineCheckbox...');
  const clickCheckboxResult = await page.evaluate(() => {
    const cb = document.querySelector('#useNativeAudioEngineCheckbox');
    if (!cb) return { found: false };
    const beforeChecked = cb.checked;
    cb.click();
    return { found: true, beforeChecked, afterChecked: cb.checked };
  });
  console.log('DOM click on checkbox result:', clickCheckboxResult);

  await sleep(3000);

  const stateAfterToggleOn = await page.evaluate(() => {
    const p = window.__NORA_AUDIO_PLAYER__;
    const rawStored = window.localStorage.getItem('localStorage');
    const parsed = rawStored ? JSON.parse(rawStored) : null;
    return {
      isNativeEngineActive: p?.isNativeEngineActive,
      hasNativeBackend: Boolean(p?.nativeBackend),
      paused: p?.paused,
      currentTime: p?.currentTime,
      duration: p?.duration,
      audioPaused: p?.audio?.paused,
      storedUseNativeEngine: parsed?.playback?.useNativeAudioEngine
    };
  });
  console.log('State after toggle ON:', stateAfterToggleOn);

  console.log('\n--- Testing navigating away and back to Settings to test de-tickmark ---');
  await page.evaluate(() => {
    window.location.hash = '#/main-player/songs';
  });
  await sleep(2000);
  await page.evaluate(() => {
    window.location.hash = '#/main-player/settings';
  });
  await sleep(2000);

  const checkboxAfterRevisit = await page.evaluate(() => {
    const cb = document.querySelector('#useNativeAudioEngineCheckbox');
    const rawStored = window.localStorage.getItem('localStorage');
    const parsed = rawStored ? JSON.parse(rawStored) : null;
    return {
      found: Boolean(cb),
      checked: cb ? cb.checked : null,
      storedUseNativeEngine: parsed?.playback?.useNativeAudioEngine
    };
  });
  console.log('Checkbox state after revisiting Settings:', checkboxAfterRevisit);

  console.log('\n======================================================');
  console.log('STEP 3: PLAY SONG WITH FEATURE ON');
  console.log('======================================================');

  if (initialCheck.songsCount > 0) {
    const playNativeResult = await page.evaluate(async (songId) => {
      const p = window.__NORA_AUDIO_PLAYER__;
      try {
        await p.playSongById(songId, { autoPlay: true });
        return {
          started: true,
          isNativeEngineActive: p.isNativeEngineActive,
          paused: p.paused,
          currentTime: p.currentTime,
          duration: p.duration
        };
      } catch (err) {
        return { error: String(err) };
      }
    }, initialCheck.firstSongId);
    console.log('Play result (Feature ON):', playNativeResult);

    await sleep(4000);

    const nativeProgress = await page.evaluate(() => {
      const p = window.__NORA_AUDIO_PLAYER__;
      return {
        isNativeEngineActive: p?.isNativeEngineActive,
        paused: p?.paused,
        currentTime: p?.currentTime,
        duration: p?.duration,
        audioPaused: p?.audio?.paused
      };
    });
    console.log('Playback progress after 4s (Feature ON):', nativeProgress);
  }

  console.log('\n======================================================');
  console.log('STEP 4: TOGGLE FEATURE OFF AGAIN');
  console.log('======================================================');

  const uncheckResult = await page.evaluate(() => {
    const cb = document.querySelector('#useNativeAudioEngineCheckbox');
    if (!cb) return { found: false };
    const beforeChecked = cb.checked;
    cb.click();
    return { found: true, beforeChecked, afterChecked: cb.checked };
  });
  console.log('DOM uncheck result:', uncheckResult);

  await sleep(3000);

  const stateAfterToggleOff = await page.evaluate(() => {
    const p = window.__NORA_AUDIO_PLAYER__;
    const rawStored = window.localStorage.getItem('localStorage');
    const parsed = rawStored ? JSON.parse(rawStored) : null;
    return {
      isNativeEngineActive: p?.isNativeEngineActive,
      paused: p?.paused,
      currentTime: p?.currentTime,
      duration: p?.duration,
      audioPaused: p?.audio?.paused,
      audioCurrentTime: p?.audio?.currentTime,
      activeFadeGain: p?.activeFadeGain?.gain?.value,
      gainNode: p?.gainNode?.gain?.value,
      contextState: p?.currentContext?.state,
      storedUseNativeEngine: parsed?.playback?.useNativeAudioEngine
    };
  });
  console.log('State after toggle OFF:', stateAfterToggleOff);

  console.log('\n======================================================');
  console.log('STEP 5: PLAY SONG WITH FEATURE OFF AGAIN');
  console.log('======================================================');

  if (initialCheck.songsCount > 0) {
    const playOffAgainResult = await page.evaluate(async (songId) => {
      const p = window.__NORA_AUDIO_PLAYER__;
      try {
        await p.playSongById(songId, { autoPlay: true });
        return {
          started: true,
          isNativeEngineActive: p.isNativeEngineActive,
          paused: p.paused,
          currentTime: p.currentTime,
          audioPaused: p.audio.paused,
          activeFadeGain: p.activeFadeGain.gain.value,
          gainNode: p.gainNode.gain.value
        };
      } catch (err) {
        return { error: String(err) };
      }
    }, initialCheck.firstSongId);
    console.log('Play result (Feature OFF again):', playOffAgainResult);

    await sleep(3000);

    const finalProgress = await page.evaluate(() => {
      const p = window.__NORA_AUDIO_PLAYER__;
      return {
        isNativeEngineActive: p?.isNativeEngineActive,
        paused: p?.paused,
        currentTime: p?.currentTime,
        duration: p?.duration,
        audioPaused: p?.audio?.paused,
        audioCurrentTime: p?.audio?.currentTime,
        activeFadeGain: p?.activeFadeGain?.gain?.value,
        gainNode: p?.gainNode?.gain?.value,
        contextState: p?.currentContext?.state
      };
    });
    console.log('Final playback progress after 3s (Feature OFF again):', finalProgress);
  }

  console.log('\nTaking screenshot...');
  await page.screenshot({ path: path.join(rootDir, 'playwright-audit.png') });

  console.log('\nClosing app...');
  await app.close();
  console.log('Interactive audit completed successfully!');
}

run().catch((err) => {
  console.error('Interactive audit failed:', err);
  process.exit(1);
});
