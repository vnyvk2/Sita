// MUST remain the first import: redirects userData before any module
// (including the database bootstrap) reads Electron paths.
import './lifecycle/userDataGuard';
import fs from 'fs';
import os from 'os';
import path, { join } from 'path';

import { getSongById } from '@main/db/queries/songs';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  shell,
  protocol,
  crashReporter,
  nativeTheme,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  net,
  powerSaveBlocker,
  screen,
  session as electronSession,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron';

if (process.env.REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.REMOTE_DEBUGGING_PORT);
}

if (process.env.NORA_USER_DATA) {
  fs.mkdirSync(process.env.NORA_USER_DATA, { recursive: true });
  app.setPath('userData', process.env.NORA_USER_DATA);
}
memProfiler.stage('main-entry');

if (memProfiler.enabled) {
  process.on('unhandledRejection', (reason) => {
    memProfiler.stage('unhandledRejection', {
      reason: reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason)
    });
  });
  process.on('uncaughtException', (error) => {
    memProfiler.stage('uncaughtException', {
      reason: `${error?.message}\n${error?.stack ?? ''}`
    });
  });
}

import { version, appPreferences } from '../../package.json';
import noraAppIcon from '../../resources/logo_light_mode.png?asset';
import {
  COMPACT_MINI_PLAYER_HEIGHT,
  COMPACT_MINI_PLAYER_MIN_WIDTH,
  MINI_PLAYER_DEFAULT_SIZE_X,
  MINI_PLAYER_DEFAULT_SIZE_Y,
  MINI_PLAYER_MIN_SIZE_X,
  MINI_PLAYER_MIN_SIZE_Y
} from '@common/miniPlayerConstants';
import roundTo from '../common/roundTo';
import manageLastFmAuth from './auth/manageLastFmAuth';
import changeAppTheme from './core/changeAppTheme';
import checkForStartUpSongs from './core/checkForStartUpSongs';
import manageTaskbarPlaybackButtonControls from './core/manageTaskbarPlaybackButtonControls';
import { recoverLibraryAssets } from './core/recovery';
// import { fileURLToPath, pathToFileURL } from 'url';
import { closeDatabaseInstance, isDatabaseStubbed } from './db/db';
import { getUserSettings, saveUserSettings } from './db/queries/settings';
import { closeAllAbortControllers, saveAbortController } from './fs/controlAbortControllers';
import { flushPendingWritesBeforeExit } from './utils/flushPendingWritesBeforeExit';
import { handleFileProtocol } from './handleFileProtocol';
import { initializeIPC } from './ipc';
import libraryLifecycleController from './library/LibraryLifecycleController';
import { attachRendererRecovery } from './lifecycle/rendererRecovery';
import ShutdownCoordinator from './lifecycle/ShutdownCoordinator';
import ShutdownLogger from './lifecycle/ShutdownLogger';
import logger from './logger';
import { flushScrobbleQueue } from './other/lastFm/flushScrobbleQueue';
import resetAppData from './resetAppData';
import { savePendingSongLyrics } from './saveLyricsToSong';
import checkForUpdates from './update';
import { savePendingMetadataUpdates } from './updateSong/updateSongId3Tags';
import { isRectOnAnyDisplay, isValidPersistedPosition } from './utils/windowPosition';
import memProfiler from './utils/memProfiler';

// / / / / / / / CONSTANTS / / / / / / / / /
const DEFAULT_APP_PROTOCOL = 'nora';

const MAIN_WINDOW_MIN_SIZE_X = 700;
const MAIN_WINDOW_MIN_SIZE_Y = 500;
const MAIN_WINDOW_MAX_SIZE_X = 10000;
const MAIN_WINDOW_MAX_SIZE_Y = 5000;
const MAIN_WINDOW_ASPECT_RATIO = 0;

const MAIN_WINDOW_DEFAULT_SIZE_X = 1280;
const MAIN_WINDOW_DEFAULT_SIZE_Y = 720;
const MAIN_WINDOW_DEFAULT_ZOOM_FACTOR = 0.8;
const MAIN_WINDOW_MIN_ZOOM_FACTOR = 0.5;
const MAIN_WINDOW_MAX_ZOOM_FACTOR = 3;

const MINI_PLAYER_MAX_SIZE_X = 540;
const MINI_PLAYER_MAX_SIZE_Y = 405;
const MINI_PLAYER_ASPECT_RATIO = 0;

const QUEUE_ITEM_HEIGHT = 52;
const QUEUE_HEADER_HEIGHT = 44;
const QUEUE_MAX_VISIBLE_ITEMS = 8;
const abortController = new AbortController();
const DEFAULT_OPEN_DIALOG_OPTIONS: OpenDialogOptions = {
  title: 'Select a Music Folder',
  buttonLabel: 'Add folder',
  filters: [
    {
      name: 'Audio Files',
      extensions: appPreferences.supportedMusicExtensions
    }
  ],
  properties: ['openDirectory', 'multiSelections']
};
const DEFAULT_SAVE_DIALOG_OPTIONS: SaveDialogOptions = {
  title: 'Select the destination to Save',
  buttonLabel: 'Save',
  properties: ['createDirectory', 'showOverwriteConfirmation']
};

// / / / / / / VARIABLES / / / / / / /
export let mainWindow: BrowserWindow;
let tray: Tray;
let playerType: PlayerTypes = 'normal';
let isChangingPlayerType = false;
let playerTypeTransitionPromise: Promise<void> = Promise.resolve();
// let isConnectedToInternet = false;
let isAudioPlaying = false;
let isOnBatteryPower = false;
let currentSongPath: string;
let powerSaveBlockerId: number | null;
let currentWindowZoomFactor = MAIN_WINDOW_DEFAULT_ZOOM_FACTOR;
let isQueueExpanded = false;
let compactHeight: number | null = null;
let compactY: number | null = null;
let compactX: number | null = null;
let expandedHeight: number | null = null;
let expandedDirection: 'up' | 'down' | null = null;
let programmaticMoveTarget: { x: number; y: number } | null = null;
let programmaticMoveTimeout: NodeJS.Timeout | null = null;

function setProgrammaticMoveTarget(x: number, y: number) {
  programmaticMoveTarget = { x, y };
  if (programmaticMoveTimeout) clearTimeout(programmaticMoveTimeout);
  programmaticMoveTimeout = setTimeout(() => {
    programmaticMoveTarget = null;
    programmaticMoveTimeout = null;
  }, 500);
}

function clearProgrammaticMoveTarget() {
  if (programmaticMoveTimeout) {
    clearTimeout(programmaticMoveTimeout);
    programmaticMoveTimeout = null;
  }
  programmaticMoveTarget = null;
}

let currentMiniPlayerMinWidth = MINI_PLAYER_MIN_SIZE_X;
let currentMiniPlayerMinHeight = MINI_PLAYER_MIN_SIZE_Y;
export { COMPACT_MINI_PLAYER_HEIGHT, COMPACT_MINI_PLAYER_MIN_WIDTH };
let currentMiniPlayerMode: 'standard' | 'compact' = 'standard';
let savedStandardHeight = MINI_PLAYER_DEFAULT_SIZE_Y;

function setMiniPlayerBoundsProgrammatically(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  if (!mainWindow) return;
  const [currentX, currentY] = mainWindow.getPosition();
  if (bounds.x !== currentX || bounds.y !== currentY) {
    setProgrammaticMoveTarget(bounds.x, bounds.y);
  }
  mainWindow.setBounds(bounds, false);
}

function moveWindowProgrammatically(x: number, y: number, animate = false) {
  if (!mainWindow) return;
  const [currentX, currentY] = mainWindow.getPosition();
  if (x !== currentX || y !== currentY) {
    setProgrammaticMoveTarget(x, y);
  }
  mainWindow.setPosition(x, y, animate);
}

export { isRectOnAnyDisplay, isValidPersistedPosition } from './utils/windowPosition';

// / / / / / / INITIALIZATION / / / / / / /

// Behaviour on second instance for parent process
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  logger.warn('Another app instance is currently active. Quitting this instance.');
  app.quit();
} else app.on('second-instance', handleSecondInstances);

export const IS_DEVELOPMENT = !app.isPackaged || process.env.NODE_ENV === 'development';

const appIcon = nativeImage
  .createFromPath(noraAppIcon)
  .resize(process.platform === 'darwin' ? { width: 15, height: 15 } : { width: 50, height: 50 });

// dotenv.config({ debug: true });
saveAbortController('main', abortController);

// Sentry.init({
//   dsn: import.meta.env.MAIN_VITE_SENTRY_DSN,
// });
// ? / / / / / / / / / / / / / / / / / / / / / / /
// debug();
const BYTES_TO_GB = 1024 * 1024 * 1024;
const APP_INFO = {
  environment: IS_DEVELOPMENT ? 'DEV' : 'PRODUCTION',
  appVersion: `v${version}`,
  systemInfo: {
    cpu: os.cpus()[0].model.trim(),
    os: os.release(),
    architechture: os.arch(),
    platform: os.platform(),
    totalMemory: `${os.totalmem()} (${roundTo(os.totalmem() / BYTES_TO_GB, 2)} GB)`
  }
};

logger.debug(`Starting up Nora`, { APP_INFO });
ShutdownLogger.logBootMilestone('Application boot', { APP_INFO });

// 2c P4: replay deferred metadata writes persisted by a previous session.
// Nothing is playing during boot, so every item flushes immediately.
void import('./updateSong/updateSongId3Tags')
  .then((m) => m.restorePersistedPendingWrites())
  .catch((err) => logger.error('Failed to restore persisted pending metadata writes', { err }));

function launchExtensionBackgroundWorkers(session = electronSession.defaultSession) {
  return Promise.all(
    session.extensions.getAllExtensions().map(async (extension) => {
      const manifest = extension.manifest;
      if (manifest.manifest_version === 3 && manifest?.background?.service_worker) {
        try {
          await session.serviceWorkers.startWorkerForScope(extension.url);
        } catch (workerError) {
          logger.debug('Skipped background service worker startup for extension', {
            name: extension.name,
            id: extension.id,
            error: workerError
          });
        }
      }
    })
  );
}

const installExtensions = async () => {
  try {
    const devtoolsModule = (await import('electron-devtools-installer')) as any;
    const installExtension =
      devtoolsModule.installExtension ??
      devtoolsModule.default?.installExtension ??
      devtoolsModule.default?.default ??
      devtoolsModule.default;

    if (typeof installExtension !== 'function') {
      throw new TypeError('electron-devtools-installer does not expose installExtension');
    }

    const REACT_DEVELOPER_TOOLS =
      devtoolsModule.REACT_DEVELOPER_TOOLS ??
      devtoolsModule.default?.REACT_DEVELOPER_TOOLS;

    if (!REACT_DEVELOPER_TOOLS) {
      throw new TypeError('electron-devtools-installer does not expose REACT_DEVELOPER_TOOLS');
    }

    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;

    const ext = await installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true },
      forceDownload
    });
    logger.debug(`Added Extension: ${ext}`);
    await launchExtensionBackgroundWorkers();
  } catch (error) {
    logger.error(`Failed to install extensions to devtools`, { error });
  }
};

export const getBackgroundColor = async () => {
  if (isDatabaseStubbed) return '#212226';
  const { isDarkMode } = await getUserSettings();

  if (isDarkMode) return '#212226';
  return '#FFFFFF';
};

const normalizeZoomFactor = (zoomFactor?: number | null) => {
  if (typeof zoomFactor !== 'number' || !Number.isFinite(zoomFactor)) {
    return MAIN_WINDOW_DEFAULT_ZOOM_FACTOR;
  }

  return Math.min(Math.max(zoomFactor, MAIN_WINDOW_MIN_ZOOM_FACTOR), MAIN_WINDOW_MAX_ZOOM_FACTOR);
};

const applyWindowZoomFactor = (zoomFactor: number, reason: string) => {
  const normalizedZoomFactor = normalizeZoomFactor(zoomFactor);
  const existingZoomFactor = mainWindow.webContents.getZoomFactor();

  currentWindowZoomFactor = normalizedZoomFactor;

  if (Math.abs(existingZoomFactor - normalizedZoomFactor) > 0.001) {
    mainWindow.webContents.setZoomFactor(normalizedZoomFactor);
    logger.debug('Applied renderer zoom factor.', {
      reason,
      previousZoomFactor: existingZoomFactor,
      nextZoomFactor: normalizedZoomFactor
    });
  }
};

const persistWindowZoomFactor = async (zoomFactor: number) => {
  try {
    await saveUserSettings({ zoomFactor });
  } catch (error) {
    logger.error('Failed to persist renderer zoom factor.', { zoomFactor, error });
  }
};

const handleZoomFactorChanged = async () => {
  const zoomFactor = normalizeZoomFactor(mainWindow.webContents.getZoomFactor());

  if (Math.abs(zoomFactor - currentWindowZoomFactor) <= 0.001) {
    return;
  }

  currentWindowZoomFactor = zoomFactor;
  logger.debug('Persisting updated renderer zoom factor.', { zoomFactor });
  await persistWindowZoomFactor(zoomFactor);
};

const restoreWindowZoomOnFocus = () => {
  applyWindowZoomFactor(currentWindowZoomFactor, 'window-focus');
};

const getPreloadPath = (): string => {
  const candidates = [
    path.resolve(import.meta.dirname, '../preload/index.cjs'),
    path.resolve(import.meta.dirname, '../../preload/index.cjs')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
};

const createWindow = async () => {
  if (IS_DEVELOPMENT && !memProfiler.enabled) await installExtensions();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 700,
    minHeight: 500,
    minWidth: 700,
    title: 'Nora',
    webPreferences: {
      zoomFactor: currentWindowZoomFactor,
      preload: getPreloadPath()
    },
    visualEffectState: 'followWindow',
    roundedCorners: true,
    frame: false,
    backgroundColor: await getBackgroundColor(),
    icon: appIcon,
    titleBarStyle: 'hidden',
    show: false
  });
  ShutdownLogger.logBootMilestone('BrowserWindow created');

  memProfiler.attachWindowDiagnostics(mainWindow);

  if (IS_DEVELOPMENT && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    let rendererIndexPath = join(import.meta.dirname, '../renderer/index.html');
    if (memProfiler.enabled && !fs.existsSync(rendererIndexPath)) {
      rendererIndexPath = join(app.getAppPath(), 'out', 'renderer', 'index.html');
    }
    mainWindow.loadFile(rendererIndexPath);
  }
  mainWindow.once('ready-to-show', () => {
    memProfiler.stage('ready-to-show');
    if (app.hasSingleInstanceLock() && !isDatabaseStubbed && process.env.NORA_NO_SCAN !== '1') {
      logger.info('Initializing library lifecycle controller on startup.');
      void libraryLifecycleController.initialize();
    }
  });
  mainWindow.webContents.once('did-finish-load', () => {
    memProfiler.stage('did-finish-load');
    manageWindowFinishLoad();
  });
  mainWindow.webContents.setWindowOpenHandler((data: { url: string }) => {
    shell.openExternal(data.url);
    return { action: 'deny' };
  });
  attachRendererRecovery(mainWindow.webContents, {
    getPlayerType: () => playerType,
    onRecovered: (preCrashPlayerType) => {
      // Main's playerType and window geometry survive a renderer-only crash,
      // so changePlayerType is a no-op safeguard here. The RENDERER store,
      // however, resets to 'normal' after a crash-triggered reload, and mini/
      // full presentation is store-driven (not URL-driven). Re-assert the
      // pre-crash presentation over the existing message channel until the
      // renderer picks it up; repeats are idempotent on the renderer side.
      void changePlayerType(preCrashPlayerType);
      if (preCrashPlayerType === 'normal') return;

      let attempts = 0;
      const reassertInterval = setInterval(() => {
        attempts += 1;
        if (
          attempts > 8 ||
          !mainWindow ||
          mainWindow.isDestroyed() ||
          playerType !== preCrashPlayerType ||
          isChangingPlayerType
        ) {
          clearInterval(reassertInterval);
          return;
        }
        sendMessageToRenderer({
          messageCode: 'RESTORE_PLAYER_TYPE_AFTER_RECOVERY',
          data: { playerType: preCrashPlayerType }
        });
      }, 750);
    },
    onRecoveryLimitExceeded: () => restartApp('renderer-crash-loop')
  });

  // mainWindow.on('closed', () => {
  //   // Dereference the window object
  //   mainWindow = null;
  // });
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nora',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);

app
  .whenReady()
  .then(async () => {
    memProfiler.stage('when-ready');
    memProfiler.startSampling(1500);

    const { windowState, zoomFactor } = isDatabaseStubbed
      ? { windowState: 'normal' as const, zoomFactor: null }
      : await getUserSettings();

    currentWindowZoomFactor = normalizeZoomFactor(zoomFactor);

    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    memProfiler.stage('window-created-and-loaded');

    if (windowState === 'maximized') mainWindow.maximize();

    if (!app.isDefaultProtocolClient(DEFAULT_APP_PROTOCOL)) {
      logger.info(
        'No default protocol registered. Starting the default protocol registration process.'
      );
      const res = app.setAsDefaultProtocolClient(DEFAULT_APP_PROTOCOL);

      if (res) logger.info('Default protocol registered successfully.');
      else logger.warn('Default protocol registration failed.');
    }

    // protocol.registerFileProtocol('nora', registerFileProtocol);
    protocol.handle('nora', handleFileProtocol);

    tray = new Tray(appIcon);
    const trayContextMenu = Menu.buildFromTemplate([
      {
        label: 'Show/Hide Nora',
        type: 'normal',
        click: () => (mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()),
        role: 'hide'
      },
      { type: 'separator' },
      { label: 'Exit', type: 'normal', click: () => app.quit(), role: 'close' }
    ]);

    tray.setContextMenu(trayContextMenu);
    tray.setToolTip('Nora');

    tray.addListener('click', () => tray.popUpContextMenu(trayContextMenu));
    tray.addListener('double-click', () => {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    });

    // powerMonitor.addListener('shutdown', (e) => e.preventDefault());

    app.on('before-quit', handleBeforeQuit);

    app.on('will-quit', closeDatabaseInstance);

    mainWindow.on('moved', manageAppMoveEvent);

    mainWindow.on('resized', () => {
      manageAppMoveEvent();
      manageAppResizeEvent();
    });

    mainWindow.on('maximize', () => recordWindowState('maximized'));

    mainWindow.on('minimize', () => recordWindowState('minimized'));

    mainWindow.on('unmaximize', () => recordWindowState('normal'));

    mainWindow.on('restore', () => recordWindowState('normal'));

    mainWindow.on('system-context-menu', (event) => {
      event.preventDefault();
      if (playerType === 'mini') {
        sendMessageToRenderer({ messageCode: 'SHOW_MINI_PLAYER_CONTEXT_MENU' });
      }
    });

    // app.setPath('crashDumps', path.join(app.getPath('userData'), 'crashDumps'));

    app.on('will-finish-launching', () => {
      crashReporter.start({ uploadToServer: false });
      logger.debug(`App startup command line arguments`, { args: process.argv });
    });

    mainWindow.webContents.addListener('zoom-changed', (_, dir) =>
      logger.debug(`Renderer zoomed ${dir}. ${mainWindow.webContents.getZoomLevel()}`)
    );
    // oxlint-disable-next-line promise/no-nesting
    mainWindow.webContents
      .setVisualZoomLevelLimits(1, 1)
      .catch((error) => logger.error('Failed to set visual zoom limits.', { error }));
    mainWindow.on('focus', restoreWindowZoomOnFocus);
    mainWindow.webContents.on('zoom-changed', () => {
      void handleZoomFactorChanged();
    });

    // ? / / / / / / / / /  IPC RENDERER EVENTS  / / / / / / / / / / / /
    if (mainWindow) {
      initializeIPC(mainWindow, abortController.signal);
      ShutdownLogger.logBootMilestone('IPC initialized');
      memProfiler.stage('ipc-initialized');
      if (process.env.NORA_SCENARIO !== '0') {
        void memProfiler.runBootScenario(mainWindow);
      }
      checkForUpdates();
      //  / / / / / / / / / / / GLOBAL SHORTCUTS / / / / / / / / / / / / / /
      // globalShortcut.register('F5', () => {
      //   const isFocused = mainWindow.isFocused();
      //   logger('USER REQUESTED RENDERER REFRESH USING GLOBAL SHORTCUT.', {
      //     isFocused,
      //   });
      //   if (isFocused) restartRenderer();
      // });

      globalShortcut.register('F12', () => {
        logger.debug('User requested for devtools using global shortcut. Request wont be served.');
        // mainWindow.webContents.openDevTools({ mode: 'detach', activate: true });
      });
    }
    return undefined;
  })
  .catch((error) => logger.error('Error occurred when starting the app.', { error }));

app.on('window-all-closed', () => {
  ShutdownLogger.logEventObservation('main.ts:app.on(window-all-closed)');
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  ShutdownLogger.logEventObservation('main.ts:app.on(will-quit)');
  memProfiler.shutdown();
  void closeDatabaseInstance();
});

process.on('SIGTERM', () => {
  ShutdownLogger.logEventObservation('process.on(SIGTERM)');
  app.quit();
});

process.on('SIGINT', () => {
  ShutdownLogger.logEventObservation('process.on(SIGINT)');
  app.quit();
});

process.on('exit', (code) => {
  ShutdownLogger.logEventObservation(`process.on(exit)[exitCode:${code}]`);
});

// / / / / / / / / / / / / / / / / / / / / / / / / / / / /
async function manageWindowFinishLoad() {
  const { mainWindowHeight, mainWindowWidth, mainWindowX, mainWindowY } = await getUserSettings();

  const targetWidth = mainWindowWidth || MAIN_WINDOW_DEFAULT_SIZE_X;
  const targetHeight = mainWindowHeight || MAIN_WINDOW_DEFAULT_SIZE_Y;

  mainWindow.setSize(targetWidth, targetHeight, true);

  if (isValidPersistedPosition(mainWindowX, mainWindowY, targetWidth, targetHeight)) {
    mainWindow.setPosition(mainWindowX as number, mainWindowY as number, true);
    ensureWindowIsVisible(mainWindow);
  } else {
    if (mainWindowX !== null && mainWindowY !== null) {
      logger.warn('Saved main window position is invalid on startup. Centering window.', {
        mainWindowX,
        mainWindowY
      });
    }
    mainWindow.center();
    const [x, y] = mainWindow.getPosition();
    await saveUserSettings({ mainWindowX: x, mainWindowY: y }).catch((error) =>
      logger.error('Failed to persist centered main window position on startup', { error })
    );
  }

  applyWindowZoomFactor(currentWindowZoomFactor, 'window-finish-load');

  mainWindow.show();
  manageWindowPositionInMonitor();

  if (IS_DEVELOPMENT && !process.env.NORA_DEVTOOLS_CLOSED)
    mainWindow.webContents.openDevTools({ mode: 'detach', activate: true });

  logger.debug(`Starting up the renderer.`);

  manageTaskbarPlaybackButtonControls(mainWindow, true, false);

  nativeTheme.addListener('updated', () => {
    watchForSystemThemeChanges();
    manageTaskbarPlaybackButtonControls(mainWindow, true, isAudioPlaying);
  });

  flushScrobbleQueue().catch((error) => {
    logger.error('Failed initial startup scrobble queue flush', { error });
  });

  recoverLibraryAssets().catch((error) => {
    logger.error('Failed initial startup recovery and genre reconciliation sync', { error });
  });
}

let isCleaningUp = false;
let isCleanupComplete = false;
async function handleBeforeQuit(e: Electron.Event) {
  if (isCleanupComplete) {
    ShutdownLogger.logEventObservation('main.ts:handleBeforeQuit[allowing-natural-quit]');
    return;
  }

  e.preventDefault();

  if (isCleaningUp) {
    ShutdownLogger.logEventObservation('main.ts:handleBeforeQuit[already-in-progress]');
    return;
  }

  isCleaningUp = true;
  void (async () => {
    try {
      await ShutdownCoordinator.shutdown('main.ts:handleBeforeQuit', mainWindow, currentSongPath);
      isCleanupComplete = true;
      app.quit();
    } catch (error) {
      isCleaningUp = false;
      logger.error('ShutdownCoordinator failed during handleBeforeQuit:', { error });
    }
  })();
}

export function toggleAudioPlayingState(isPlaying: boolean) {
  logger.debug(`Player playback status : ${isPlaying}`, { isPlaying });
  isAudioPlaying = isPlaying;
  manageTaskbarPlaybackButtonControls(mainWindow, true, isPlaying);
}

export function toggleOnBatteryPower() {
  isOnBatteryPower = powerMonitor.isOnBatteryPower();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
    mainWindow.webContents.send('app/isOnBatteryPower', isOnBatteryPower);
  }
}

export function sendMessageToRenderer(props: MessageToRendererProps) {
  const { messageCode, data } = props;

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
    mainWindow.webContents.send('app/sendMessageToRendererEvent', messageCode, data);
  }
}

let dataUpdateEventTimeOutId: NodeJS.Timeout;
let dataEventsCache: DataUpdateEvent[] = [];
export function dataUpdateEvent(
  dataType: DataUpdateEventTypes,
  data = [] as number[],
  message?: string
) {
  if (dataUpdateEventTimeOutId) clearTimeout(dataUpdateEventTimeOutId);
  logger.debug(`Data update event fired.`, { dataType, data, message });
  addEventsToCache(dataType, data, message);
  dataUpdateEventTimeOutId = setTimeout(() => {
    logger.verbose('Data Events Cache', { dataEventsCache });
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
      mainWindow.webContents.send('app/dataUpdateEvent', dataEventsCache, data, message);
    }
    dataEventsCache = [];
  }, 1000);
}

function addEventsToCache(dataType: DataUpdateEventTypes, data = [] as number[], message?: string) {
  for (let i = 0; i < dataEventsCache.length; i += 1) {
    if (dataEventsCache[i].dataType === dataType) {
      if (data.length > 0 || message) {
        return dataEventsCache[i].eventData.push({ data, message });
      }
      return undefined;
    }
  }

  const obj = {
    dataType,
    eventData: data.length > 0 || message ? [{ data, message }] : []
  } as DataUpdateEvent;
  return dataEventsCache.push(obj);
}

// function registerFileProtocol(request: { url: string }, callback: (arg: string) => void) {
//   const urlWithQueries = decodeURI(request.url).replace(
//     /nora:[/\\]{1,2}localfiles[/\\]{1,2}/gm,
//     ''
//   );

//   try {
//     const [url] = urlWithQueries.split('?');
//     return callback(url);

//   } catch (error) {
//     logger.error(`Failed to locate a resource in the system.`, { urlWithQueries, error });
//     return callback('404');
//   }
// }

// const handleFileProtocol = async (request: GlobalRequest): Promise<GlobalResponse> => {
//   try {
//     const urlWithQueries = decodeURI(request.url).replace(
//       /(nora:[\/\\]{1,2}localfiles[\/\\]{1,2})|(\?ts\=\d+$)?/gm,
//       ''
//     );
//     let [fileDir] = urlWithQueries.split('?');

//     if (os.platform() === 'darwin') fileDir = '/' + fileDir;

//     // logger.verbose('Serving file from nora://', { filePath });

//     const asFileUrl = pathToFileURL(fileDir).toString();
//     const filePath = fileURLToPath(asFileUrl);

//     if (filePath.startsWith('..')) {
//       return new Response('Invalid URL (not absolute)', {
//         status: 400
//       });
//     }

//     const rangeHeader = request.headers.get('Range');
//     let response;
//     if (!rangeHeader) {
//       response = await net.fetch(asFileUrl);
//     } else {
//       response = await net.fetch(asFileUrl, {
//         headers: {
//           Range: rangeHeader
//         }
//       });
//     }

//     response.headers.set('X-Content-Type-Options', 'nosniff');

//     return response;
//   } catch (error) {
//     logger.error('Error handling media protocol:', { error });
//     return new Response('Internal Server Error', { status: 500 });
//   }
// };

export const setCurrentSongPath = (songPath: string) => {
  currentSongPath = songPath;
  savePendingSongLyrics(currentSongPath, false);
  savePendingMetadataUpdates(currentSongPath, true);
};

export const getCurrentSongPath = () => currentSongPath;

function manageAuthServices(url: string) {
  logger.debug('URL selected for auth service', { url });
  const { searchParams } = new URL(url);

  if (searchParams.has('service')) {
    if (searchParams.get('service') === 'lastfm') {
      const token = searchParams.get('token');
      if (token) return manageLastFmAuth(token);
    }
  }
  return undefined;
}

export async function showOpenDialog(openDialogOptions = DEFAULT_OPEN_DIALOG_OPTIONS) {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, openDialogOptions);

  if (canceled) {
    logger.debug('User cancelled the folder selection popup.');
    throw new Error('PROMPT_CLOSED_BEFORE_INPUT' as MessageCodes);
  }
  return filePaths;
}

export async function showSaveDialog(saveDialogOptions = DEFAULT_SAVE_DIALOG_OPTIONS) {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, saveDialogOptions);

  if (canceled) {
    logger.debug('User cancelled the folder selection popup.');
    throw new Error('PROMPT_CLOSED_BEFORE_INPUT' as MessageCodes);
  }
  return filePath;
}

function manageAppMoveEvent() {
  if (isChangingPlayerType) return;

  // Windows teleports minimized windows to (-32000, -32000) which Electron reports
  // through the 'moved' event. Never treat that as a user-chosen position.
  if (mainWindow.isMinimized()) return;

  const [x, y] = mainWindow.getPosition();
  const [width, height] = mainWindow.getSize();

  // Guard: if a programmatic move is in progress, ignore all move events (both intermediate
  // frames and the final event) until the window settles at the target coordinates or the guard expires.
  if (programmaticMoveTarget) {
    if (programmaticMoveTarget.x === x && programmaticMoveTarget.y === y) {
      clearProgrammaticMoveTarget();
    }
    return;
  }

  if (!isValidPersistedPosition(x, y, width, height)) {
    logger.warn('Ignoring window move reported at an invalid position', {
      playerType,
      x,
      y,
      width,
      height
    });
    return;
  }
  logger.debug(`User moved the player`, { playerType, coordinates: { x, y } });

  if (playerType === 'mini') {
    if (isQueueExpanded && compactHeight !== null && expandedHeight !== null) {
      const heightDelta = expandedHeight - compactHeight;
      const anchorY = expandedDirection === 'up' ? y + heightDelta : y;
      compactX = x;
      compactY = anchorY;
      saveUserSettings({ miniPlayerX: x, miniPlayerY: anchorY }).catch((error) =>
        logger.error('Failed to persist mini player position', { error })
      );
    } else {
      compactX = x;
      compactY = y;
      saveUserSettings({ miniPlayerX: x, miniPlayerY: y }).catch((error) =>
        logger.error('Failed to persist mini player position', { error })
      );
    }
  } else if (playerType === 'normal') {
    saveUserSettings({ mainWindowX: x, mainWindowY: y }).catch((error) =>
      logger.error('Failed to persist main window position', { error })
    );
  }
}

function manageAppResizeEvent() {
  if (isChangingPlayerType) return;

  // Avoid persisting sizes reported while Windows has the window minimized
  if (mainWindow.isMinimized()) return;

  const [width, height] = mainWindow.getSize();
  logger.debug(`User resized the player`, {
    playerType,
    isQueueExpanded,
    dimensions: { width, height }
  });

  // Don't save the expanded queue size as the user's preferred compact size
  if (playerType === 'mini' && isQueueExpanded) return;

  if (playerType === 'mini') {
    if (currentMiniPlayerMode === 'compact') {
      // In Compact Mode, only save width so standard mode height is preserved
      saveUserSettings({ miniPlayerWidth: width }).catch((error) =>
        logger.error('Failed to persist mini player size', { error })
      );
    } else {
      savedStandardHeight = height;
      saveUserSettings({ miniPlayerWidth: width, miniPlayerHeight: height }).catch((error) =>
        logger.error('Failed to persist mini player size', { error })
      );
    }
  } else if (playerType === 'normal') {
    saveUserSettings({ mainWindowWidth: width, mainWindowHeight: height }).catch((error) =>
      logger.error('Failed to persist main window size', { error })
    );
  }
}

async function handleSecondInstances(_: unknown, argv: string[]) {
  logger.debug('User requested for a second instance of the app.');
  if (app.hasSingleInstanceLock()) {
    if (mainWindow?.isMinimized()) mainWindow?.restore();
    mainWindow?.focus();
  }
  process.argv = argv;

  manageSecondInstanceArgs(argv);
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
    mainWindow.webContents.send('app/playSongFromUnknownSource', await checkForStartUpSongs());
  }
}

function manageSecondInstanceArgs(args: string[]) {
  for (const arg of args) {
    if (arg.includes('nora://auth')) return manageAuthServices(arg);
  }
  return undefined;
}

export async function restartApp(reason: string, noQuitEvents = false) {
  logger.debug(`Requested a full app refresh.`, { reason });

  if (!noQuitEvents) {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
      mainWindow.webContents.send('app/beforeQuitEvent');
    }
  }

  // Pending filesystem writes (tag/lyrics queues) and in-flight operations are
  // independent of renderer quit events; they must be settled on EVERY restart
  // path so a relaunch never silently drops them.
  await flushPendingWritesBeforeExit(currentSongPath);
  closeAllAbortControllers();

  app.relaunch();
  app.exit(0);
}

export async function revealSongInFileExplorer(songId: number) {
  const song = await getSongById(songId);

  if (song) return shell.showItemInFolder(song.path);

  logger.warn(
    `Revealing song file in explorer failed because song couldn't be found in the library.`,
    { songId }
  );
  return sendMessageToRenderer({ messageCode: 'OPEN_SONG_IN_EXPLORER_FAILED' });
}

const songsOutsideLibraryData: AudioPlayerData[] = [];

export const getSongsOutsideLibraryData = () => songsOutsideLibraryData;

export const addToSongsOutsideLibraryData = (data: AudioPlayerData) =>
  songsOutsideLibraryData.push(data);

export const updateSongsOutsideLibraryData = (
  songidOrPath: string | number,
  data: AudioPlayerData
): void => {
  for (let i = 0; i < songsOutsideLibraryData.length; i += 1) {
    if (
      songsOutsideLibraryData[i].path === songidOrPath ||
      songsOutsideLibraryData[i].songId === songidOrPath
    ) {
      songsOutsideLibraryData[i] = data;
      return undefined;
    }
  }

  const errMessage = `songIdOrPath didn't exist on songsOutsideLibraryData.`;
  logger.error(errMessage, { songidOrPath, songsOutsideLibraryData });
  throw new Error(errMessage);
};

export async function getImagefileLocation() {
  const filePaths = await showOpenDialog({
    title: 'Select an Image',
    buttonLabel: 'Select Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'webp', 'png'] }],
    properties: ['openFile']
  });
  return filePaths[0];
}

export async function getFolderLocation() {
  const folderPaths = await showOpenDialog({
    title: 'Select a Folder',
    buttonLabel: 'Select Folder',
    properties: ['createDirectory', 'openDirectory']
  });
  return folderPaths[0];
}

export async function resetApp(isRestartApp = true) {
  logger.debug('Started the resetting process of the app.');
  try {
    await mainWindow.webContents.session.clearStorageData();
    await resetAppData();

    logger.debug(`Successfully reset the app. Restarting the app now.`);
    sendMessageToRenderer({ messageCode: 'RESET_SUCCESSFUL' });
  } catch (error) {
    sendMessageToRenderer({ messageCode: 'RESET_FAILED' });
    logger.error(`Error occurred when resetting the app. Reloading the app now.`, { error });
  } finally {
    logger.debug(`Reloading the ${isRestartApp ? 'app' : 'renderer'}`);

    restartApp('App reset.');
    // else mainWindow.webContents.reload();
  }
}

export function toggleMiniPlayerAlwaysOnTop(isMiniPlayerAlwaysOnTop: boolean) {
  if (mainWindow) {
    if (playerType === 'mini') mainWindow.setAlwaysOnTop(isMiniPlayerAlwaysOnTop);

    saveUserSettings({ isMiniPlayerAlwaysOnTop });
  }
}

export async function getRendererLogs(
  mes: string | Error,
  data?: Record<string, unknown>,
  messageType: LogMessageTypes = 'INFO',
  forceWindowRestart = false,
  forceMainRestart = false
) {
  const message = typeof mes === 'string' ? mes : mes.message;
  const type = messageType.toLowerCase() as Lowercase<LogMessageTypes>;

  logger[type](message, { data });

  if (forceWindowRestart) return mainWindow.reload();
  if (forceMainRestart) {
    await flushPendingWritesBeforeExit(currentSongPath);
    closeAllAbortControllers();
    app.relaunch();
    return app.exit(0);
  }
  return undefined;
}

function recordWindowState(state: WindowState) {
  logger.debug(`Window state changed`, { state });

  saveUserSettings({ windowState: state });
}

export function restartRenderer() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents?.isDestroyed()) {
    mainWindow.webContents.send('app/beforeQuitEvent');
  }
  mainWindow.reload();
  if (playerType !== 'normal') {
    changePlayerType('normal');
    logger.debug('App toggled back to the main window due to an app refresh.');
  }
}

async function watchForSystemThemeChanges() {
  // This event only occurs when system theme changes
  const { useSystemTheme } = await getUserSettings();

  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  if (IS_DEVELOPMENT && useSystemTheme)
    sendMessageToRenderer({ messageCode: 'APP_THEME_CHANGE', data: { theme } });

  if (useSystemTheme) await changeAppTheme('system');
  else logger.debug(`System theme changed`, { theme });
}

function ensureWindowIsVisible(window: BrowserWindow) {
  if (!window) return;
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);

  const isOffScreen =
    bounds.x < display.bounds.x - bounds.width / 2 ||
    bounds.x > display.bounds.x + display.bounds.width - bounds.width / 2 ||
    bounds.y < display.bounds.y - bounds.height / 2 ||
    bounds.y > display.bounds.y + display.bounds.height - bounds.height / 2;

  if (isOffScreen) {
    logger.info(
      `Window is off-screen. Centering it. Bounds: ${JSON.stringify(bounds)}, Display: ${JSON.stringify(display.bounds)}`
    );
    // Center through the programmatic-move helper so this recovery move is not
    // mistaken for a user move and persisted over the user's saved position.
    const centerX = Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2);
    const centerY = Math.round(display.workArea.y + (display.workArea.height - bounds.height) / 2);
    moveWindowProgrammatically(centerX, centerY);
  }
}

export function applyMiniPlayerModeConstraints(mode: 'standard' | 'compact') {
  if (!mainWindow || playerType !== 'mini') return;
  if (mode === 'compact') {
    mainWindow.setMinimumSize(COMPACT_MINI_PLAYER_MIN_WIDTH, COMPACT_MINI_PLAYER_HEIGHT);
    mainWindow.setMaximumSize(MINI_PLAYER_MAX_SIZE_X, COMPACT_MINI_PLAYER_HEIGHT);
  } else {
    mainWindow.setMinimumSize(currentMiniPlayerMinWidth, currentMiniPlayerMinHeight);
    mainWindow.setMaximumSize(MINI_PLAYER_MAX_SIZE_X, MINI_PLAYER_MAX_SIZE_Y);
  }
}

export function setMiniPlayerMinimumBounds(minWidth: number, minHeight: number) {
  if (
    !Number.isFinite(minWidth) ||
    !Number.isFinite(minHeight) ||
    minWidth < COMPACT_MINI_PLAYER_MIN_WIDTH ||
    minHeight < COMPACT_MINI_PLAYER_HEIGHT
  ) {
    logger.warn('Ignoring invalid mini player dynamic minimum bounds', { minWidth, minHeight });
    return;
  }

  logger.debug('Updating mini player dynamic minimum bounds', {
    minWidth,
    minHeight,
    currentMiniPlayerMode
  });
  currentMiniPlayerMinWidth = minWidth;
  currentMiniPlayerMinHeight = minHeight;

  if (mainWindow && playerType === 'mini') {
    applyMiniPlayerModeConstraints(currentMiniPlayerMode);
    if (currentMiniPlayerMode === 'compact') return;

    // Current-size protection: if the window is currently smaller than the new minimum, expand smoothly
    const [currentW, currentH] = mainWindow.getSize();
    const [currentX, currentY] = mainWindow.getPosition();
    if (currentW < minWidth || (!isQueueExpanded && currentH < minHeight)) {
      const targetW = Math.max(currentW, minWidth);
      const targetH = isQueueExpanded ? currentH : Math.max(currentH, minHeight);
      setMiniPlayerBoundsProgrammatically({
        x: currentX,
        y: currentY,
        width: targetW,
        height: targetH
      });
    }
  }
}

export async function setMiniPlayerMode(mode: 'standard' | 'compact') {
  if (!mainWindow || playerType !== 'mini') return { mode };
  logger.debug('Switching mini player mode', { mode, currentMiniPlayerMode });
  currentMiniPlayerMode = mode;

  const [currentX, currentY] = mainWindow.getPosition();
  const [currentW, currentH] = mainWindow.getSize();

  // Resolve resting unexpanded origin before collapsing geometry state
  const restoreX = compactX ?? currentX;
  const restoreY = compactY ?? currentY;

  if (mode === 'compact') {
    // 1. If currently in standard mode, remember the standard height
    if (!isQueueExpanded && currentH > COMPACT_MINI_PLAYER_HEIGHT) {
      savedStandardHeight = currentH;
      await saveUserSettings({ miniPlayerHeight: currentH });
    } else if (
      isQueueExpanded &&
      compactHeight !== null &&
      compactHeight > COMPACT_MINI_PLAYER_HEIGHT
    ) {
      savedStandardHeight = compactHeight;
      await saveUserSettings({ miniPlayerHeight: compactHeight });
    }

    // 2. Collapse any open spatial extension geometry state
    isQueueExpanded = false;
    compactHeight = null;
    compactY = null;
    compactX = null;
    expandedHeight = null;
    expandedDirection = null;

    // 3. Arm programmatic guard before applying constraints or setting bounds
    setProgrammaticMoveTarget(restoreX, restoreY);

    // 4. Constrain native window size to compact constraints
    applyMiniPlayerModeConstraints('compact');

    // 5. Atomically set bounds
    const targetWidth = Math.max(currentW, COMPACT_MINI_PLAYER_MIN_WIDTH);
    setMiniPlayerBoundsProgrammatically({
      x: restoreX,
      y: restoreY,
      width: targetWidth,
      height: COMPACT_MINI_PLAYER_HEIGHT
    });
  } else {
    // Standard Mode:
    // 1. Collapse any open spatial extension geometry state
    isQueueExpanded = false;
    compactHeight = null;
    compactY = null;
    compactX = null;
    expandedHeight = null;
    expandedDirection = null;

    // 2. Restore standard height
    const targetHeight = Math.max(
      savedStandardHeight || MINI_PLAYER_DEFAULT_SIZE_Y,
      currentMiniPlayerMinHeight
    );
    const targetWidth = Math.max(currentW, currentMiniPlayerMinWidth);

    // 3. Arm programmatic guard before applying constraints or setting bounds
    setProgrammaticMoveTarget(restoreX, restoreY);

    // 4. Restore standard window constraints
    applyMiniPlayerModeConstraints('standard');

    // 5. Atomically set bounds
    setMiniPlayerBoundsProgrammatically({
      x: restoreX,
      y: restoreY,
      width: targetWidth,
      height: targetHeight
    });
  }

  await saveUserSettings({ miniPlayerMode: mode });
  return { mode };
}

function getDefaultMiniPlayerBounds(targetWidth: number, targetHeight: number) {
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const { workArea } = display;
  const margin = 24;

  return {
    x: workArea.x + workArea.width - targetWidth - margin,
    y: workArea.y + workArea.height - targetHeight - margin,
    width: targetWidth,
    height: targetHeight
  };
}

export async function resetMiniPlayerToDefault() {
  if (mainWindow && playerType === 'mini') {
    logger.debug('Resetting mini player to default position and dimensions');
    const targetWidth = Math.max(
      MINI_PLAYER_DEFAULT_SIZE_X,
      currentMiniPlayerMode === 'compact'
        ? COMPACT_MINI_PLAYER_MIN_WIDTH
        : currentMiniPlayerMinWidth
    );
    const targetHeight =
      currentMiniPlayerMode === 'compact'
        ? COMPACT_MINI_PLAYER_HEIGHT
        : Math.max(MINI_PLAYER_DEFAULT_SIZE_Y, currentMiniPlayerMinHeight);

    const defaultBounds = getDefaultMiniPlayerBounds(targetWidth, targetHeight);

    // Synchronize transition cache to default bounds so mode switches don't revert to pre-reset coordinates
    compactX = defaultBounds.x;
    compactY = defaultBounds.y;
    isQueueExpanded = false;
    compactHeight = null;
    expandedHeight = null;
    expandedDirection = null;

    setMiniPlayerBoundsProgrammatically(defaultBounds);

    if (currentMiniPlayerMode === 'compact') {
      await saveUserSettings({
        miniPlayerWidth: targetWidth,
        miniPlayerX: defaultBounds.x,
        miniPlayerY: defaultBounds.y
      });
    } else {
      savedStandardHeight = targetHeight;
      await saveUserSettings({
        miniPlayerWidth: targetWidth,
        miniPlayerHeight: targetHeight,
        miniPlayerX: defaultBounds.x,
        miniPlayerY: defaultBounds.y
      });
    }
  }
}

export async function changePlayerType(type: PlayerTypes): Promise<void> {
  const runTransition = async () => {
    if (!mainWindow) return;
    if (playerType === type) return;

    logger.debug(`Changed player type.`, { type });
    isChangingPlayerType = true;

    try {
      const {
        mainWindowHeight,
        mainWindowWidth,
        miniPlayerHeight,
        miniPlayerWidth,
        miniPlayerMode,
        mainWindowX,
        mainWindowY,
        miniPlayerX,
        miniPlayerY,
        isMiniPlayerAlwaysOnTop
      } = await getUserSettings();

      if (type === 'mini') {
        if (mainWindow.fullScreen) mainWindow.setFullScreen(false);

        currentMiniPlayerMode = miniPlayerMode || 'standard';
        savedStandardHeight = miniPlayerHeight || MINI_PLAYER_DEFAULT_SIZE_Y;

        mainWindow.setMaximizable(false);
        mainWindow.setAlwaysOnTop(isMiniPlayerAlwaysOnTop);

        let targetWidth = miniPlayerWidth
          ? Math.max(miniPlayerWidth, currentMiniPlayerMinWidth)
          : MINI_PLAYER_DEFAULT_SIZE_X;

        let targetHeight: number;
        if (currentMiniPlayerMode === 'compact') {
          targetWidth = Math.max(targetWidth, COMPACT_MINI_PLAYER_MIN_WIDTH);
          targetHeight = COMPACT_MINI_PLAYER_HEIGHT;
          mainWindow.setMinimumSize(COMPACT_MINI_PLAYER_MIN_WIDTH, COMPACT_MINI_PLAYER_HEIGHT);
          mainWindow.setMaximumSize(MINI_PLAYER_MAX_SIZE_X, COMPACT_MINI_PLAYER_HEIGHT);
        } else {
          targetHeight = Math.max(savedStandardHeight, currentMiniPlayerMinHeight);
          mainWindow.setMaximumSize(MINI_PLAYER_MAX_SIZE_X, MINI_PLAYER_MAX_SIZE_Y);
          mainWindow.setMinimumSize(currentMiniPlayerMinWidth, currentMiniPlayerMinHeight);
        }

        mainWindow.setSize(targetWidth, targetHeight, true);

        // Reset queue expansion state when switching to mini player
        isQueueExpanded = false;
        compactHeight = null;
        compactY = null;
        compactX = null;
        expandedHeight = null;
        expandedDirection = null;
        clearProgrammaticMoveTarget();

        if (isValidPersistedPosition(miniPlayerX, miniPlayerY, targetWidth, targetHeight)) {
          moveWindowProgrammatically(miniPlayerX as number, miniPlayerY as number, true);
          ensureWindowIsVisible(mainWindow);
        } else {
          // First launch, or the saved position was corrupted/off-screen (e.g. the
          // Windows minimized-position leak or a disconnected monitor): restore to
          // the smart bottom-right anchor and heal the persisted values.
          if (miniPlayerX !== null && miniPlayerY !== null) {
            logger.warn('Saved mini player position is invalid. Restoring to default.', {
              miniPlayerX,
              miniPlayerY
            });
          }
          // Smart bottom-right screen anchoring on first launch
          const defaultBounds = getDefaultMiniPlayerBounds(targetWidth, targetHeight);
          compactX = defaultBounds.x;
          compactY = defaultBounds.y;
          moveWindowProgrammatically(defaultBounds.x, defaultBounds.y, true);
          await saveUserSettings({ miniPlayerX: defaultBounds.x, miniPlayerY: defaultBounds.y }).catch(
            (error) => logger.error('Failed to persist default mini player position', { error })
          );
        }
        mainWindow.setAspectRatio(MINI_PLAYER_ASPECT_RATIO);
        playerType = 'mini';
      } else if (type === 'normal') {
        mainWindow.setMaximizable(true);
        mainWindow.setMaximumSize(MAIN_WINDOW_MAX_SIZE_X, MAIN_WINDOW_MAX_SIZE_Y);
        mainWindow.setMinimumSize(MAIN_WINDOW_MIN_SIZE_X, MAIN_WINDOW_MIN_SIZE_Y);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setFullScreen(false);

        const normalTargetWidth = mainWindowWidth || MAIN_WINDOW_DEFAULT_SIZE_X;
        const normalTargetHeight = mainWindowHeight || MAIN_WINDOW_DEFAULT_SIZE_Y;

        if (mainWindowWidth !== null && mainWindowHeight !== null) {
          mainWindow.setSize(normalTargetWidth, normalTargetHeight, true);
        } else mainWindow.setSize(MAIN_WINDOW_DEFAULT_SIZE_X, MAIN_WINDOW_DEFAULT_SIZE_Y, true);

        if (
          isValidPersistedPosition(
            mainWindowX,
            mainWindowY,
            normalTargetWidth,
            normalTargetHeight
          )
        ) {
          moveWindowProgrammatically(mainWindowX as number, mainWindowY as number, true);
          ensureWindowIsVisible(mainWindow);
        } else {
          if (mainWindowX !== null && mainWindowY !== null) {
            logger.warn('Saved main window position is invalid. Restoring to default.', {
              mainWindowX,
              mainWindowY
            });
          }
          mainWindow.center();
          const [x, y] = mainWindow.getPosition();
          await saveUserSettings({ mainWindowX: x, mainWindowY: y }).catch((error) =>
            logger.error('Failed to persist default main window position', { error })
          );
        }
        mainWindow.setAspectRatio(MAIN_WINDOW_ASPECT_RATIO);
        playerType = 'normal';
      } else {
        mainWindow.setMaximumSize(MAIN_WINDOW_MAX_SIZE_X, MAIN_WINDOW_MAX_SIZE_Y);
        mainWindow.setMinimumSize(MAIN_WINDOW_MIN_SIZE_X, MAIN_WINDOW_MIN_SIZE_Y);
        mainWindow.setFullScreen(true);
        playerType = type;
      }
    } finally {
      isChangingPlayerType = false;
    }
  };

  playerTypeTransitionPromise = playerTypeTransitionPromise.then(runTransition, runTransition);
  return playerTypeTransitionPromise;
}

export function expandMiniPlayer(
  isExpanded: boolean,
  queueItemCount = 0,
  customExtensionHeight?: number
) {
  if (!mainWindow || playerType !== 'mini')
    return { isExpanded: false, direction: 'down' as const };

  const [width, currentHeight] = mainWindow.getSize();
  const [currentX, currentY] = mainWindow.getPosition();

  if (isExpanded) {
    // Save the compact dimensions before expanding
    if (!isQueueExpanded || compactHeight === null || compactY === null) {
      compactHeight = currentHeight;
      compactY = currentY;
      compactX = currentX;
      isQueueExpanded = true;
    }
    const baseHeight = compactHeight;
    const baseY = compactY;

    // Calculate needed panel height (either custom extension e.g. lyrics, or queue based on item count)
    const panelHeight =
      customExtensionHeight ??
      Math.min(Math.max(queueItemCount, 1), QUEUE_MAX_VISIBLE_ITEMS) * QUEUE_ITEM_HEIGHT +
        QUEUE_HEADER_HEIGHT;
    const totalHeight = baseHeight + panelHeight;

    // Determine available screen space using compact boundaries
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const workArea = display.workArea;
    const spaceBelow = workArea.y + workArea.height - (baseY + baseHeight);
    const spaceAbove = baseY - workArea.y;

    // Decide direction: pick whichever direction can show MORE of the panel.
    // Default to down only when both directions can fully fit.
    let calculatedExpandedHeight: number;
    let calculatedExpandedY = baseY;
    let direction: 'down' | 'up' = 'down';

    const canFitFullDown = spaceBelow >= panelHeight;
    const canFitFullUp = spaceAbove >= panelHeight;

    if (canFitFullDown) {
      // Full fit downwards — ideal default
      calculatedExpandedHeight = totalHeight;
      direction = 'down';
    } else if (canFitFullUp) {
      // Full fit upwards
      calculatedExpandedHeight = totalHeight;
      direction = 'up';
    } else {
      // Neither can fully fit — pick whichever direction has MORE room
      direction = spaceBelow >= spaceAbove ? 'down' : 'up';
      const availableSpace = direction === 'down' ? spaceBelow : spaceAbove;
      calculatedExpandedHeight = baseHeight + availableSpace;
    }

    if (direction === 'up') {
      calculatedExpandedY = baseY - (calculatedExpandedHeight - baseHeight);
    }

    expandedHeight = calculatedExpandedHeight;
    expandedDirection = direction;

    logger.debug('Expanding mini player spatial extension', {
      queueItemCount,
      customExtensionHeight,
      direction,
      compactHeight: baseHeight,
      expandedHeight: calculatedExpandedHeight,
      spaceBelow,
      spaceAbove
    });

    // Temporarily allow larger max height for expansion
    setProgrammaticMoveTarget(compactX ?? currentX, calculatedExpandedY);
    mainWindow.setMaximumSize(MINI_PLAYER_MAX_SIZE_X, calculatedExpandedHeight);
    setMiniPlayerBoundsProgrammatically({
      x: compactX ?? currentX,
      y: calculatedExpandedY,
      width,
      height: calculatedExpandedHeight
    });

    return { isExpanded: true, direction, height: calculatedExpandedHeight };
  } else {
    // Collapse back to compact size
    isQueueExpanded = false;

    const restoreHeight =
      compactHeight ??
      (currentMiniPlayerMode === 'compact'
        ? COMPACT_MINI_PLAYER_HEIGHT
        : currentMiniPlayerMinHeight);
    const restoreY = compactY ?? currentY;
    const restoreX = compactX ?? currentX;

    logger.debug('Collapsing mini player extension', {
      restoreHeight,
      restoreY,
      restoreX,
      currentMiniPlayerMode
    });

    setProgrammaticMoveTarget(restoreX, restoreY);
    applyMiniPlayerModeConstraints(currentMiniPlayerMode);
    setMiniPlayerBoundsProgrammatically({
      x: restoreX,
      y: restoreY,
      width,
      height: restoreHeight
    });

    compactHeight = null;
    compactY = null;
    compactX = null;
    expandedHeight = null;
    expandedDirection = null;
    return { isExpanded: false, direction: 'down' as const, height: restoreHeight };
  }
}

function manageWindowOnDisplayMetricsChange() {
  if (!mainWindow || mainWindow.isDestroyed() || isChangingPlayerType) return;

  const bounds = mainWindow.getBounds();
  if (isRectOnAnyDisplay(bounds)) return;

  // The window is stranded off-screen (display disconnected, resolution change, etc.).
  // Restore it to a visible position instead of leaving it stranded, and persist the
  // recovered position so the corruption does not repeat on every launch.
  logger.info('Window is stranded off-screen after a display change. Restoring position.', {
    bounds
  });

  if (playerType === 'mini') {
    const [width, height] = mainWindow.getSize();
    const defaultBounds = getDefaultMiniPlayerBounds(width, height);
    compactX = defaultBounds.x;
    compactY = defaultBounds.y;
    moveWindowProgrammatically(defaultBounds.x, defaultBounds.y);
    saveUserSettings({ miniPlayerX: defaultBounds.x, miniPlayerY: defaultBounds.y }).catch(
      (error) => logger.error('Failed to persist recovered mini player position', { error })
    );
  } else {
    ensureWindowIsVisible(mainWindow);
    const [x, y] = mainWindow.getPosition();
    saveUserSettings({ mainWindowX: x, mainWindowY: y }).catch((error) =>
      logger.error('Failed to persist recovered main window position', { error })
    );
  }
}

function manageWindowPositionInMonitor() {
  manageWindowOnDisplayMetricsChange();

  // Event listeners for display change events
  screen.on('display-metrics-changed', () => manageWindowOnDisplayMetricsChange());
  screen.on('display-removed', () => manageWindowOnDisplayMetricsChange());
  screen.on('display-added', () => manageWindowOnDisplayMetricsChange());
}

export async function toggleAutoLaunch(autoLaunchState: boolean) {
  const options = app.getLoginItemSettings();
  const { openWindowAsHiddenOnSystemStart } = await getUserSettings();

  logger.debug(`Auto launch state changed`, { openAtLogin: options.openAtLogin });

  app.setLoginItemSettings({
    openAtLogin: autoLaunchState,
    name: 'Nora',
    openAsHidden: openWindowAsHiddenOnSystemStart
  });

  await saveUserSettings({ openWindowAsHiddenOnSystemStart });
}

export const checkIfConnectedToInternet = () => net.isOnline();

export function allowScreenSleeping() {
  logger.debug('Requested to allow screen sleeping.');
  if (powerSaveBlockerId) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
}

export function stopScreenSleeping() {
  allowScreenSleeping();
  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  logger.debug('Screen sleeping prevented.', { powerSaveBlockerId });
}
