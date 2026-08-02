import { closeDatabaseInstance } from '@main/db/db';
import { closeAllAbortControllers } from '@main/fs/controlAbortControllers';
import logger from '@main/logger';
import { clearTempArtworkFolder } from '@main/other/artworks';
import { clearDiscordRpcActivity } from '@main/other/discordRPC';
import { savePendingSongLyrics } from '@main/saveLyricsToSong';
import { savePendingMetadataUpdates } from '@main/updateSong/updateSongId3Tags';
import { adaptivePolicyEngine } from '@main/workers/adaptivePolicyEngine';
import { libraryScheduler } from '@main/workers/jobScheduler';
import type { BrowserWindow } from 'electron';

import { ShutdownLogger } from './ShutdownLogger';
import { ShutdownState } from './ShutdownState';

export class ShutdownCoordinator {
  private static shutdownPromise: Promise<void> | null = null;

  public static shutdown(
    source: string,
    mainWindow?: BrowserWindow,
    currentSongPath?: string
  ): Promise<void> {
    if (this.shutdownPromise) {
      ShutdownLogger.logEventObservation(`ShutdownCoordinator.shutdown[re-entry]`, {
        source,
        reason: 'Returning existing in-flight shutdown promise'
      });
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.executeShutdown(source, mainWindow, currentSongPath);
    return this.shutdownPromise;
  }

  private static async executeShutdown(
    source: string,
    mainWindow?: BrowserWindow,
    currentSongPath?: string
  ): Promise<void> {
    let hasPartialFailures = false;
    ShutdownLogger.logShutdownTransition(ShutdownState.Started, source);

    // 1. Stop schedulers & background engines
    ShutdownLogger.logShutdownTransition(ShutdownState.StoppingSchedulers, source);
    try {
      await libraryScheduler.stop();
      adaptivePolicyEngine.stop();
    } catch (error) {
      hasPartialFailures = true;
      logger.error('Error stopping schedulers during shutdown:', { error });
    }

    // 2. Save pending state
    ShutdownLogger.logShutdownTransition(ShutdownState.SavingState, source);
    try {
      try {
        await clearDiscordRpcActivity();
      } catch (error) {
        hasPartialFailures = true;
        logger.error('Optional cleanup functions failed when quitting the app.', { error });
      }

      const p1 = savePendingSongLyrics(currentSongPath, true);
      const p2 = savePendingMetadataUpdates(currentSongPath, true);
      const p3 = closeAllAbortControllers();
      const p4 = clearTempArtworkFolder();

      await Promise.all([p1, p2, p3, p4]);
    } catch (error) {
      hasPartialFailures = true;
      logger.error('Error saving state during shutdown:', { error });
    }

    // 3. Best-effort renderer notification
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('app/beforeQuitEvent');
      } catch (error) {
        logger.warn('Could not send app/beforeQuitEvent to renderer (best-effort):', { error });
      }
    }

    // 4. Guaranteed Database Teardown
    ShutdownLogger.logShutdownTransition(ShutdownState.ClosingDatabase, source);
    try {
      await closeDatabaseInstance();
      ShutdownLogger.logShutdownTransition(ShutdownState.DatabaseClosed, source);
    } catch (error) {
      hasPartialFailures = true;
      logger.error('Error closing database instance during shutdown:', { error });
    }

    // 5. Final State Transition
    if (hasPartialFailures) {
      ShutdownLogger.logShutdownTransition(ShutdownState.FinishedFailed, source, {
        warning: 'Shutdown completed with partial cleanup errors'
      });
    } else {
      ShutdownLogger.logShutdownTransition(ShutdownState.FinishedSuccess, source);
    }
  }

  public static isShuttingDown(): boolean {
    return this.shutdownPromise !== null;
  }

  public static resetStateForTesting(): void {
    this.shutdownPromise = null;
    ShutdownLogger.resetStateForTesting();
  }
}

export default ShutdownCoordinator;
