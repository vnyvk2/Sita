import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import { closeAllAbortControllers } from '@main/fs/controlAbortControllers';
import { initializePassiveWatchers } from '@main/fs/initializePassiveWatchers';
import logger from '@main/logger';

import libraryScanner, {
  type LibraryScanner,
  type ScanOptions,
  type ScanSummary,
  type ScannerState
} from './LibraryScanner';

export type LibraryScanMode = 'automatic' | 'startup' | 'manual';

export class LibraryLifecycleController {
  private static instance: LibraryLifecycleController;
  private scanner: LibraryScanner;
  private watchersActive = false;
  private isInitialized = false;
  private currentMode: LibraryScanMode = 'automatic';
  private inFlightScan: Promise<ScanSummary> | null = null;

  constructor(scanner: LibraryScanner = libraryScanner) {
    this.scanner = scanner;
  }

  public static getInstance(): LibraryLifecycleController {
    if (!this.instance) {
      this.instance = new LibraryLifecycleController();
    }
    return this.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('[LibraryLifecycleController] Already initialized. Skipping.');
      return;
    }
    this.isInitialized = true;

    try {
      const settings = await getUserSettings();
      const mode: LibraryScanMode = (settings?.libraryScanMode as LibraryScanMode) || 'automatic';
      this.currentMode = mode;
      logger.info(`[LibraryLifecycleController] Initializing with mode: ${mode}`);

      await this.applyPolicy(mode, true);
    } catch (error) {
      logger.error('[LibraryLifecycleController] Failed to load settings on startup:', { error });
      this.currentMode = 'automatic';
      await this.applyPolicy('automatic', true);
    }
  }

  public async setScanMode(mode: LibraryScanMode): Promise<void> {
    if (this.currentMode === mode && this.isInitialized) {
      logger.debug(
        `[LibraryLifecycleController] Mode already set to ${mode}. No transition needed.`
      );
      return;
    }

    const previousMode = this.currentMode;
    logger.info(
      `[LibraryLifecycleController] Transitioning scan mode from ${previousMode} to: ${mode}`
    );

    try {
      // 1. Apply runtime policy transition first
      await this.applyPolicy(mode, false);

      // 2. Persist to database only if runtime policy transition succeeded
      await saveUserSettings({ libraryScanMode: mode });
      this.currentMode = mode;
    } catch (error) {
      logger.error(
        `[LibraryLifecycleController] Failed to transition to mode '${mode}', rolling back to '${previousMode}':`,
        { error }
      );
      // Rollback runtime policy to previous state
      try {
        await this.applyPolicy(previousMode, false);
      } catch (rollbackError) {
        logger.error('[LibraryLifecycleController] Rollback failed:', { rollbackError });
      }
      throw error;
    }
  }

  public getScanMode(): LibraryScanMode {
    return this.currentMode;
  }

  public canAttachWatchers(): boolean {
    return this.currentMode === 'automatic';
  }

  private async applyPolicy(mode: LibraryScanMode, isStartup: boolean): Promise<void> {
    switch (mode) {
      case 'automatic': {
        await this.startWatchers();
        if (isStartup) {
          this.triggerBackgroundScan();
        }
        break;
      }
      case 'startup': {
        this.stopWatchers();
        if (isStartup) {
          this.triggerBackgroundScan();
        }
        break;
      }
      case 'manual': {
        this.stopWatchers();
        break;
      }
    }
  }

  public async startWatchers(): Promise<void> {
    if (this.watchersActive) {
      logger.debug('[LibraryLifecycleController] Watchers are already active.');
      return;
    }
    logger.info('[LibraryLifecycleController] Starting background folder watchers.');
    try {
      await initializePassiveWatchers();
      this.watchersActive = true;
    } catch (error) {
      logger.error('[LibraryLifecycleController] Failed to start background folder watchers:', {
        error
      });
      this.watchersActive = false;
      throw error;
    }
  }

  public stopWatchers(): void {
    logger.info('[LibraryLifecycleController] Stopping background folder watchers.');
    this.watchersActive = false;
    try {
      closeAllAbortControllers();
    } catch (error) {
      logger.error('[LibraryLifecycleController] Error stopping background folder watchers:', {
        error
      });
    }
  }

  public areWatchersActive(): boolean {
    return this.watchersActive;
  }

  private triggerBackgroundScan(): void {
    this.scanNow().catch((error) => {
      logger.error('[LibraryLifecycleController] Startup background scan failed:', { error });
    });
  }

  public scanNow(options?: ScanOptions): Promise<ScanSummary> {
    if (this.inFlightScan) {
      logger.info(
        '[LibraryLifecycleController] Scan already in-flight, returning existing promise.'
      );
      return this.inFlightScan;
    }

    logger.info('[LibraryLifecycleController] Scan requested.');
    this.inFlightScan = this.scanner
      .scan(options)
      .then(async (summary) => {
        if (summary.status === 'COMPLETED') {
          await this.recordScanSuccess();
        }
        return summary;
      })
      .finally(() => {
        this.inFlightScan = null;
      });

    return this.inFlightScan;
  }

  public async cancelScan(): Promise<boolean> {
    logger.info('[LibraryLifecycleController] Scan cancellation requested.');
    return this.scanner.cancelScan();
  }

  public getStatus(): ScannerState {
    return this.scanner.getState();
  }

  private async recordScanSuccess(): Promise<void> {
    try {
      const now = new Date();
      await saveUserSettings({ lastScanTime: now });
      logger.info('[LibraryLifecycleController] Recorded lastScanTime in user_settings', { now });
    } catch (error) {
      logger.warn('[LibraryLifecycleController] Failed to record lastScanTime:', { error });
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('[LibraryLifecycleController] Shutting down lifecycle controller.');
    this.stopWatchers();
    await this.cancelScan();
    this.isInitialized = false;
  }
}

export const libraryLifecycleController = LibraryLifecycleController.getInstance();
export default libraryLifecycleController;
