import type { WebContents } from 'electron';

import logger from '../logger';

interface RenderProcessGoneDetails {
  reason: string;
  exitCode: number;
}

export interface RendererRecoveryDeps {
  /**
   * Returns the playerType ('normal' | 'mini' | 'full') that Main currently believes the renderer
   * is presenting. MUST be read BEFORE reloading, since it represents the pre-crash presentation
   * state.
   */
  getPlayerType: () => 'normal' | 'mini' | 'full';
  /**
   * Invoked exactly once after a crash-triggered reload finishes loading. Receives the pre-crash
   * playerType captured at crash time. Implementations may use this to re-assert presentation
   * state; it is safe for this to be a verification-only hook when presentation self-restores (e.g.
   * hash-routed renderer + unchanged window geometry).
   */
  onRecovered?: (preCrashPlayerType: 'normal' | 'mini' | 'full') => void;
  /**
   * Invoked when crashes exceed the recovery budget within the rate-limit window (crash-loop
   * guard). No reload is performed in that case.
   */
  onRecoveryLimitExceeded?: (details: { reason: string; exitCode: number }) => void;
}

export interface RendererRecoveryOptions {
  /** Maximum recoveries allowed within `windowMs`. Default: 3 */
  maxRecoveries?: number;
  /** Rolling rate-limit window in milliseconds. Default: 60_000 */
  windowMs?: number;
  /**
   * Delay before reloading, in milliseconds. Calling webContents.reload() synchronously inside
   * 'render-process-gone' takes down the whole process tree (verified empirically); the reload must
   * wait until Chromium has finished tearing down the dead renderer. Default: 250
   */
  reloadDelayMs?: number;
  /**
   * How long a recovered renderer must stay loaded before the crash budget resets. Resetting on
   * load completion alone would let a rapid boot-crash loop (load → crash → load → crash) evade the
   * guard forever. Default: 30_000
   */
  healthyMs?: number;
}

interface PendingRecovery {
  /**
   * Monotonic token identifying the most recent crash. Stale tokens are overwritten, never queued,
   * so only the latest crash can trigger a post-load restore — overlapping crashes cannot produce
   * fighting callbacks.
   */
  generation: number;
  preCrashPlayerType: 'normal' | 'mini' | 'full';
}

const DEFAULT_MAX_RECOVERIES = 3;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_HEALTHY_MS = 30_000;
const DEFAULT_RELOAD_DELAY_MS = 250;

/**
 * Attaches generic renderer crash recovery to a BrowserWindow's webContents.
 *
 * Invariant established here (Phase 1A): any renderer presentation mode can crash and recover
 * without corrupting persisted state or silently forcing Normal mode. This module contains no
 * Tiny/mini-specific logic.
 */
export function attachRendererRecovery(
  webContents: WebContents,
  deps: RendererRecoveryDeps,
  options: RendererRecoveryOptions = {}
): () => void {
  const maxRecoveries = options.maxRecoveries ?? DEFAULT_MAX_RECOVERIES;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const healthyMs = options.healthyMs ?? DEFAULT_HEALTHY_MS;
  const reloadDelayMs = options.reloadDelayMs ?? DEFAULT_RELOAD_DELAY_MS;

  /** Timestamps of recent crash-triggered reloads (rolling rate-limit window). */
  let recoveryTimestamps: number[] = [];
  /** The single pending recovery slot. Overwritten by newer crashes. */
  let pendingRecovery: PendingRecovery | null = null;
  let nextGeneration = 0;
  /** Pending budget-reset timer; only fires if the renderer stays healthy. */
  let healthResetTimer: ReturnType<typeof setTimeout> | null = null;

  const handleRenderProcessGone = (_: unknown, details: RenderProcessGoneDetails) => {
    if (details.reason === 'clean-exit') {
      logger.debug('Renderer exited cleanly. No recovery needed.', {
        reason: details.reason,
        exitCode: details.exitCode
      });
      return;
    }

    logger.error('Renderer process gone. Initiating recovery.', {
      reason: details.reason,
      exitCode: details.exitCode
    });

    // The renderer crashed again before proving stability, so any pending
    // budget reset from a previous recovery is cancelled.
    if (healthResetTimer) {
      clearTimeout(healthResetTimer);
      healthResetTimer = null;
    }

    // Capture the pre-crash presentation state BEFORE reloading. Reading it
    // after reload would not represent the previous presentation state.
    const preCrashPlayerType = deps.getPlayerType();

    const now = Date.now();
    recoveryTimestamps = recoveryTimestamps.filter((timestamp) => now - timestamp < windowMs);

    if (recoveryTimestamps.length >= maxRecoveries) {
      logger.error(
        `Renderer crashed ${recoveryTimestamps.length} times within ${windowMs}ms. ` +
          'Recovery budget exhausted; refusing to reload again.',
        { reason: details.reason, exitCode: details.exitCode }
      );
      deps.onRecoveryLimitExceeded?.({
        reason: details.reason,
        exitCode: details.exitCode
      });
      return;
    }

    recoveryTimestamps.push(now);
    pendingRecovery = {
      generation: ++nextGeneration,
      preCrashPlayerType
    };

    // Deferred: a synchronous reload here kills the whole process tree.
    setTimeout(() => {
      if (!webContents.isDestroyed()) webContents.reload();
    }, reloadDelayMs);
  };

  const handleDidFinishLoad = () => {
    if (!pendingRecovery) return;

    // Consume the single pending slot. If multiple crashes overlapped, only
    // the latest generation's capture survives — stale generations were
    // overwritten, so no stale restore callbacks can fire.
    const { preCrashPlayerType } = pendingRecovery;
    pendingRecovery = null;

    logger.info('Renderer recovered after crash. Restoring presentation state.', {
      preCrashPlayerType
    });
    deps.onRecovered?.(preCrashPlayerType);

    // Reset the rolling crash budget only once the renderer has proven
    // stable for `healthyMs`; a crash before that keeps the budget spent.
    healthResetTimer = setTimeout(() => {
      healthResetTimer = null;
      recoveryTimestamps = [];
    }, healthyMs);
  };

  webContents.on('render-process-gone', handleRenderProcessGone);
  webContents.on('did-finish-load', handleDidFinishLoad);

  return () => {
    if (healthResetTimer) {
      clearTimeout(healthResetTimer);
      healthResetTimer = null;
    }
    webContents.removeListener('render-process-gone', handleRenderProcessGone);
    webContents.removeListener('did-finish-load', handleDidFinishLoad);
  };
}
