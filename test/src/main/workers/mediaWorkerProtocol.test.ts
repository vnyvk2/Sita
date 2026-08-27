import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MEDIA_WORKER_PROTOCOL_VERSION } from '../../../../src/main/workers/process/workerProtocol';

class MockParentPort extends EventEmitter {
  public postMessage = vi.fn();
}

const mockPort = new MockParentPort();
(process as any).parentPort = mockPort;

vi.mock('electron', () => ({
  parentPort: mockPort
}));

const mockExecuteAssetJob = vi.fn();
const mockExecuteDiskWalk = vi.fn();
const mockParseTracksStreaming = vi.fn();

vi.mock('../../../../src/main/workers/process/handlers/assetJobHandler', () => ({
  executeAssetJob: (...args: any[]) => mockExecuteAssetJob(...args)
}));

vi.mock('../../../../src/main/workers/process/handlers/diskWalkHandler', () => ({
  executeDiskWalk: (...args: any[]) => mockExecuteDiskWalk(...args)
}));

vi.mock('../../../../src/main/workers/process/handlers/tagParserHandler', () => ({
  parseTracksStreaming: (...args: any[]) => mockParseTracksStreaming(...args)
}));

describe('mediaWorker.ts - Task Lifecycle & Shutdown Drain Semantics', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPort.removeAllListeners();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Re-import mediaWorker module to initialize message listener
    vi.resetModules();
    await import('../../../../src/main/workers/process/mediaWorker');
  });

  it('aborts active task controllers, awaits in-flight promises, and dispatches EVT_SHUTDOWN_DRAINED', async () => {
    let resolveTask: (res: any) => void = () => {};
    let observedSignal: AbortSignal | undefined;

    mockExecuteAssetJob.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      observedSignal = abortSignal;
      return new Promise((resolve) => {
        resolveTask = resolve;
      });
    });

    // 1. Dispatch an asset generation command
    mockPort.emit('message', {
      data: {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_GENERATE_ASSET',
        taskId: 'task_drain_1',
        jobType: 'artwork',
        input: { sourceFilePath: '/test/art.jpg', destinationPath: '/test/art.webp' }
      }
    });

    await new Promise((r) => setImmediate(r));
    expect(mockExecuteAssetJob).toHaveBeenCalledTimes(1);
    expect(observedSignal?.aborted).toBe(false);

    // 2. Dispatch CMD_SHUTDOWN while task is still running
    mockPort.emit('message', {
      data: {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_SHUTDOWN',
        drainTimeoutMs: 1000
      }
    });

    await new Promise((r) => setImmediate(r));

    // Invariant: Controller is aborted immediately on shutdown
    expect(observedSignal?.aborted).toBe(true);

    // Invariant: EVT_SHUTDOWN_DRAINED must NOT be emitted while task is still settling
    const drainedCallsBefore = mockPort.postMessage.mock.calls.filter(
      ([call]) => call.type === 'EVT_SHUTDOWN_DRAINED'
    );
    expect(drainedCallsBefore).toHaveLength(0);

    // 3. Resolve the in-flight asset job
    resolveTask({
      taskId: 'task_drain_1',
      jobType: 'artwork',
      success: false,
      cancelled: true
    });

    await vi.waitFor(() => {
      const drainedCalls = mockPort.postMessage.mock.calls.filter(
        ([call]) => call.type === 'EVT_SHUTDOWN_DRAINED'
      );
      expect(drainedCalls).toHaveLength(1);
    });

    // Wait for the exit timeout
    await new Promise((r) => setTimeout(r, 50));
  });

  it('dispatches EVT_SHUTDOWN_DRAINED when hard drain timeout expires for unyielding tasks', async () => {
    // Task never resolves
    mockExecuteAssetJob.mockImplementation(() => new Promise(() => {}));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockPort.emit('message', {
      data: {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_GENERATE_ASSET',
        taskId: 'task_hang_1',
        jobType: 'waveform',
        input: { sourceFilePath: '/test/song.mp3', destinationPath: '/test/song.dat' }
      }
    });

    await new Promise((r) => setImmediate(r));

    // Dispatch CMD_SHUTDOWN with short 50ms timeout
    mockPort.emit('message', {
      data: {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_SHUTDOWN',
        drainTimeoutMs: 50
      }
    });

    await vi.waitFor(
      () => {
        const drainedCalls = mockPort.postMessage.mock.calls.filter(
          ([call]) => call.type === 'EVT_SHUTDOWN_DRAINED'
        );
        expect(drainedCalls).toHaveLength(1);
      },
      { timeout: 1000 }
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Shutdown drain timed out (50ms) with 1 active tasks: [task_hang_1]')
    );
    warnSpy.mockRestore();

    // Wait for the exit timeout
    await new Promise((r) => setTimeout(r, 50));
  });

  it('immediately rejects new commands when worker is in draining state', async () => {
    mockPort.emit('message', {
      data: {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_SHUTDOWN',
        drainTimeoutMs: 100
      }
    });

    await new Promise((r) => setImmediate(r));

    // Try to dispatch new work while draining
    mockPort.emit('message', {
      data: {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'CMD_GENERATE_ASSET',
        taskId: 'task_rejected',
        jobType: 'artwork',
        input: { sourceFilePath: '/test/art.jpg', destinationPath: '/test/art.webp' }
      }
    });

    await vi.waitFor(() => {
      const completeCall = mockPort.postMessage.mock.calls.find(
        ([call]) => call.type === 'EVT_ASSET_COMPLETE' && call.taskId === 'task_rejected'
      );
      expect(completeCall).toBeDefined();
      expect(completeCall![0]).toEqual(
        expect.objectContaining({
          success: false,
          cancelled: true,
          error: 'Worker is currently draining for shutdown.'
        })
      );
    });

    // Wait for the exit timeout
    await new Promise((r) => setTimeout(r, 50));
  });
});
