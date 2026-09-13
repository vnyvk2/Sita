/**
 * Media Worker Process (utilityProcess).
 *
 * Runs off the main process event loop.
 *
 * CRITICAL ARCHITECTURAL INVARIANT: This process MUST NEVER import database modules, Drizzle ORM,
 * or PGlite instances. Database ownership belongs strictly to the Main process.
 */

import { executeAssetJob } from './handlers/assetJobHandler';
import { executeDiskWalk } from './handlers/diskWalkHandler';
import { parseTracksStreaming } from './handlers/tagParserHandler';
import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  isValidProtocolEnvelope,
  type MainToWorkerCommand,
  type WorkerToMainEvent
} from './workerProtocol';

const parentPort = process.parentPort;

if (!parentPort) {
  console.error(
    '[MediaWorker] Fatal: process.parentPort is not available. Must be spawned as utilityProcess.'
  );
  process.exit(1);
}

// Active task tracking for cancellation and true drain semantics
const activeTaskControllers = new Map<string, AbortController>();
const activeTaskPromises = new Map<string, Promise<unknown>>();
const pendingBatchAcks = new Map<string, () => void>();
const userCancelledTasks = new Set<string>();
let isDraining = false;

function postToMain(event: WorkerToMainEvent): void {
  try {
    parentPort.postMessage(event);
  } catch (error) {
    console.error('[MediaWorker] Failed to post message to main process:', error);
  }
}

async function handleCommand(cmd: MainToWorkerCommand): Promise<void> {
  switch (cmd.type) {
    case 'CMD_PING': {
      postToMain({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_PONG',
        clientTimestamp: cmd.timestamp,
        serverTimestamp: Date.now()
      });
      break;
    }

    case 'CMD_WALK_DIRECTORY': {
      if (isDraining) {
        postToMain({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_WALK_COMPLETE',
          taskId: cmd.taskId,
          snapshots: [],
          failedSubtrees: [],
          failedPaths: [],
          cancelled: true,
          error: 'Worker is currently draining for shutdown.'
        });
        return;
      }

      const controller = new AbortController();
      activeTaskControllers.set(cmd.taskId, controller);

      const taskPromise = (async () => {
        try {
          const result = await executeDiskWalk(cmd.roots, {
            supportedExtensions: cmd.supportedExtensions,
            abortSignal: controller.signal,
            maxConcurrency: cmd.maxConcurrency ?? 8,
            onProgress: (count, currentPath) => {
              postToMain({
                protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
                type: 'EVT_WALK_PROGRESS',
                taskId: cmd.taskId,
                discoveredCount: count,
                currentPath
              });
            }
          });

          postToMain({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'EVT_WALK_COMPLETE',
            taskId: cmd.taskId,
            snapshots: result.snapshots,
            failedSubtrees: result.failedSubtrees,
            failedPaths: result.failedPaths,
            cancelled: controller.signal.aborted
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          postToMain({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'EVT_WALK_COMPLETE',
            taskId: cmd.taskId,
            snapshots: [],
            failedSubtrees: [],
            failedPaths: [],
            cancelled: controller.signal.aborted,
            error: msg
          });
        } finally {
          activeTaskControllers.delete(cmd.taskId);
          activeTaskPromises.delete(cmd.taskId);
        }
      })();

      activeTaskPromises.set(cmd.taskId, taskPromise);
      await taskPromise;
      break;
    }

    case 'CMD_PARSE_TRACK_BATCH': {
      if (isDraining) {
        postToMain({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_TRACKS_PARSED_BATCH',
          taskId: cmd.taskId,
          batchId: 0,
          isLastBatch: true,
          tracks: [],
          errors: [],
          cancelled: true
        });
        return;
      }

      const controller = new AbortController();
      activeTaskControllers.set(cmd.taskId, controller);

      const taskPromise = (async () => {
        try {
          await parseTracksStreaming(cmd.tracks, {
            taskId: cmd.taskId,
            batchSize: cmd.batchSize ?? 100,
            abortSignal: controller.signal,
            artworkSaveLocation: cmd.artworkSaveLocation,
            onBatchReady: async (batch) => {
              if (controller.signal.aborted) return;

              // Send parsed batch to Main
              postToMain({
                protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
                type: 'EVT_TRACKS_PARSED_BATCH',
                taskId: cmd.taskId,
                batchId: batch.batchId,
                isLastBatch: batch.isLastBatch,
                tracks: batch.tracks,
                errors: batch.errors,
                cancelled: false
              });

              // Backpressure: pause until Main sends CMD_ACK_BATCH for this batch
              if (!batch.isLastBatch) {
                const ackKey = `${cmd.taskId}:${batch.batchId}`;
                await new Promise<void>((resolve, reject) => {
                  const timeoutTimer = setTimeout(() => {
                    pendingBatchAcks.delete(ackKey);
                    console.error(
                      `[MediaWorker] Backpressure safety timeout triggered (30s) waiting for CMD_ACK_BATCH on task '${cmd.taskId}', batch ${batch.batchId}. Aborting task.`
                    );
                    controller.abort();
                    reject(
                      new Error(
                        `Backpressure safety timeout (30s) waiting for CMD_ACK_BATCH on task '${cmd.taskId}', batch ${batch.batchId}.`
                      )
                    );
                  }, 30000); // 30s safety timeout to prevent unbounded worker allocation

                  pendingBatchAcks.set(ackKey, () => {
                    clearTimeout(timeoutTimer);
                    resolve();
                  });
                });
              }
            }
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isUserCancel =
            userCancelledTasks.has(cmd.taskId) ||
            (controller.signal.aborted && controller.signal.reason === 'user_cancel');

          if (isUserCancel) {
            postToMain({
              protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
              type: 'EVT_TRACKS_PARSED_BATCH',
              taskId: cmd.taskId,
              batchId: -1,
              isLastBatch: true,
              tracks: [],
              errors: [],
              cancelled: true
            });
          } else {
            postToMain({
              protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
              type: 'EVT_TRACKS_PARSED_FAILED',
              taskId: cmd.taskId,
              error: msg
            });
          }
        } finally {
          userCancelledTasks.delete(cmd.taskId);
          activeTaskControllers.delete(cmd.taskId);
          activeTaskPromises.delete(cmd.taskId);
          // Defensive cleanup: unblock and delete any remaining pending batch acks for this task
          for (const [key, resolve] of pendingBatchAcks.entries()) {
            if (key.startsWith(`${cmd.taskId}:`)) {
              pendingBatchAcks.delete(key);
              resolve();
            }
          }
        }
      })();

      activeTaskPromises.set(cmd.taskId, taskPromise);
      await taskPromise;
      break;
    }

    case 'CMD_ACK_BATCH': {
      const ackKey = `${cmd.taskId}:${cmd.batchId}`;
      const resolveAck = pendingBatchAcks.get(ackKey);
      if (resolveAck) {
        pendingBatchAcks.delete(ackKey);
        resolveAck();
      }
      break;
    }

    case 'CMD_CANCEL_TASK': {
      userCancelledTasks.add(cmd.taskId);
      const controller = activeTaskControllers.get(cmd.taskId);
      if (controller) {
        controller.abort('user_cancel');
        // NOTE: Do not delete activeTaskControllers here.
        // The executing task's finally block owns registration cleanup.
      }
      // Unblock any pending batch acks for this task
      for (const [key, resolve] of pendingBatchAcks.entries()) {
        if (key.startsWith(`${cmd.taskId}:`)) {
          pendingBatchAcks.delete(key);
          resolve();
        }
      }
      break;
    }

    case 'CMD_SHUTDOWN': {
      // True drain semantics: stop accepting new work, abort active operations
      isDraining = true;

      for (const controller of activeTaskControllers.values()) {
        try {
          controller.abort();
        } catch {
          // Ignore
        }
      }

      for (const resolve of pendingBatchAcks.values()) {
        resolve();
      }
      pendingBatchAcks.clear();

      const drainTimeoutMs = cmd.drainTimeoutMs ?? 2000;
      if (activeTaskPromises.size > 0) {
        let timer: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), drainTimeoutMs);
        });

        const allSettledPromise = Promise.allSettled(Array.from(activeTaskPromises.values()));
        const raceResult = await Promise.race([allSettledPromise, timeoutPromise]);
        if (timer) clearTimeout(timer);

        if (raceResult === 'timeout' && activeTaskPromises.size > 0) {
          console.warn(
            `[MediaWorker] Shutdown drain timed out (${drainTimeoutMs}ms) with ${activeTaskPromises.size} active tasks: [${Array.from(activeTaskPromises.keys()).join(', ')}]`
          );
        }
      }

      postToMain({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_SHUTDOWN_DRAINED'
      });

      setTimeout(() => {
        process.exit(0);
      }, 20);
      break;
    }

    case 'CMD_GENERATE_ASSET': {
      if (isDraining) {
        postToMain({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_ASSET_COMPLETE',
          taskId: cmd.taskId,
          jobType: cmd.jobType,
          success: false,
          error: 'Worker is currently draining for shutdown.',
          cancelled: true
        });
        return;
      }

      const controller = new AbortController();
      activeTaskControllers.set(cmd.taskId, controller);

      const taskPromise = (async () => {
        try {
          const result = await executeAssetJob({
            taskId: cmd.taskId,
            jobType: cmd.jobType,
            input: cmd.input,
            abortSignal: controller.signal
          });

          if (result.success) {
            postToMain({
              protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
              type: 'EVT_ASSET_COMPLETE',
              taskId: cmd.taskId,
              jobType: cmd.jobType,
              success: true,
              outputFilePath: result.outputFilePath,
              metadata: result.metadata,
              cancelled: false
            });
          } else {
            postToMain({
              protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
              type: 'EVT_ASSET_COMPLETE',
              taskId: cmd.taskId,
              jobType: cmd.jobType,
              success: false,
              error: result.error,
              cancelled: result.cancelled
            });
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          postToMain({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'EVT_ASSET_COMPLETE',
            taskId: cmd.taskId,
            jobType: cmd.jobType,
            success: false,
            error: msg,
            cancelled: controller.signal.aborted
          });
        } finally {
          activeTaskControllers.delete(cmd.taskId);
          activeTaskPromises.delete(cmd.taskId);
        }
      })();

      activeTaskPromises.set(cmd.taskId, taskPromise);
      await taskPromise;
      break;
    }

    default: {
      postToMain({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_PROTOCOL_ERROR',
        error: `Unknown command type received: ${(cmd as { type?: unknown }).type}`
      });
    }
  }
}

parentPort.on('message', (event: Electron.MessageEvent) => {
  const data = event.data;

  if (!isValidProtocolEnvelope(data)) {
    postToMain({
      protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
      type: 'EVT_PROTOCOL_ERROR',
      error:
        'Message does not conform to MediaWorker protocol envelope (missing or invalid protocolVersion/type).'
    });
    return;
  }

  if (data.protocolVersion !== MEDIA_WORKER_PROTOCOL_VERSION) {
    postToMain({
      protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
      type: 'EVT_PROTOCOL_ERROR',
      error: `Protocol version mismatch. Worker expects v${MEDIA_WORKER_PROTOCOL_VERSION}, got v${data.protocolVersion}.`,
      receivedVersion: data.protocolVersion
    });
    return;
  }

  void handleCommand(data as MainToWorkerCommand);
});

// Signal to Main that the worker is booted, listening, and ready
postToMain({
  protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
  type: 'EVT_READY',
  pid: process.pid,
  supportedOps: [
    'CMD_PING',
    'CMD_WALK_DIRECTORY',
    'CMD_PARSE_TRACK_BATCH',
    'CMD_ACK_BATCH',
    'CMD_GENERATE_ASSET',
    'CMD_CANCEL_TASK',
    'CMD_SHUTDOWN'
  ]
});
