/**
 * Media Worker Process (utilityProcess).
 *
 * Runs off the main process event loop.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * This process MUST NEVER import database modules, Drizzle ORM, or PGlite instances.
 * Database ownership belongs strictly to the Main process.
 */

import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  isValidProtocolEnvelope,
  type MainToWorkerCommand,
  type WorkerToMainEvent
} from './workerProtocol';

const parentPort = process.parentPort;

if (!parentPort) {
  // If spawned without Electron parentPort (e.g. standalone node), fail early
  console.error('[MediaWorker] Fatal: process.parentPort is not available. Must be spawned as utilityProcess.');
  process.exit(1);
}

function postToMain(event: WorkerToMainEvent): void {
  try {
    parentPort.postMessage(event);
  } catch (error) {
    console.error('[MediaWorker] Failed to post message to main process:', error);
  }
}

function handleCommand(cmd: MainToWorkerCommand): void {
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

    case 'CMD_SHUTDOWN': {
      // Orderly shutdown: drain in-flight operations, signal main, and exit
      postToMain({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_SHUTDOWN_DRAINED'
      });

      // Small delay to allow MessagePort buffer to flush before exiting
      setTimeout(() => {
        process.exit(0);
      }, 20);
      break;
    }

    case 'CMD_CANCEL_TASK': {
      // C1 scaffold: no long-running tasks active yet
      break;
    }

    case 'CMD_ACK_BATCH': {
      // C1 scaffold: backpressure ACK reserved for C3
      break;
    }

    case 'CMD_WALK_DIRECTORY':
    case 'CMD_PARSE_TRACK_BATCH':
    case 'CMD_GENERATE_ASSET': {
      // Reserved for C2, C3, C4
      postToMain({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_PROTOCOL_ERROR',
        error: `Command '${cmd.type}' is reserved for future implementation phase and not yet enabled in C1.`
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

  handleCommand(data as MainToWorkerCommand);
});

// Signal to Main that the worker is booted, listening, and ready
postToMain({
  protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
  type: 'EVT_READY',
  pid: process.pid,
  supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
});
