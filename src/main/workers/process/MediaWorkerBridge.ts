import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { app, utilityProcess, type UtilityProcess } from 'electron';

import { appPreferences } from '../../../../package.json';
import logger from '../../logger';
import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  isValidProtocolEnvelope,
  type EvtTracksParsedBatch,
  type EvtWalkComplete,
  type EvtWalkProgress,
  type MainToWorkerCommand,
  type ParsedTrackDTO,
  type WorkerToMainEvent
} from './workerProtocol';

export type MediaWorkerState =
  | 'UNINITIALIZED'
  | 'STARTING'
  | 'READY'
  | 'DRAINING'
  | 'TERMINATED'
  | 'CRASHED';

export interface DiskSongSnapshotDTO {
  path: string;
  fileModifiedAt: Date;
  size: number;
  rootId: number;
  dirPath?: string;
}

export interface DiskWalkBridgeResult {
  snapshots: DiskSongSnapshotDTO[];
  failedSubtrees: string[];
  failedPaths: string[];
  cancelled?: boolean;
}

export interface DiskWalkBridgeOptions {
  abortSignal?: AbortSignal;
  onFileDiscovered?: (totalDiscovered: number, currentPath: string) => void;
  supportedExtensions?: string[];
  maxConcurrency?: number;
  timeoutMs?: number;
}

export interface ParseBatchStreamOptions {
  batchSize?: number;
  abortSignal?: AbortSignal;
  onBatch: (batch: {
    batchId: number;
    isLastBatch: boolean;
    tracks: ParsedTrackDTO[];
    errors: Array<{ path: string; error: string; code?: string }>;
  }) => Promise<void>;
}

export interface ParseStreamResult {
  totalParsed: number;
  totalErrors: number;
  cancelled: boolean;
}

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
  private workerPid?: number;

  // Active directory walk task resolvers (Phase C2)
  private activeWalkResolvers: Map<
    string,
    {
      resolve: (result: DiskWalkBridgeResult) => void;
      reject: (error: Error) => void;
      onProgress?: (totalDiscovered: number, currentPath: string) => void;
    }
  > = new Map();

  // Active streaming parse task resolvers (Phase C3)
  private activeParseResolvers: Map<
    string,
    {
      resolve: (result: ParseStreamResult) => void;
      reject: (error: Error) => void;
      onBatch: (batch: {
        batchId: number;
        isLastBatch: boolean;
        tracks: ParsedTrackDTO[];
        errors: Array<{ path: string; error: string; code?: string }>;
      }) => Promise<void>;
      totalParsed: number;
      totalErrors: number;
    }
  > = new Map();

  // Crash tracking for supervision
  // NOTE: Automatic crash restart supervision is intentionally deferred to Phase C4
  // when persistent asynchronous asset jobs are active. In C1-C3, worker crashes
  // fail the active in-flight task cleanly and alert callers without destabilizing Main.
  private crashTimestamps: number[] = [];
  private readonly MAX_CRASHES_PER_MINUTE = 3;

  public getState(): MediaWorkerState {
    return this.state;
  }

  public isReady(): boolean {
    return this.state === 'READY' && this.childProcess !== null;
  }

  public getWorkerPid(): number | undefined {
    return this.workerPid;
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
   * Delegates directory walking and stat gathering to the utilityProcess.
   * Phase C2: Moves fastDiskWalk off the Main process event loop.
   */
  public async walkDirectory(
    roots: Array<{ id: number; path: string }>,
    options: DiskWalkBridgeOptions = {}
  ): Promise<DiskWalkBridgeResult> {
    const {
      abortSignal,
      onFileDiscovered,
      supportedExtensions = appPreferences.supportedMusicExtensions.map((x) => `.${x}`),
      maxConcurrency = 8,
      timeoutMs
    } = options;

    if (abortSignal?.aborted) {
      return { snapshots: [], failedSubtrees: [], failedPaths: [], cancelled: true };
    }

    if (this.state !== 'READY') {
      await this.start();
    }

    if (!this.childProcess || this.state !== 'READY') {
      throw new Error('[MediaWorkerBridge] Unable to walk directory: worker failed to start.');
    }

    const taskId = `walk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<DiskWalkBridgeResult>((resolve, reject) => {
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeWalkResolvers.delete(taskId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore if process already exited
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      if (timeoutMs && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          onAbort();
          cleanup();
          reject(new Error(`[MediaWorkerBridge] Directory walk timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }

      this.activeWalkResolvers.set(taskId, {
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        onProgress: onFileDiscovered
      });

      this.sendCommand({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_WALK_DIRECTORY',
        taskId,
        roots,
        supportedExtensions,
        maxConcurrency
      });
    });
  }

  /**
   * Streams track batch parsing through the utilityProcess with backpressure.
   * Phase C3: Worker parses 100-track batches and pauses until Main commits each batch.
   */
  public async parseTrackBatchStream(
    tracks: Array<{ songPath: string; folderId?: number }>,
    options: ParseBatchStreamOptions
  ): Promise<ParseStreamResult> {
    const { batchSize = 100, abortSignal, onBatch } = options;

    if (abortSignal?.aborted || tracks.length === 0) {
      return { totalParsed: 0, totalErrors: 0, cancelled: Boolean(abortSignal?.aborted) };
    }

    if (this.state !== 'READY') {
      await this.start();
    }

    if (!this.childProcess || this.state !== 'READY') {
      throw new Error('[MediaWorkerBridge] Unable to parse track batch: worker failed to start.');
    }

    const taskId = `parse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<ParseStreamResult>((resolve, reject) => {
      const cleanup = () => {
        this.activeParseResolvers.delete(taskId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      this.activeParseResolvers.set(taskId, {
        resolve: (res) => {
          cleanup();
          resolve(res);
        },
        reject: (err) => {
          cleanup();
          reject(err);
        },
        onBatch,
        totalParsed: 0,
        totalErrors: 0
      });

      this.sendCommand({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_PARSE_TRACK_BATCH',
        taskId,
        tracks,
        batchSize
      });
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
        this.workerPid = event.pid;
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

      case 'EVT_WALK_PROGRESS': {
        const walk = this.activeWalkResolvers.get((event as EvtWalkProgress).taskId);
        if (walk?.onProgress) {
          walk.onProgress((event as EvtWalkProgress).discoveredCount, (event as EvtWalkProgress).currentPath ?? '');
        }
        break;
      }

      case 'EVT_WALK_COMPLETE': {
        const walk = this.activeWalkResolvers.get((event as EvtWalkComplete).taskId);
        if (walk) {
          this.activeWalkResolvers.delete((event as EvtWalkComplete).taskId);
          const raw = event as EvtWalkComplete;
          const isCancelled = Boolean(raw.cancelled);

          // If cancelled, snapshots MUST be empty so partial walk results CANNOT be consumed
          const snapshots = isCancelled
            ? []
            : raw.snapshots.map((s) => ({
                ...s,
                fileModifiedAt: s.fileModifiedAt instanceof Date ? s.fileModifiedAt : new Date(s.fileModifiedAt)
              }));

          walk.resolve({
            snapshots,
            failedSubtrees: isCancelled ? [] : (raw.failedSubtrees ?? []),
            failedPaths: isCancelled ? [] : (raw.failedPaths ?? []),
            cancelled: isCancelled
          });
        }
        break;
      }

      case 'EVT_TRACKS_PARSED_BATCH': {
        const batchEvt = event as EvtTracksParsedBatch;
        const parseTask = this.activeParseResolvers.get(batchEvt.taskId);
        if (parseTask) {
          parseTask.totalParsed += batchEvt.tracks.length;
          parseTask.totalErrors += batchEvt.errors.length;

          // Normalize Date instances across IPC boundary
          const normalizedTracks: ParsedTrackDTO[] = batchEvt.tracks.map((t) => ({
            ...t,
            fileCreatedAt: t.fileCreatedAt instanceof Date ? t.fileCreatedAt : new Date(t.fileCreatedAt),
            fileModifiedAt: t.fileModifiedAt instanceof Date ? t.fileModifiedAt : new Date(t.fileModifiedAt)
          }));

          // Process batch in Main process (Drizzle transaction + artwork write)
          parseTask
            .onBatch({
              batchId: batchEvt.batchId,
              isLastBatch: batchEvt.isLastBatch,
              tracks: normalizedTracks,
              errors: batchEvt.errors
            })
            .then(() => {
              // Send backpressure ACK to unblock worker for the next batch
              if (!batchEvt.isLastBatch && !batchEvt.cancelled && this.childProcess) {
                try {
                  this.sendCommand({
                    protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
                    type: 'CMD_ACK_BATCH',
                    taskId: batchEvt.taskId,
                    batchId: batchEvt.batchId
                  });
                } catch {
                  // Ignore if child process exited
                }
              }

              if (batchEvt.isLastBatch || batchEvt.cancelled) {
                parseTask.resolve({
                  totalParsed: parseTask.totalParsed,
                  totalErrors: parseTask.totalErrors,
                  cancelled: Boolean(batchEvt.cancelled)
                });
              }
            })
            .catch((err) => {
              parseTask.reject(err instanceof Error ? err : new Error(String(err)));
            });
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

    // Fail any in-flight walk promises
    for (const walk of this.activeWalkResolvers.values()) {
      walk.reject(new Error(`[MediaWorkerBridge] Worker process exited with code ${code} during directory walk.`));
    }
    this.activeWalkResolvers.clear();

    // Fail any in-flight parse streaming promises
    for (const parseTask of this.activeParseResolvers.values()) {
      parseTask.reject(new Error(`[MediaWorkerBridge] Worker process exited with code ${code} during track parsing.`));
    }
    this.activeParseResolvers.clear();

    const wasDraining = this.state === 'DRAINING' || this.state === 'TERMINATED';
    this.childProcess = null;
    this.workerPid = undefined;

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
