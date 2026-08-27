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

      expect(bridge.getState()).toBe('CRASHED');
      expect(crashListener).toHaveBeenCalledWith({ code: 139 });
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
