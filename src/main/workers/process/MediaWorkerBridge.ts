import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { app, utilityProcess, type UtilityProcess } from 'electron';

import logger from '../../logger';
import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  isValidProtocolEnvelope,
  type MainToWorkerCommand,
  type WorkerToMainEvent
} from './workerProtocol';

export type MediaWorkerState =
  | 'UNINITIALIZED'
  | 'STARTING'
  | 'READY'
  | 'DRAINING'
  | 'TERMINATED'
  | 'CRASHED';

/**
 * Resolves the location of the compiled mediaWorker script.
 * Defensively probes multiple candidate paths to ensure reliable execution in both
 * local development/unpacked builds and packaged asar installations.
 */
export function getMediaWorkerPath(): string {
  const candidates = [
    path.resolve(import.meta.dirname, 'mediaWorker.js'),
    path.resolve(import.meta.dirname, '../mediaWorker.js'),
    path.resolve(import.meta.dirname, '../../out/main/mediaWorker.js'),
    path.resolve(app?.getAppPath?.() ?? process.cwd(), 'out/main/mediaWorker.js'),
    path.resolve(process.cwd(), 'out/main/mediaWorker.js')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export class MediaWorkerBridge extends EventEmitter {
  private childProcess: UtilityProcess | null = null;
  private state: MediaWorkerState = 'UNINITIALIZED';
  private startPromise: Promise<void> | null = null;
  private pendingPingResolvers: Map<number, (latencyMs: number) => void> = new Map();

  // Crash tracking for supervision
  private crashTimestamps: number[] = [];
  private readonly MAX_CRASHES_PER_MINUTE = 3;

  public getState(): MediaWorkerState {
    return this.state;
  }

  public isReady(): boolean {
    return this.state === 'READY' && this.childProcess !== null;
  }

  /**
   * Spawns the utilityProcess and completes the versioned EVT_READY handshake.
   * Idempotent: returns existing in-flight startup promise if already launching.
   */
  public async start(timeoutMs = 5000): Promise<void> {
    if (this.state === 'READY') return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.executeStart(timeoutMs).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  private async executeStart(timeoutMs: number): Promise<void> {
    const workerPath = getMediaWorkerPath();
    logger.info('[MediaWorkerBridge] Starting utilityProcess media worker...', { workerPath });

    this.state = 'STARTING';

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.state = 'CRASHED';
          try {
            this.childProcess?.kill();
          } catch {
            // Process may already be dead
          }
          this.childProcess = null;
          reject(new Error(`[MediaWorkerBridge] Timeout waiting for worker EVT_READY after ${timeoutMs}ms.`));
        }
      }, timeoutMs);

      try {
        this.childProcess = utilityProcess.fork(workerPath, [], {
          serviceName: 'NoraMediaWorker'
        });

        this.childProcess.on('spawn', () => {
          logger.debug('[MediaWorkerBridge] Worker process spawned.');
        });

        this.childProcess.on('message', (message: unknown) => {
          this.handleIncomingMessage(message, () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              this.state = 'READY';
              resolve();
            }
          });
        });

        this.childProcess.on('exit', (code: number) => {
          this.handleWorkerExit(code);
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            reject(new Error(`[MediaWorkerBridge] Worker process exited with code ${code} during startup.`));
          }
        });
      } catch (error) {
        clearTimeout(timer);
        this.state = 'CRASHED';
        reject(error);
      }
    });
  }

  /**
   * Sends a ping to the worker and measures roundtrip IPC latency in milliseconds.
   */
  public async ping(timeoutMs = 3000): Promise<number> {
    if (!this.isReady() || !this.childProcess) {
      throw new Error('[MediaWorkerBridge] Cannot ping: worker is not in READY state.');
    }

    const timestamp = Date.now();

    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPingResolvers.delete(timestamp);
        reject(new Error(`[MediaWorkerBridge] Ping timeout after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingPingResolvers.set(timestamp, (latencyMs) => {
        clearTimeout(timer);
        resolve(latencyMs);
      });

      this.sendCommand({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_PING',
        timestamp
      });
    });
  }

  /**
   * Sends a typed command to the worker process over the IPC channel.
   */
  public sendCommand(cmd: MainToWorkerCommand): void {
    if (!this.childProcess) {
      throw new Error('[MediaWorkerBridge] Cannot send command: worker process does not exist.');
    }
    this.childProcess.postMessage(cmd);
  }

  private handleIncomingMessage(message: unknown, onReadyCallback?: () => void): void {
    if (!isValidProtocolEnvelope(message)) {
      logger.warn('[MediaWorkerBridge] Received malformed message from worker:', { message });
      return;
    }

    const event = message as WorkerToMainEvent;

    switch (event.type) {
      case 'EVT_READY': {
        logger.info('[MediaWorkerBridge] Worker handshake complete. Worker is READY.', {
          pid: event.pid,
          supportedOps: event.supportedOps
        });
        if (onReadyCallback) onReadyCallback();
        this.emit('ready', event);
        break;
      }

      case 'EVT_PONG': {
        const resolver = this.pendingPingResolvers.get(event.clientTimestamp);
        if (resolver) {
          const latency = Date.now() - event.clientTimestamp;
          this.pendingPingResolvers.delete(event.clientTimestamp);
          resolver(latency);
        }
        break;
      }

      case 'EVT_SHUTDOWN_DRAINED': {
        logger.info('[MediaWorkerBridge] Worker confirmed orderly shutdown drained.');
        this.emit('drained');
        break;
      }

      case 'EVT_PROTOCOL_ERROR': {
        logger.error('[MediaWorkerBridge] Worker reported protocol error:', {
          error: event.error,
          receivedVersion: event.receivedVersion
        });
        this.emit('protocol_error', event);
        break;
      }

      default: {
        this.emit('event', event);
      }
    }
  }

  private handleWorkerExit(code: number): void {
    logger.info(`[MediaWorkerBridge] Worker exited with code ${code} (state: ${this.state}).`);

    // Clean up any in-flight ping promises
    for (const resolver of this.pendingPingResolvers.values()) {
      resolver(-1);
    }
    this.pendingPingResolvers.clear();

    const wasDraining = this.state === 'DRAINING' || this.state === 'TERMINATED';
    this.childProcess = null;

    if (!wasDraining) {
      this.state = 'CRASHED';
      const now = Date.now();
      this.crashTimestamps = this.crashTimestamps.filter((ts) => now - ts < 60000);
      this.crashTimestamps.push(now);

      this.emit('crashed', { code });

      if (this.crashTimestamps.length > this.MAX_CRASHES_PER_MINUTE) {
        logger.error('[MediaWorkerBridge] Worker exceeded crash limit (>3 in 60s). Suppressing auto-restart.');
      }
    } else {
      this.state = 'TERMINATED';
    }
  }

  /**
   * Performs an orderly shutdown:
   * 1. Signals worker with CMD_SHUTDOWN.
   * 2. Waits for EVT_SHUTDOWN_DRAINED or process exit.
   * 3. Falls back to kill() if timeout is exceeded.
   */
  public async terminate(timeoutMs = 5000): Promise<void> {
    if (this.state === 'TERMINATED' || !this.childProcess) {
      this.state = 'TERMINATED';
      return;
    }

    logger.info('[MediaWorkerBridge] Terminating media worker...');
    this.state = 'DRAINING';

    return new Promise<void>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          this.state = 'TERMINATED';
          this.childProcess = null;
          resolve();
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          logger.warn(`[MediaWorkerBridge] Worker did not exit within ${timeoutMs}ms. Force killing.`);
          try {
            this.childProcess?.kill();
          } catch {
            // Process may already have exited
          }
          finish();
        }
      }, timeoutMs);

      this.childProcess?.once('exit', () => {
        clearTimeout(timer);
        finish();
      });

      try {
        this.sendCommand({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_SHUTDOWN'
        });
      } catch {
        try {
          this.childProcess?.kill();
        } catch {
          // Process may already have exited
        }
        clearTimeout(timer);
        finish();
      }
    });
  }
}

export const mediaWorkerBridge = new MediaWorkerBridge();
export default mediaWorkerBridge;
