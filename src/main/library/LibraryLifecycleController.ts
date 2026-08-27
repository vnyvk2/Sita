import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import { closeAllAbortControllers } from '@main/fs/controlAbortControllers';
import { initializePassiveWatchers } from '@main/fs/initializePassiveWatchers';
import libraryChangeTracker, {
  type ChangeEntry,
  type LibraryChangeState
} from '@main/library/LibraryChangeTracker';
import logger from '@main/logger';

import libraryScanner, {
  type LibraryScanner,
  type ScanOptions,
  type ScanSummary
} from './LibraryScanner';

export type LibraryScanMode = 'automatic' | 'startup' | 'manual';

export class LibraryLifecycleController {
  private static instance: LibraryLifecycleController;
  private scanner: LibraryScanner;
  private watchersActive = false;
  private isInitialized = false;
  private isShuttingDown = false;
  private currentMode: LibraryScanMode = 'automatic';
  private inFlightScan: Promise<ScanSummary> | null = null;
  private changeGeneration = 0;
  private changeDebounceTimer: NodeJS.Timeout | null = null;
  private readonly changeDebounceMs = 2000;

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
    this.isShuttingDown = false;
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
    if (this.isShuttingDown) {
      throw new Error(
        '[LibraryLifecycleController] Cannot set scan mode: controller is shutting down.'
      );
    }

    if (this.currentMode === mode) {
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
        logger.error(
          '[LibraryLifecycleController] Rollback failed; forcing watchers stopped and marking degraded:',
          { rollbackError }
        );
        this.stopWatchers();
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
      this.attachChangeTrackerListener();
    } catch (error) {
      logger.error('[LibraryLifecycleController] Failed to start background folder watchers:', {
        error
      });
      this.watchersActive = false;
      this.detachChangeTrackerListener();
      throw error;
    }
  }

  public stopWatchers(): void {
    logger.info('[LibraryLifecycleController] Stopping background folder watchers.');
    this.watchersActive = false;
    this.detachChangeTrackerListener();
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

  private onLibraryChanged = (event?: {
    state?: LibraryChangeState;
    entry?: ChangeEntry | null;
  }): void => {
    if (!this.canAttachWatchers()) {
      return;
    }

    // Ignore internal scanner bookkeeping events (markDirty without entry, reset)
    // Only real filesystem watcher events carrying a ChangeEntry increment changeGeneration
    if (!event?.entry) {
      return;
    }

    this.changeGeneration += 1;

    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
    }

    logger.debug(
      `[LibraryLifecycleController] Filesystem change detected (generation ${this.changeGeneration}, source: ${event.entry.source}, path: '${event.entry.path}'), scheduling background scan...`
    );

    this.changeDebounceTimer = setTimeout(() => {
      this.changeDebounceTimer = null;
      if (!this.canAttachWatchers()) {
        return;
      }

      if (this.inFlightScan) {
        logger.debug(
          '[LibraryLifecycleController] Scan currently in flight; generation tracking will schedule follow-up on completion.'
        );
        return;
      }

      logger.info(
        '[LibraryLifecycleController] Executing debounced background scan for live filesystem changes.'
      );
      this.scanNow().catch((error) => {
        logger.error('[LibraryLifecycleController] Debounced live change scan failed:', {
          error
        });
      });
    }, this.changeDebounceMs);
  };

  private attachChangeTrackerListener(): void {
    libraryChangeTracker.off('changed', this.onLibraryChanged);
    libraryChangeTracker.on('changed', this.onLibraryChanged);
  }

  private detachChangeTrackerListener(): void {
    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
      this.changeDebounceTimer = null;
    }
    libraryChangeTracker.off('changed', this.onLibraryChanged);
  }

  private triggerBackgroundScan(): void {
    this.scanNow().catch((error) => {
      logger.error('[LibraryLifecycleController] Startup background scan failed:', { error });
    });
  }

  public async scanNow(options?: ScanOptions): Promise<ScanSummary> {
    if (this.isShuttingDown) {
      logger.warn(
        '[LibraryLifecycleController] scanNow rejected: controller is shutting down.'
      );
      return {
        status: 'CANCELLED',
        added: 0,
        modified: 0,
        removed: 0,
        unchanged: 0,
        skippedRoots: [],
        durationMs: 0
      };
    }

    if (this.inFlightScan) {
      logger.info(
        '[LibraryLifecycleController] Scan already in-flight, returning existing promise.'
      );
      return this.inFlightScan;
    }

    // Capture the current change generation at scan snapshot start
    const scanGeneration = this.changeGeneration;

    // Clear any pending debounce timer as this scan will cover all changes up to scanGeneration
    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
      this.changeDebounceTimer = null;
    }

    logger.info(`[LibraryLifecycleController] Scan requested (generation ${scanGeneration}).`);
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

        // If filesystem changes arrived after this scan's starting generation, schedule a follow-up scan
        if (
          this.changeGeneration !== scanGeneration &&
          this.canAttachWatchers() &&
          this.isInitialized &&
          !this.isShuttingDown
        ) {
          logger.info(
            `[LibraryLifecycleController] Changes observed during scan (generation ${this.changeGeneration} !== ${scanGeneration}); triggering follow-up scan.`
          );
          this.scheduleFollowUpScan();
        }
      });

    return this.inFlightScan;
  }

  private scheduleFollowUpScan(): void {
    if (!this.canAttachWatchers() || !this.isInitialized || this.isShuttingDown) {
      return;
    }

    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
    }

    this.changeDebounceTimer = setTimeout(() => {
      this.changeDebounceTimer = null;
      if (this.canAttachWatchers() && !this.inFlightScan && this.isInitialized && !this.isShuttingDown) {
        this.scanNow().catch((error) => {
          logger.error('[LibraryLifecycleController] Follow-up background scan failed:', { error });
        });
      }
    }, this.changeDebounceMs);
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
    this.isShuttingDown = true;
    this.isInitialized = false;
    this.stopWatchers();
    this.cancelScan();

    if (this.inFlightScan) {
      try {
        await this.inFlightScan;
      } catch (error) {
        logger.debug(
          '[LibraryLifecycleController] In-flight scan error during shutdown unwinding:',
          { error }
        );
      }
    }
  }
}

export const libraryLifecycleController = LibraryLifecycleController.getInstance();
export default libraryLifecycleController;
