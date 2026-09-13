import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

import { app, utilityProcess, type UtilityProcess } from 'electron';

import { appPreferences } from '../../../../package.json';
import { DEFAULT_ARTWORK_SAVE_LOCATION } from '../../filesystem';
import logger from '../../logger';
import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  isValidProtocolEnvelope,
  type EvtAssetComplete,
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
  artworkSaveLocation?: string;
  timeoutMs?: number;
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

export interface GenerateAssetBridgeOptions {
  jobType: 'artwork' | 'waveform' | 'replaygain';
  sourceFilePath: string;
  destinationPath: string;
  metadata?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

export interface AssetBridgeResult {
  success: boolean;
  outputFilePath?: string;
  metadata?: Record<string, unknown>;
  cancelled?: boolean;
}

/**
 * Resolves the location of the compiled mediaWorker script. Defensively probes multiple candidate
 * paths to ensure reliable execution in both local development/unpacked builds and packaged asar
 * installations.
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

  // Active asset generation task resolvers (Phase C4)
  private activeAssetResolvers: Map<
    string,
    {
      resolve: (result: AssetBridgeResult) => void;
      reject: (error: Error) => void;
      jobType: 'artwork' | 'waveform' | 'replaygain';
    }
  > = new Map();

  // Crash tracking and supervision state (Phase C4-A)
  private crashTimestamps: number[] = [];
  private consecutiveCrashCount = 0;
  private readonly MAX_CRASHES_PER_MINUTE = 3;
  private restartTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;

  // Idle auto-shutdown: the utilityProcess costs ~140MB while resident. It is
  // terminated after a period without any protocol traffic and restarted on
  // demand by the next task; supervision and crash recovery are unaffected.
  private lastWorkerActivityAt = Date.now();
  private idleCheckTimer: NodeJS.Timeout | null = null;
  private terminationPromise: Promise<void> | null = null;
  private static readonly IDLE_CHECK_INTERVAL_MS = 10_000;
  private static readonly DEFAULT_IDLE_SHUTDOWN_MS = 25_000;

  private hasPendingTasks(): boolean {
    return (
      this.activeWalkResolvers.size > 0 ||
      this.activeParseResolvers.size > 0 ||
      this.activeAssetResolvers.size > 0
    );
  }

  public getState(): MediaWorkerState {
    return this.state;
  }

  public isReady(): boolean {
    return this.state === 'READY' && this.childProcess !== null;
  }

  public getWorkerPid(): number | undefined {
    return this.workerPid;
  }

  public getConsecutiveCrashCount(): number {
    return this.consecutiveCrashCount;
  }

  /**
   * Terminates the utilityProcess once no protocol traffic has flowed for the idle window.
   * `start()` is allowed again afterwards because the state is reset to UNINITIALIZED, so the
   * next task transparently pays the respawn cost instead of every idle hour costing ~140MB.
   */
  private armIdleShutdownTimer(): void {
    if (this.idleCheckTimer) return;
    const idleShutdownMs = this.getIdleShutdownMs();
    if (idleShutdownMs <= 0) return;
    this.idleCheckTimer = setInterval(() => {
      if (this.state !== 'READY' || this.hasPendingTasks()) return;
      if (Date.now() - this.lastWorkerActivityAt < idleShutdownMs) return;

      // Re-validate state and task activity immediately before firing termination
      if (this.state !== 'READY' || this.hasPendingTasks()) return;

      logger.info('[MediaWorkerBridge] Worker idle past threshold; shutting down utilityProcess.', {
        idleMs: Date.now() - this.lastWorkerActivityAt,
        idleShutdownMs
      });
      this.disarmIdleShutdownTimer();
      void this.terminate().then(() => {
        if (this.state === 'TERMINATED') this.state = 'UNINITIALIZED';
      });
    }, MediaWorkerBridge.IDLE_CHECK_INTERVAL_MS);
  }

  private disarmIdleShutdownTimer(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  private getIdleShutdownMs(): number {
    const raw = Number(process.env.NORA_WORKER_IDLE_SHUTDOWN_MS);
    return Number.isFinite(raw) && raw >= 0
      ? raw
      : MediaWorkerBridge.DEFAULT_IDLE_SHUTDOWN_MS;
  }

  public getCrashTimestamps(): number[] {
    return [...this.crashTimestamps];
  }

  public hasPendingRestartTimer(): boolean {
    return this.restartTimer !== null;
  }

  public resetSupervisionStateForTesting(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = null;
    }
    this.disarmIdleShutdownTimer();
    this.crashTimestamps = [];
    this.consecutiveCrashCount = 0;
  }

  /** Called when a worker task completes successfully. Resets consecutive crash count back to 0. */
  private onTaskCompletedSuccessfully(): void {
    if (this.consecutiveCrashCount > 0) {
      this.consecutiveCrashCount = 0;
      logger.debug(
        '[MediaWorkerBridge] Task completed successfully. Reset consecutiveCrashCount to 0.'
      );
    }
  }

  /**
   * Spawns the utilityProcess and completes the versioned EVT_READY handshake. Idempotent: returns
   * existing in-flight startup promise if already launching.
   */
  public async start(timeoutMs = 5000): Promise<void> {
    if (this.state === 'READY' && this.childProcess) return;

    if (this.state === 'DRAINING') {
      logger.info(
        '[MediaWorkerBridge] start() called while DRAINING. Awaiting worker termination before respawning...'
      );
      if (this.terminationPromise) {
        await this.terminationPromise.catch(() => {});
      }
    }

    if (this.state === 'TERMINATED') {
      // The bridge is a reusable singleton; transition back to UNINITIALIZED to allow respawning
      this.state = 'UNINITIALIZED';
    }

    if (this.state === 'READY' && this.childProcess) return;

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
          reject(
            new Error(
              `[MediaWorkerBridge] Timeout waiting for worker EVT_READY after ${timeoutMs}ms.`
            )
          );
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
            if (this.restartTimer) {
              clearTimeout(this.restartTimer);
              this.restartTimer = null;
            }
            this.state = 'CRASHED';
            reject(
              new Error(
                `[MediaWorkerBridge] Worker process exited with code ${code} during startup.`
              )
            );
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
   * Delegates directory walking and stat gathering to the utilityProcess. Phase C2: Moves
   * fastDiskWalk off the Main process event loop.
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
      let settled = false;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeWalkResolvers.delete(taskId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore if process already exited
        }
        cleanup();
        resolve({ snapshots: [], failedSubtrees: [], failedPaths: [], cancelled: true });
      };

      const onTimeout = () => {
        if (settled) return;
        settled = true;
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore
        }
        cleanup();
        reject(new Error(`[MediaWorkerBridge] Directory walk timed out after ${timeoutMs}ms.`));
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      if (timeoutMs && timeoutMs > 0) {
        timeoutTimer = setTimeout(onTimeout, timeoutMs);
      }

      this.activeWalkResolvers.set(taskId, {
        resolve: (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
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
   * Streams track batch parsing through the utilityProcess with backpressure. Phase C3: Worker
   * parses 100-track batches and pauses until Main commits each batch.
   */
  public async parseTrackBatchStream(
    tracks: Array<{ songPath: string; folderId?: number }>,
    options: ParseBatchStreamOptions
  ): Promise<ParseStreamResult> {
    const {
      batchSize = 100,
      abortSignal,
      artworkSaveLocation = DEFAULT_ARTWORK_SAVE_LOCATION,
      timeoutMs,
      onBatch
    } = options;

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
      let settled = false;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeParseResolvers.delete(taskId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore
        }
        const currentTask = this.activeParseResolvers.get(taskId);
        const totalParsed = currentTask?.totalParsed ?? 0;
        const totalErrors = currentTask?.totalErrors ?? 0;
        cleanup();
        resolve({ totalParsed, totalErrors, cancelled: true });
      };

      const onTimeout = () => {
        if (settled) return;
        settled = true;
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore
        }
        cleanup();
        reject(new Error(`[MediaWorkerBridge] Batch parsing timed out after ${timeoutMs}ms.`));
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      if (timeoutMs && timeoutMs > 0) {
        timeoutTimer = setTimeout(onTimeout, timeoutMs);
      }

      this.activeParseResolvers.set(taskId, {
        resolve: (res) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(res);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
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
        batchSize,
        artworkSaveLocation
      });
    });
  }

  /**
   * Dispatches persistent asset generation (artwork or waveform) to the utilityProcess. Phase C4:
   * Rejects cleanly on worker crash to let JobScheduler own retry. NEVER retries or replays jobs
   * inside the Bridge.
   */
  public async generateAsset(options: GenerateAssetBridgeOptions): Promise<AssetBridgeResult> {
    const { jobType, sourceFilePath, destinationPath, metadata, abortSignal, timeoutMs } = options;

    if (abortSignal?.aborted) {
      return { success: false, cancelled: true };
    }

    if (this.state !== 'READY') {
      await this.start();
    }

    if (!this.childProcess || this.state !== 'READY') {
      throw new Error('[MediaWorkerBridge] Unable to generate asset: worker failed to start.');
    }

    const taskId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<AssetBridgeResult>((resolve, reject) => {
      let settled = false;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeAssetResolvers.delete(taskId);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore
        }
        cleanup();
        resolve({ success: false, cancelled: true });
      };

      const onTimeout = () => {
        if (settled) return;
        settled = true;
        try {
          this.sendCommand({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'CMD_CANCEL_TASK',
            taskId
          });
        } catch {
          // Ignore
        }
        cleanup();
        reject(new Error(`[MediaWorkerBridge] Asset generation timed out after ${timeoutMs}ms.`));
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      if (timeoutMs && timeoutMs > 0) {
        timeoutTimer = setTimeout(onTimeout, timeoutMs);
      }

      this.activeAssetResolvers.set(taskId, {
        resolve: (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
        jobType
      });

      this.sendCommand({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_GENERATE_ASSET',
        taskId,
        jobType,
        input: {
          sourceFilePath,
          destinationPath,
          metadata
        }
      });
    });
  }

  /** Sends a ping to the worker and measures roundtrip IPC latency in milliseconds. */
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

  /** Sends a typed command to the worker process over the IPC channel. */
  public sendCommand(cmd: MainToWorkerCommand): void {
    if (!this.childProcess) {
      throw new Error('[MediaWorkerBridge] Cannot send command: worker process does not exist.');
    }
    this.lastWorkerActivityAt = Date.now();
    this.childProcess.postMessage(cmd);
  }

  private handleIncomingMessage(message: unknown, onReadyCallback?: () => void): void {
    if (!isValidProtocolEnvelope(message)) {
      logger.warn('[MediaWorkerBridge] Received malformed message from worker:', { message });
      return;
    }

    const event = message as WorkerToMainEvent;
    this.lastWorkerActivityAt = Date.now();

    switch (event.type) {
      case 'EVT_READY': {
        this.workerPid = event.pid;
        logger.info('[MediaWorkerBridge] Worker handshake complete. Worker is READY.', {
          pid: event.pid,
          supportedOps: event.supportedOps
        });
        if (onReadyCallback) onReadyCallback();
        this.emit('ready', event);
        this.armIdleShutdownTimer();

        // Reset consecutiveCrashCount only once the worker maintains READY state stably for >= 10s
        if (this.healthTimer) clearTimeout(this.healthTimer);
        this.healthTimer = setTimeout(() => {
          if (this.state === 'READY') {
            this.consecutiveCrashCount = 0;
            logger.debug(
              '[MediaWorkerBridge] Worker demonstrated 10s stability. Reset consecutiveCrashCount to 0.'
            );
          }
        }, 10000);
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
          walk.onProgress(
            (event as EvtWalkProgress).discoveredCount,
            (event as EvtWalkProgress).currentPath ?? ''
          );
        }
        break;
      }

      case 'EVT_WALK_COMPLETE': {
        const walk = this.activeWalkResolvers.get((event as EvtWalkComplete).taskId);
        if (walk) {
          this.activeWalkResolvers.delete((event as EvtWalkComplete).taskId);
          const raw = event as EvtWalkComplete;
          const isCancelled = Boolean(raw.cancelled);

          // Worker reported a global walk error (not user cancellation).
          // REJECT the promise so callers cannot consume an empty snapshot
          // as if it were an authoritative "no files on disk" result.
          if (!isCancelled && raw.error) {
            walk.reject(
              new Error(
                `[MediaWorkerBridge] Worker walk failed: ${typeof raw.error === 'string' ? raw.error : 'unknown error'}`
              )
            );
            break;
          }

          if (!isCancelled) {
            this.onTaskCompletedSuccessfully();
          }

          // If cancelled, snapshots MUST be empty so partial walk results CANNOT be consumed
          const snapshots = isCancelled
            ? []
            : raw.snapshots.map((s) => ({
                ...s,
                fileModifiedAt:
                  s.fileModifiedAt instanceof Date ? s.fileModifiedAt : new Date(s.fileModifiedAt)
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
            fileCreatedAt:
              t.fileCreatedAt instanceof Date ? t.fileCreatedAt : new Date(t.fileCreatedAt),
            fileModifiedAt:
              t.fileModifiedAt instanceof Date ? t.fileModifiedAt : new Date(t.fileModifiedAt)
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
                if (batchEvt.cancelled && !batchEvt.isLastBatch) {
                  // Worker-initiated cancellation (e.g., backpressure timeout).
                  // REJECT so the caller can fall back to local processing for remaining tracks.
                  parseTask.reject(
                    new Error(
                      `[MediaWorkerBridge] Worker batch parsing was cancelled (timeout or worker failure). ` +
                        `Committed ${parseTask.totalParsed} tracks before cancellation.`
                    )
                  );
                } else {
                  if (!batchEvt.cancelled) {
                    this.onTaskCompletedSuccessfully();
                  }
                  parseTask.resolve({
                    totalParsed: parseTask.totalParsed,
                    totalErrors: parseTask.totalErrors,
                    cancelled: Boolean(batchEvt.cancelled)
                  });
                }
              }
            })
            .catch((err) => {
              if (this.childProcess) {
                try {
                  this.sendCommand({
                    protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
                    type: 'CMD_CANCEL_TASK',
                    taskId: batchEvt.taskId
                  });
                } catch {
                  // Ignore if child process exited
                }
              }
              parseTask.reject(err instanceof Error ? err : new Error(String(err)));
            });
        }
        break;
      }

      case 'EVT_ASSET_COMPLETE': {
        const assetEvt = event as EvtAssetComplete;
        const assetTask = this.activeAssetResolvers.get(assetEvt.taskId);
        if (assetTask) {
          this.activeAssetResolvers.delete(assetEvt.taskId);
          if (assetEvt.success) {
            this.onTaskCompletedSuccessfully();
            assetTask.resolve({
              success: true,
              outputFilePath: assetEvt.outputFilePath,
              metadata: assetEvt.metadata
            });
          } else {
            if (assetEvt.cancelled) {
              assetTask.resolve({
                success: false,
                cancelled: true
              });
            } else {
              assetTask.reject(new Error(assetEvt.error || 'Asset generation failed'));
            }
          }
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

    // Clean up stability timer if active
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = null;
    }

    // Clean up any in-flight ping promises
    for (const resolver of this.pendingPingResolvers.values()) {
      resolver(-1);
    }
    this.pendingPingResolvers.clear();

    // Fail any in-flight walk promises
    for (const walk of this.activeWalkResolvers.values()) {
      walk.reject(
        new Error(
          `[MediaWorkerBridge] Worker process exited with code ${code} during directory walk.`
        )
      );
    }
    this.activeWalkResolvers.clear();

    // Fail any in-flight parse streaming promises
    for (const parseTask of this.activeParseResolvers.values()) {
      parseTask.reject(
        new Error(
          `[MediaWorkerBridge] Worker process exited with code ${code} during track parsing.`
        )
      );
    }
    this.activeParseResolvers.clear();

    // Fail any in-flight asset generation promises immediately (CRITICAL: Bridge NEVER retries work!)
    for (const [taskId, assetTask] of this.activeAssetResolvers.entries()) {
      assetTask.reject(
        new Error(
          `[MediaWorkerBridge] Worker process crashed (exit code ${code}) while generating asset ${taskId}.`
        )
      );
    }
    this.activeAssetResolvers.clear();

    const wasDraining = this.state === 'DRAINING' || this.state === 'TERMINATED';
    this.childProcess = null;
    this.workerPid = undefined;

    if (!wasDraining) {
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }

      const now = Date.now();
      // Rolling 60-second crash window
      this.crashTimestamps = this.crashTimestamps.filter((ts) => now - ts < 60000);
      this.crashTimestamps.push(now);

      this.emit('crashed', { code, crashCount: this.crashTimestamps.length });

      // Crash #1, #2, #3 restart; Crash #4 within rolling 60s suppresses auto-restart
      if (this.crashTimestamps.length > this.MAX_CRASHES_PER_MINUTE) {
        this.state = 'CRASHED';
        logger.error(
          '[MediaWorkerBridge] Worker exceeded crash limit (4 crashes within 60s). Auto-restart suppressed.',
          { code }
        );
        this.emit('crash_limit_exceeded', { code, crashCount: this.crashTimestamps.length });
        return;
      }

      // Schedule controlled restart with consecutive backoff:
      // consecutiveCrashCount = 1 -> 100ms, 2 -> 250ms, 3 -> 500ms
      this.consecutiveCrashCount++;
      const backoffDelaysMs = [100, 250, 500];
      const delayMs = backoffDelaysMs[this.consecutiveCrashCount - 1] ?? 1000;

      this.state = 'STARTING';
      logger.info(
        `[MediaWorkerBridge] Scheduling auto-restart in ${delayMs}ms (crash #${this.crashTimestamps.length} in rolling 60s, consecutive: ${this.consecutiveCrashCount})...`
      );

      this.startPromise = new Promise<void>((resolve, reject) => {
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          this.executeStart(5000)
            .then(() => {
              this.emit('restarted', { pid: this.workerPid });
              resolve();
            })
            .catch((err) => {
              logger.error('[MediaWorkerBridge] Auto-restart failed:', { error: err });
              reject(err);
            });
        }, delayMs);
      }).finally(() => {
        this.startPromise = null;
      });
    } else {
      this.state = 'TERMINATED';
    }
  }

  /**
   * Performs an orderly shutdown:
   *
   * 1. Cancels any pending restart or stability timers.
   * 2. Signals worker with CMD_SHUTDOWN.
   * 3. Waits for EVT_SHUTDOWN_DRAINED or process exit.
   * 4. Falls back to kill() if timeout is exceeded.
   */
  public async terminate(timeoutMs = 5000): Promise<void> {
    // Cancel any pending auto-restart or health timers immediately to prevent restart during shutdown
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = null;
    }
    this.disarmIdleShutdownTimer();

    if (this.state === 'TERMINATED' || !this.childProcess) {
      this.state = 'TERMINATED';
      return;
    }

    if (this.terminationPromise) {
      return this.terminationPromise;
    }

    logger.info('[MediaWorkerBridge] Terminating media worker...');
    this.state = 'DRAINING';

    this.terminationPromise = new Promise<void>((resolve) => {
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
          logger.warn(
            `[MediaWorkerBridge] Worker did not exit within ${timeoutMs}ms. Force killing.`
          );
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
    }).finally(() => {
      this.terminationPromise = null;
    });

    return this.terminationPromise;
  }
}

export const mediaWorkerBridge = new MediaWorkerBridge();
export default mediaWorkerBridge;
