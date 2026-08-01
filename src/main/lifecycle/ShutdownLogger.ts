import logger from '@main/logger';

import { ShutdownState } from './ShutdownState';

let bootSessionCounter = 0;
let shutdownSessionCounter = 0;

let currentBootSessionId: string | null = null;
let currentShutdownSessionId: string | null = null;
let shutdownStartTime: number | null = null;
let currentShutdownState: ShutdownState = ShutdownState.Idle;

export class ShutdownLogger {
  public static logBootMilestone(milestone: string, details?: Record<string, unknown>): string {
    if (!currentBootSessionId) {
      bootSessionCounter += 1;
      currentBootSessionId = `Boot #${bootSessionCounter}`;
    }

    const timestamp = new Date().toISOString();
    logger.info(`[${currentBootSessionId}][${timestamp}] Boot Milestone: ${milestone}`, {
      category: 'lifecycle',
      ...(details || {})
    });
    return currentBootSessionId;
  }

  public static logShutdownTransition(state: ShutdownState, source?: string): string {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();

    if (state === ShutdownState.Started) {
      shutdownSessionCounter += 1;
      currentShutdownSessionId = `Shutdown #${shutdownSessionCounter}`;
      shutdownStartTime = now;
    }

    if (!currentShutdownSessionId) {
      // Transition called before Started state session initialization
      logger.warn(
        `[Pre-Shutdown][${timestamp}] State transition to ${state} without active Started session (source: ${source || 'unknown'})`,
        { category: 'lifecycle' }
      );
      return 'uninitialized';
    }

    currentShutdownState = state;
    const durationMs = shutdownStartTime ? now - shutdownStartTime : 0;

    logger.info(
      `[${currentShutdownSessionId}][${timestamp}] Shutdown State: ${state} (source: ${source || 'unknown'}, elapsed: ${durationMs}ms)`,
      { category: 'lifecycle' }
    );

    return currentShutdownSessionId;
  }

  public static logEventObservation(eventName: string, details?: Record<string, unknown>): void {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const sessionId = currentShutdownSessionId || 'Pre-Shutdown';
    const elapsedMs = shutdownStartTime ? now - shutdownStartTime : 0;

    logger.info(
      `[${sessionId}][${timestamp}] Observed Lifecycle Event: ${eventName} (elapsed: ${elapsedMs}ms)`,
      { category: 'lifecycle', ...(details || {}) }
    );
  }

  public static getCurrentShutdownState(): ShutdownState {
    return currentShutdownState;
  }

  public static getCurrentBootSessionId(): string | null {
    return currentBootSessionId;
  }

  public static getCurrentShutdownSessionId(): string | null {
    return currentShutdownSessionId;
  }

  public static resetStateForTesting(): void {
    bootSessionCounter = 0;
    shutdownSessionCounter = 0;
    currentBootSessionId = null;
    currentShutdownSessionId = null;
    shutdownStartTime = null;
    currentShutdownState = ShutdownState.Idle;
  }
}

export default ShutdownLogger;
