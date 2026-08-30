import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MediaWorkerBridge,
  getMediaWorkerPath
} from '@main/workers/process/MediaWorkerBridge';
import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  type MainToWorkerCommand,
  type WorkerToMainEvent
} from '@main/workers/process/workerProtocol';

class MockUtilityProcess extends EventEmitter {
  public postMessage = vi.fn();
  public kill = vi.fn();

  public simulateWorkerMessage(event: WorkerToMainEvent | unknown) {
    this.emit('message', event);
  }

  public simulateExit(code = 0) {
    this.emit('exit', code);
  }
}

vi.mock('electron', () => {
  return {
    app: {
      getAppPath: vi.fn().mockReturnValue('C:/mock/app'),
      getPath: vi.fn().mockReturnValue('C:/mock/userData')
    },
    utilityProcess: {
      fork: vi.fn()
    }
  };
});

describe('MediaWorkerBridge (Phase C1 Scaffolding)', () => {
  let bridge: MediaWorkerBridge;
  let mockProcess: MockUtilityProcess;
  let forkMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProcess = new MockUtilityProcess();
    const { utilityProcess } = await import('electron');
    forkMock = utilityProcess.fork as unknown as ReturnType<typeof vi.fn>;
    forkMock.mockReturnValue(mockProcess);
    bridge = new MediaWorkerBridge();
  });

  describe('Lifecycle & State Management', () => {
    it('should start in UNINITIALIZED state and report isReady() = false', () => {
      expect(bridge.getState()).toBe('UNINITIALIZED');
      expect(bridge.isReady()).toBe(false);
    });

    it('should transition to READY when worker completes EVT_READY handshake', async () => {
      const startPromise = bridge.start(2000);
      expect(bridge.getState()).toBe('STARTING');

      // Simulate worker posting EVT_READY handshake
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
      });

      await startPromise;

      expect(bridge.getState()).toBe('READY');
      expect(bridge.isReady()).toBe(true);
      expect(bridge.getWorkerPid()).toBe(12345);
    });

    it('should reject start() if worker exits during startup', async () => {
      const startPromise = bridge.start(2000);

      // Simulate unexpected worker crash during boot
      mockProcess.simulateExit(1);

      await expect(startPromise).rejects.toThrow(
        'Worker process exited with code 1 during startup.'
      );
      expect(bridge.getState()).toBe('CRASHED');
      expect(bridge.isReady()).toBe(false);
    });

    it('should reject start() on timeout if worker never responds', async () => {
      const startPromise = bridge.start(100);

      await expect(startPromise).rejects.toThrow('Timeout waiting for worker EVT_READY after 100ms.');
      expect(bridge.getState()).toBe('CRASHED');
    });
  });

  describe('Ping / Pong Heartbeat', () => {
    it('should calculate roundtrip latency when worker responds with EVT_PONG', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const pingPromise = bridge.ping(2000);

      // Verify CMD_PING sent
      expect(mockProcess.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_PING'
        })
      );

      const sentCall = mockProcess.postMessage.mock.calls[0][0] as MainToWorkerCommand;
      const sentTimestamp = (sentCall as { timestamp: number }).timestamp;

      // Simulate worker EVT_PONG reply
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_PONG',
        clientTimestamp: sentTimestamp,
        serverTimestamp: sentTimestamp + 5
      });

      const latency = await pingPromise;
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should reject ping() if bridge is not in READY state', async () => {
      await expect(bridge.ping()).rejects.toThrow(
        'Cannot ping: worker is not in READY state.'
      );
    });
  });

  describe('Protocol Error Handling', () => {
    it('should emit protocol_error event when worker reports EVT_PROTOCOL_ERROR', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const errorListener = vi.fn();
      bridge.on('protocol_error', errorListener);

      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_PROTOCOL_ERROR',
        error: 'Unknown command received.'
      });

      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EVT_PROTOCOL_ERROR',
          error: 'Unknown command received.'
        })
      );
    });
  });

  describe('Orderly Shutdown & Crash Handling', () => {
    it('should send CMD_SHUTDOWN and transition to TERMINATED on worker exit', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const terminatePromise = bridge.terminate(2000);
      expect(bridge.getState()).toBe('DRAINING');

      expect(mockProcess.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_SHUTDOWN'
        })
      );

      // Simulate worker exiting
      mockProcess.simulateExit(0);

      await terminatePromise;
      expect(bridge.getState()).toBe('TERMINATED');
      expect(bridge.isReady()).toBe(false);
    });

    it('should force kill worker if terminate timeout is exceeded', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
      });
      await startPromise;

      // Worker ignores CMD_SHUTDOWN and hangs
      const terminatePromise = bridge.terminate(100);

      await terminatePromise;
      expect(mockProcess.kill).toHaveBeenCalledTimes(1);
      expect(bridge.getState()).toBe('TERMINATED');
    });

    it('should transition to CRASHED state on unexpected worker exit', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const crashListener = vi.fn();
      bridge.on('crashed', crashListener);

      // Unexpected crash
      mockProcess.simulateExit(139); // e.g. SIGSEGV

      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(crashListener).toHaveBeenCalledWith(
        expect.objectContaining({ code: 139 })
      );
    });
  });

  describe('walkDirectory (Phase C2)', () => {
    it('should send CMD_WALK_DIRECTORY and resolve snapshots on EVT_WALK_COMPLETE', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const onFileDiscovered = vi.fn();
      const walkPromise = bridge.walkDirectory([{ id: 1, path: 'C:/Music' }], {
        onFileDiscovered
      });

      expect(mockProcess.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_WALK_DIRECTORY',
          roots: [{ id: 1, path: 'C:/Music' }]
        })
      );

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_WALK_DIRECTORY'
      );
      expect(postCall).toBeDefined();
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Simulate progress event
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_WALK_PROGRESS',
        taskId,
        discoveredCount: 1,
        currentPath: 'C:/Music/track1.mp3'
      });

      expect(onFileDiscovered).toHaveBeenCalledWith(1, 'C:/Music/track1.mp3');

      // Simulate completion event
      const mockDate = new Date();
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_WALK_COMPLETE',
        taskId,
        snapshots: [
          {
            path: 'C:/Music/track1.mp3',
            fileModifiedAt: mockDate,
            size: 1024,
            rootId: 1,
            dirPath: 'C:/Music'
          }
        ],
        failedSubtrees: [],
        failedPaths: []
      });

      const result = await walkPromise;
      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0].path).toBe('C:/Music/track1.mp3');
      expect(result.snapshots[0].fileModifiedAt).toBeInstanceOf(Date);
      expect(result.failedSubtrees).toEqual([]);
      expect(result.failedPaths).toEqual([]);
    });

    it('should send CMD_CANCEL_TASK when abortSignal fires', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const abortController = new AbortController();
      const walkPromise = bridge.walkDirectory([{ id: 1, path: 'C:/Music' }], {
        abortSignal: abortController.signal
      });

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_WALK_DIRECTORY'
      );
      expect(postCall).toBeDefined();
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Trigger abort
      abortController.abort();

      expect(mockProcess.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_CANCEL_TASK',
          taskId
        })
      );

      // Complete walk with cancelled
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_WALK_COMPLETE',
        taskId,
        snapshots: [],
        failedSubtrees: [],
        failedPaths: [],
        cancelled: true
      });

      const result = await walkPromise;
      expect(result.snapshots).toHaveLength(0);
    });

    it('should reject walkDirectory if worker exits during walk', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const walkPromise = bridge.walkDirectory([{ id: 1, path: 'C:/Music' }]);
      await Promise.resolve();

      // Simulate unexpected crash during walk
      mockProcess.simulateExit(1);

      await expect(walkPromise).rejects.toThrow(
        'Worker process exited with code 1 during directory walk.'
      );
    });

    it('P0 REGRESSION: should REJECT walkDirectory when worker reports raw.error (prevents mass deletion)', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const walkPromise = bridge.walkDirectory([{ id: 1, path: 'C:/Music' }]);
      await Promise.resolve();

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_WALK_DIRECTORY'
      );
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Worker reports a global walk error with empty snapshots.
      // Before the fix, this would RESOLVE and deliver empty snapshots
      // that the diff engine would interpret as "no files exist" → mass deletion.
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_WALK_COMPLETE',
        taskId,
        snapshots: [],
        failedSubtrees: [],
        failedPaths: [],
        error: 'EPERM: permission denied, readdir /Music'
      });

      // MUST reject, not resolve
      await expect(walkPromise).rejects.toThrow('[MediaWorkerBridge] Worker walk failed');
    });

    it('P0 REGRESSION: should RESOLVE with cancelled=true on user cancellation (not error)', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const walkPromise = bridge.walkDirectory([{ id: 1, path: 'C:/Music' }]);
      await Promise.resolve();

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_WALK_DIRECTORY'
      );
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // User cancellation should still RESOLVE with cancelled: true
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_WALK_COMPLETE',
        taskId,
        snapshots: [],
        failedSubtrees: [],
        failedPaths: [],
        cancelled: true
      });

      const result = await walkPromise;
      expect(result.cancelled).toBe(true);
      expect(result.snapshots).toHaveLength(0);
    });

    it('P0 REGRESSION: should RESOLVE normally on successful walk with empty snapshots', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const walkPromise = bridge.walkDirectory([{ id: 1, path: 'C:/Music' }]);
      await Promise.resolve();

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_WALK_DIRECTORY'
      );
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Successful walk with empty snapshots (legitimate empty directory)
      // should RESOLVE normally with empty arrays
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_WALK_COMPLETE',
        taskId,
        snapshots: [],
        failedSubtrees: [],
        failedPaths: []
        // No error, no cancelled
      });

      const result = await walkPromise;
      expect(result.snapshots).toHaveLength(0);
      expect(result.cancelled).toBeFalsy();
    });
  });

  describe('parseTrackBatchStream (Phase C3)', () => {
    it('should send CMD_PARSE_TRACK_BATCH and respond with CMD_ACK_BATCH after onBatch', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_WALK_DIRECTORY', 'CMD_PARSE_TRACK_BATCH', 'CMD_SHUTDOWN']
      });
      await startPromise;

      const receivedBatches: number[] = [];
      const streamPromise = bridge.parseTrackBatchStream(
        [{ songPath: 'C:/Music/song1.mp3', folderId: 1 }],
        {
          batchSize: 100,
          onBatch: async (batch) => {
            receivedBatches.push(batch.batchId);
          }
        }
      );

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_PARSE_TRACK_BATCH'
      );
      expect(postCall).toBeDefined();
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Simulate worker sending batch 1 (not last batch)
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_TRACKS_PARSED_BATCH',
        taskId,
        batchId: 1,
        isLastBatch: false,
        tracks: [
          {
            songPath: 'C:/Music/song1.mp3',
            folderId: 1,
            title: 'Song 1',
            duration: 180.00,
            artists: ['Artist 1'],
            albumArtists: [],
            genres: ['Rock'],
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date()
          }
        ],
        errors: []
      });

      // Allow microtask to run onBatch and send ACK
      await new Promise((resolve) => setImmediate(resolve));

      // Verify Main sent CMD_ACK_BATCH for batch 1
      expect(mockProcess.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_ACK_BATCH',
          taskId,
          batchId: 1
        })
      );

      // Simulate worker sending batch 2 (isLastBatch: true)
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_TRACKS_PARSED_BATCH',
        taskId,
        batchId: 2,
        isLastBatch: true,
        tracks: [],
        errors: []
      });

      const result = await streamPromise;
      expect(result.totalParsed).toBe(1);
      expect(result.totalErrors).toBe(0);
      expect(result.cancelled).toBe(false);
      expect(receivedBatches).toEqual([1, 2]);
    });

    it('should send CMD_CANCEL_TASK, reject Main promise, and clean up task resolver when onBatch rejects', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_PARSE_TRACK_BATCH', 'CMD_CANCEL_TASK']
      });
      await startPromise;

      const batchError = new Error('Database transaction lock failed in Main');
      const streamPromise = bridge.parseTrackBatchStream(
        [{ songPath: 'C:/Music/song1.mp3', folderId: 1 }],
        {
          batchSize: 100,
          onBatch: async () => {
            throw batchError;
          }
        }
      );

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_PARSE_TRACK_BATCH'
      );
      expect(postCall).toBeDefined();
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Simulate worker sending batch 1
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_TRACKS_PARSED_BATCH',
        taskId,
        batchId: 1,
        isLastBatch: false,
        tracks: [
          {
            songPath: 'C:/Music/song1.mp3',
            folderId: 1,
            title: 'Song 1',
            duration: 180.00,
            artists: ['Artist 1'],
            albumArtists: [],
            genres: ['Rock'],
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date()
          }
        ],
        errors: []
      });

      // 1. Verify streamPromise rejects with original error
      await expect(streamPromise).rejects.toThrow('Database transaction lock failed in Main');

      // 2. Verify Main sent CMD_CANCEL_TASK to prevent worker from hanging on pendingBatchAcks
      expect(mockProcess.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'CMD_CANCEL_TASK',
          taskId
        })
      );
    });

    it('verifies streaming batches received over IPC carry only lightweight artworkPayloads with zero raw image buffers', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_PARSE_TRACK_BATCH', 'CMD_SHUTDOWN']
      });
      await startPromise;

      let receivedTrack: any;
      const streamPromise = bridge.parseTrackBatchStream(
        [{ songPath: 'C:/Music/song1.mp3', folderId: 1 }],
        {
          batchSize: 100,
          onBatch: async (batch) => {
            receivedTrack = batch.tracks[0];
          }
        }
      );

      const postCall = mockProcess.postMessage.mock.calls.find(
        (call) => (call[0] as { type: string }).type === 'CMD_PARSE_TRACK_BATCH'
      );
      const taskId = (postCall![0] as { taskId: string }).taskId;

      // Simulate worker sending lightweight payload
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_TRACKS_PARSED_BATCH',
        taskId,
        batchId: 1,
        isLastBatch: true,
        tracks: [
          {
            songPath: 'C:/Music/song1.mp3',
            folderId: 1,
            title: 'Song 1',
            duration: 180.00,
            artists: ['Artist 1'],
            albumArtists: [],
            genres: ['Rock'],
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date(),
            rawPictureBytes: undefined,
            artworkPayloads: [
              { hash: 'abc', path: 'C:/Artworks/abc.webp', width: 500, height: 500, isOptimized: false, source: 'LOCAL' },
              { hash: 'abc-optimized', path: 'C:/Artworks/abc-optimized.webp', width: 50, height: 50, isOptimized: true, source: 'LOCAL' }
            ]
          }
        ],
        errors: []
      });

      await streamPromise;

      expect(receivedTrack).toBeDefined();
      expect(receivedTrack.rawPictureBytes).toBeUndefined();
      expect(receivedTrack.artworkPayloads).toHaveLength(2);
      expect(receivedTrack.artworkPayloads[0].path).toBe('C:/Artworks/abc.webp');
    });

    it('settles cleanly on abort and ignores late worker completion events for directory walk, parse stream, and asset generation', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING', 'CMD_PARSE_TRACK_BATCH', 'CMD_WALK_DIRECTORY', 'CMD_GENERATE_ASSET']
      });
      await startPromise;

      // 1. Walk directory abort -> late completion
      const walkController = new AbortController();
      const walkPromise = bridge.walkDirectory('C:/Music', { abortSignal: walkController.signal });
      const walkTaskId = (mockProcess.postMessage.mock.calls.find(
        (c) => (c[0] as any).type === 'CMD_WALK_DIRECTORY'
      )![0] as any).taskId;

      walkController.abort();
      const walkResult = await walkPromise;
      expect(walkResult.cancelled).toBe(true);

      // Late event arrives from worker
      expect(() => {
        mockProcess.simulateWorkerMessage({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_DIRECTORY_WALK_COMPLETED',
          taskId: walkTaskId,
          totalFilesDiscovered: 100,
          totalValidAudioFiles: 50,
          durationMs: 200
        });
      }).not.toThrow();

      // 2. Parse batch stream abort -> late batch
      const parseController = new AbortController();
      const parsePromise = bridge.parseTrackBatchStream([{ songPath: 'C:/Music/test.wav' }], { abortSignal: parseController.signal });
      const parseTaskId = (mockProcess.postMessage.mock.calls.find(
        (c) => (c[0] as any).type === 'CMD_PARSE_TRACK_BATCH' && (c[0] as any).taskId !== walkTaskId
      )![0] as any).taskId;

      parseController.abort();
      const parseResult = await parsePromise;
      expect(parseResult.cancelled).toBe(true);

      // Late batch arrives from worker
      expect(() => {
        mockProcess.simulateWorkerMessage({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_TRACKS_PARSED_BATCH',
          taskId: parseTaskId,
          batchId: 1,
          isLastBatch: true,
          tracks: [],
          errors: []
        });
      }).not.toThrow();

      // 3. Asset generation abort -> late result
      const assetController = new AbortController();
      const assetPromise = bridge.generateAsset({
        jobType: 'waveform',
        input: { sourceFilePath: 'C:/Music/test.wav', destinationPath: 'C:/Cache/1.bin' },
        abortSignal: assetController.signal
      });
      const assetTaskId = (mockProcess.postMessage.mock.calls.find(
        (c) => (c[0] as any).type === 'CMD_GENERATE_ASSET'
      )![0] as any).taskId;

      assetController.abort();
      const assetResult = await assetPromise;
      expect(assetResult.success).toBe(false);
      expect(assetResult.cancelled).toBe(true);

      // Late asset result arrives from worker
      expect(() => {
        mockProcess.simulateWorkerMessage({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_ASSET_GENERATED',
          taskId: assetTaskId,
          result: { success: true, outputFilePath: 'C:/Cache/1.bin', metadata: {} }
        });
      }).not.toThrow();
    });

    it('settles cleanly on timeout and ignores late worker completion events for asset generation', async () => {
      const startPromise = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_GENERATE_ASSET']
      });
      await startPromise;

      const assetPromise = bridge.generateAsset({
        jobType: 'replaygain',
        input: { sourceFilePath: 'C:/Music/test.wav', destinationPath: '' },
        timeoutMs: 50
      });

      const assetTaskId = (mockProcess.postMessage.mock.calls.find(
        (c) => (c[0] as any).type === 'CMD_GENERATE_ASSET'
      )![0] as any).taskId;

      await expect(assetPromise).rejects.toThrow('timed out');

      // Late event arrives from worker after timeout rejection
      expect(() => {
        mockProcess.simulateWorkerMessage({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_ASSET_GENERATED',
          taskId: assetTaskId,
          result: { success: true, outputFilePath: '', metadata: { trackGain: -5.0 } }
        });
      }).not.toThrow();
    });
  });

  describe('getMediaWorkerPath', () => {
    it('should return a resolved non-empty string path for mediaWorker.js', () => {
      const resolvedPath = getMediaWorkerPath();
      expect(typeof resolvedPath).toBe('string');
      expect(resolvedPath.length).toBeGreaterThan(0);
      expect(resolvedPath).toContain('mediaWorker.js');
    });
  });
});
