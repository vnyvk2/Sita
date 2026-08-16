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
      logger.info(`[LibraryLifecycleController] Initializing with mode: ${mode}`);

      await this.applyPolicy(mode, true);
    } catch (error) {
      logger.error('[LibraryLifecycleController] Failed to load settings on startup:', { error });
      // Fallback to automatic policy safely
      await this.applyPolicy('automatic', true);
    }
  }

  public async setScanMode(mode: LibraryScanMode): Promise<void> {
    logger.info(`[LibraryLifecycleController] Transitioning scan mode to: ${mode}`);
    await saveUserSettings({ libraryScanMode: mode });
    await this.applyPolicy(mode, false);
  }

  private async applyPolicy(mode: LibraryScanMode, isStartup: boolean): Promise<void> {
    switch (mode) {
      case 'automatic': {
        this.startWatchers();
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

  public startWatchers(): void {
    if (this.watchersActive) {
      logger.debug('[LibraryLifecycleController] Watchers are already active.');
      return;
    }
    logger.info('[LibraryLifecycleController] Starting background folder watchers.');
    this.watchersActive = true;
    void initializePassiveWatchers();
  }

  public stopWatchers(): void {
    if (!this.watchersActive) {
      logger.debug('[LibraryLifecycleController] Watchers are already inactive.');
      return;
    }
    logger.info('[LibraryLifecycleController] Stopping background folder watchers.');
    this.watchersActive = false;
    closeAllAbortControllers();
  }

  public areWatchersActive(): boolean {
    return this.watchersActive;
  }

  private triggerBackgroundScan(): void {
    this.scanNow().catch((error) => {
      logger.error('[LibraryLifecycleController] Startup background scan failed:', { error });
    });
  }

  public async scanNow(options?: ScanOptions): Promise<ScanSummary> {
    logger.info('[LibraryLifecycleController] Scan requested.');
    const summary = await this.scanner.scan(options);
    if (summary.status === 'COMPLETED') {
      await this.recordScanSuccess();
    }
    return summary;
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
