/**
 * Media Worker Process (utilityProcess).
 *
 * Runs off the main process event loop.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * This process MUST NEVER import database modules, Drizzle ORM, or PGlite instances.
 * Database ownership belongs strictly to the Main process.
 */

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
  console.error('[MediaWorker] Fatal: process.parentPort is not available. Must be spawned as utilityProcess.');
  process.exit(1);
}

// Active task tracking for cancellation and true drain semantics
const activeTaskControllers = new Map<string, AbortController>();
const pendingBatchAcks = new Map<string, () => void>();
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
      }
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

      try {
        await parseTracksStreaming(cmd.tracks, {
          taskId: cmd.taskId,
          batchSize: cmd.batchSize ?? 100,
          abortSignal: controller.signal,
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
              await new Promise<void>((resolve) => {
                const timeoutTimer = setTimeout(() => {
                  pendingBatchAcks.delete(ackKey);
                  console.warn(
                    `[MediaWorker] Backpressure safety timeout triggered (30s) waiting for CMD_ACK_BATCH on task '${cmd.taskId}', batch ${batch.batchId}. Resuming worker.`
                  );
                  postToMain({
                    protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
                    type: 'EVT_ERROR_SUMMARY',
                    message: `Backpressure safety timeout triggered (30s) on task '${cmd.taskId}', batch ${batch.batchId}.`
                  });
                  resolve();
                }, 30000); // 30s safety timeout to prevent permanent worker stalls

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
        postToMain({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_TRACKS_PARSED_BATCH',
          taskId: cmd.taskId,
          batchId: -1,
          isLastBatch: true,
          tracks: [],
          errors: [{ path: '', error: msg }],
          cancelled: controller.signal.aborted
        });
      } finally {
        activeTaskControllers.delete(cmd.taskId);
      }
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
      const controller = activeTaskControllers.get(cmd.taskId);
      if (controller) {
        controller.abort();
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
      activeTaskControllers.clear();

      for (const resolve of pendingBatchAcks.values()) {
        resolve();
      }
      pendingBatchAcks.clear();

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
      // Reserved for C4
      postToMain({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_PROTOCOL_ERROR',
        error: `Command '${cmd.type}' is reserved for future implementation phase and not yet enabled.`
      });
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
      error: 'Message does not conform to MediaWorker protocol envelope (missing or invalid protocolVersion/type).'
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
    'CMD_CANCEL_TASK',
    'CMD_SHUTDOWN'
  ]
});
