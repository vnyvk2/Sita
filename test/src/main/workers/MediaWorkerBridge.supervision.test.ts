import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobScheduler } from '@main/workers/jobScheduler';
import { MediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import {
  MEDIA_WORKER_PROTOCOL_VERSION,
  type EvtAssetComplete,
  type EvtReady,
  type MainToWorkerCommand
} from '@main/workers/process/workerProtocol';
import type { Job } from '@main/workers/types';

class MockUtilityProcess extends EventEmitter {
  public pid: number;
  public onAssetCommand?: (cmd: MainToWorkerCommand) => void;

  public postMessage = vi.fn((msg?: MainToWorkerCommand) => {
    if (msg?.type === 'CMD_SHUTDOWN') {
      setTimeout(() => this.simulateExit(0), 5);
    }
    if (msg?.type === 'CMD_GENERATE_ASSET') {
      if (this.onAssetCommand) {
        this.onAssetCommand(msg);
      }
    }
  });

  public kill = vi.fn(() => {
    this.simulateExit(0);
  });

  constructor(pid = 12345) {
    super();
    this.pid = pid;
  }

  public simulateWorkerMessage(message: unknown): void {
    this.emit('message', message);
  }

  public simulateExit(code: number): void {
    this.emit('exit', code);
  }
}

let mockProcess: MockUtilityProcess;
let nextPid = 20000;
let autoSendReadyOnFork = false;
let customOnAssetCommand: ((cmd: MainToWorkerCommand) => void) | undefined;

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'C:/mock/app',
    getPath: () => 'C:/mock/userData'
  },
  utilityProcess: {
    fork: vi.fn(() => {
      mockProcess = new MockUtilityProcess(nextPid++);
      if (customOnAssetCommand) {
        mockProcess.onAssetCommand = customOnAssetCommand;
      }
      if (autoSendReadyOnFork) {
        setTimeout(() => {
          mockProcess.simulateWorkerMessage({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'EVT_READY',
            pid: mockProcess.pid,
            supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
          });
        }, 5);
      }
      return mockProcess;
    })
  }
}));

describe('MediaWorkerBridge Supervision & Crash Recovery (Gate C4-A)', () => {
  let bridge: MediaWorkerBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    autoSendReadyOnFork = false;
    customOnAssetCommand = undefined;
    bridge = new MediaWorkerBridge();
    bridge.resetSupervisionStateForTesting();
  });

  afterEach(async () => {
    vi.useRealTimers();
    autoSendReadyOnFork = false;
    customOnAssetCommand = undefined;
    await bridge.terminate();
  });

  const completeHandshake = async (startPromise: Promise<void>, pid = 12345): Promise<void> => {
    const readyEvt: EvtReady = {
      protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
      type: 'EVT_READY',
      pid,
      supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
    };
    mockProcess.simulateWorkerMessage(readyEvt);
    await startPromise;
  };

  describe('In-Flight Asset Rejection on Worker Crash', () => {
    it('should reject in-flight asset promise immediately on worker crash and NOT retry inside Bridge', async () => {
      const startPromise = bridge.start(2000);
      await completeHandshake(startPromise, 10001);

      const assetPromise = bridge.generateAsset({
        jobType: 'waveform',
        sourceFilePath: 'C:/Music/test.mp3',
        destinationPath: 'C:/Cache/waveforms/test.bin'
      });

      // Verify command was sent
      const postCalls = mockProcess.postMessage.mock.calls;
      const cmdCall = postCalls.find((c) => (c[0] as MainToWorkerCommand).type === 'CMD_GENERATE_ASSET');
      expect(cmdCall).toBeDefined();

      // Worker crashes while asset task is in-flight
      mockProcess.simulateExit(1);

      // In-flight asset promise MUST reject immediately with crash error
      await expect(assetPromise).rejects.toThrow(
        /Worker process crashed \(exit code 1\) while generating asset/
      );
    });
  });

  describe('Fake-Timer Backoff Timing & Exact Threshold Contract', () => {
    it('verifies exact backoff delays (100ms -> 250ms -> 500ms) without manual start() intervention', async () => {
      vi.useFakeTimers();
      const { utilityProcess } = await import('electron');

      // 1. Initial boot
      const startP = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10001,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      await startP;
      expect(bridge.getState()).toBe('READY');
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(1);

      // --- CRASH #1 ---
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // At 99ms, no new process spawned yet
      vi.advanceTimersByTime(99);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(1);

      // At 100ms, automatic spawn occurs
      vi.advanceTimersByTime(1);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(2);

      // Complete handshake for restart #1
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10002,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      expect(bridge.getState()).toBe('READY');

      // --- CRASH #2 ---
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(bridge.getConsecutiveCrashCount()).toBe(2);

      // At 249ms, no new process spawned yet
      vi.advanceTimersByTime(249);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(2);

      // At 250ms, automatic spawn occurs
      vi.advanceTimersByTime(1);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(3);

      // Complete handshake for restart #2
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10003,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      expect(bridge.getState()).toBe('READY');

      // --- CRASH #3 ---
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(bridge.getConsecutiveCrashCount()).toBe(3);

      // At 499ms, no new process spawned yet
      vi.advanceTimersByTime(499);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(3);

      // At 500ms, automatic spawn occurs
      vi.advanceTimersByTime(1);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(4);

      // Complete handshake for restart #3
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10004,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      expect(bridge.getState()).toBe('READY');

      // --- CRASH #4 within rolling 60s ---
      const crashLimitSpy = vi.fn();
      bridge.once('crash_limit_exceeded', crashLimitSpy);

      mockProcess.simulateExit(1);

      // Crash #4 MUST NOT schedule a restart
      expect(crashLimitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ code: 1, crashCount: 4 })
      );
      expect(bridge.getState()).toBe('CRASHED');
      expect(bridge.hasPendingRestartTimer()).toBe(false);

      // Advance 10000ms: verify NO process spawned
      vi.advanceTimersByTime(10000);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(4);
    });

    it('proves generateAsset() awaiting during backoff does NOT bypass backoff delay or spawn duplicate processes', async () => {
      vi.useFakeTimers();
      const { utilityProcess } = await import('electron');

      // 1. Initial boot
      const startP = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10001,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      await startP;
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(1);

      // 2. Crash -> 100ms restart timer scheduled
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);

      // 3. Caller calls generateAsset() at 50ms into backoff window
      vi.advanceTimersByTime(50);
      let assetCompleted = false;
      const assetPromise = bridge
        .generateAsset({
          jobType: 'waveform',
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/test.bin'
        })
        .then((res) => {
          assetCompleted = true;
          return res;
        });

      // PROVE: generateAsset() did NOT bypass the backoff timer
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(1);
      expect(assetCompleted).toBe(false);

      // 4. Advance remaining 50ms to reach 100ms
      vi.advanceTimersByTime(50);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(2);

      // 5. Complete handshake for the restarted process
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10002,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });

      // Allow microtask to run so generateAsset sends command
      await vi.advanceTimersByTimeAsync(0);

      // 6. Complete the asset task
      const cmdCall = mockProcess.postMessage.mock.calls.find(
        (c) => (c[0] as MainToWorkerCommand).type === 'CMD_GENERATE_ASSET'
      );
      expect(cmdCall).toBeDefined();
      const taskId = (cmdCall![0] as { taskId: string }).taskId;

      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_ASSET_COMPLETE',
        taskId,
        jobType: 'waveform',
        success: true,
        outputFilePath: 'C:/Cache/test.bin',
        metadata: {}
      });

      const res = await assetPromise;
      expect(res.success).toBe(true);
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(2);
    });
  });

  describe('Concurrent generateAsset() Single-Flight Coverage', () => {
    it('multiple concurrent generateAsset() calls while worker is starting spawn exactly ONE utilityProcess', async () => {
      const { utilityProcess } = await import('electron');
      const initialForks = vi.mocked(utilityProcess.fork).mock.calls.length;

      // Dispatch 3 concurrent asset generation calls while bridge is UNINITIALIZED
      const p1 = bridge.generateAsset({
        jobType: 'artwork',
        sourceFilePath: 'C:/Music/1.mp3',
        destinationPath: 'C:/Cache/1.webp'
      });
      const p2 = bridge.generateAsset({
        jobType: 'artwork',
        sourceFilePath: 'C:/Music/2.mp3',
        destinationPath: 'C:/Cache/2.webp'
      });
      const p3 = bridge.generateAsset({
        jobType: 'waveform',
        sourceFilePath: 'C:/Music/3.mp3',
        destinationPath: 'C:/Cache/3.bin'
      });

      // PROVE: exactly ONE utilityProcess.fork was initiated
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(initialForks + 1);

      // Complete worker startup handshake
      const readyEvt: EvtReady = {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10001,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      };
      mockProcess.simulateWorkerMessage(readyEvt);

      // Allow event loop to dispatch the 3 commands
      await new Promise((resolve) => setTimeout(resolve, 10));

      const postCalls = mockProcess.postMessage.mock.calls.filter(
        (c) => (c[0] as MainToWorkerCommand).type === 'CMD_GENERATE_ASSET'
      );
      expect(postCalls).toHaveLength(3);

      // Respond with EVT_ASSET_COMPLETE for each
      for (const call of postCalls) {
        const cmd = call[0] as { taskId: string; jobType: 'artwork' | 'waveform'; input: { destinationPath: string } };
        mockProcess.simulateWorkerMessage({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_ASSET_COMPLETE',
          taskId: cmd.taskId,
          jobType: cmd.jobType,
          success: true,
          outputFilePath: cmd.input.destinationPath,
          metadata: {}
        });
      }

      const results = await Promise.all([p1, p2, p3]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      // PROVE: STILL exactly one process spawned
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(initialForks + 1);
    });
  });

  describe('10-Second Stable READY Reset Path', () => {
    it('resets consecutiveCrashCount only after 10 full seconds in READY state', async () => {
      vi.useFakeTimers();

      // 1. Initial boot
      const startP = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10001,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      await startP;

      // 2. Crash -> consecutiveCrashCount becomes 1
      mockProcess.simulateExit(1);
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Advance 100ms to allow restart spawn
      vi.advanceTimersByTime(100);

      // Complete handshake
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10002,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      expect(bridge.getState()).toBe('READY');

      // PROVE: consecutiveCrashCount is NOT reset immediately upon EVT_READY
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Advance 9999ms: count MUST remain 1
      vi.advanceTimersByTime(9999);
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Advance final 1ms (reaching 10,000ms total): count MUST reset to 0
      vi.advanceTimersByTime(1);
      expect(bridge.getConsecutiveCrashCount()).toBe(0);
    });

    it('resets consecutiveCrashCount upon successful task completion', async () => {
      vi.useFakeTimers();

      const startP = bridge.start(2000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10001,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });
      await startP;

      // Crash #1
      mockProcess.simulateExit(1);
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Advance 100ms for restart
      vi.advanceTimersByTime(100);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 10002,
        supportedOps: ['CMD_PING', 'CMD_GENERATE_ASSET', 'CMD_SHUTDOWN']
      });

      // Consecutive crash count is NOT reset merely because EVT_READY arrived
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Dispatch an asset task
      const assetPromise = bridge.generateAsset({
        jobType: 'artwork',
        sourceFilePath: 'C:/Music/song.mp3',
        destinationPath: 'C:/Cache/artworks/song.webp'
      });

      await vi.advanceTimersByTimeAsync(0);

      const cmdCall = mockProcess.postMessage.mock.calls.find(
        (c) => (c[0] as MainToWorkerCommand).type === 'CMD_GENERATE_ASSET'
      );
      const taskId = (cmdCall![0] as { taskId: string }).taskId;

      // Simulate worker completing the task successfully
      const completeEvt: EvtAssetComplete = {
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_ASSET_COMPLETE',
        taskId,
        jobType: 'artwork',
        success: true,
        outputFilePath: 'C:/Cache/artworks/song.webp',
        metadata: { width: 50, height: 50 }
      };
      mockProcess.simulateWorkerMessage(completeEvt);

      const result = await assetPromise;
      expect(result.success).toBe(true);

      // Now consecutiveCrashCount MUST be reset to 0
      expect(bridge.getConsecutiveCrashCount()).toBe(0);
    });
  });

  describe('Shutdown / Restart Race Protection', () => {
    it('terminate() must cancel pending restart timer and prevent spawning during shutdown', async () => {
      const { utilityProcess } = await import('electron');
      await completeHandshake(bridge.start(2000), 10001);
      const forksAfterBoot = vi.mocked(utilityProcess.fork).mock.calls.length;

      // Worker crashes -> restart is scheduled
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);

      // Application initiates shutdown before restart timer fires
      await bridge.terminate();

      // Pending restart timer MUST have been cancelled
      expect(bridge.hasPendingRestartTimer()).toBe(false);
      expect(bridge.getState()).toBe('TERMINATED');

      // Wait beyond the backoff delay to verify no new process was spawned
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(forksAfterBoot);
    });
  });

  describe('JobScheduler Integration & Failure Recovery', () => {
    it('Scheduler catches Bridge rejection, increments retries, and retries the job naturally', async () => {
      autoSendReadyOnFork = true;

      let attempts = 0;
      customOnAssetCommand = (cmd) => {
        const c = cmd as { taskId: string; jobType: 'artwork' | 'waveform' };
        if (attempts === 1) {
          // Attempt 1: crash worker while job is executing
          setTimeout(() => {
            mockProcess.simulateExit(1);
          }, 5);
        } else {
          // Attempt 2 (retry): succeed
          setTimeout(() => {
            mockProcess.simulateWorkerMessage({
              protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
              type: 'EVT_ASSET_COMPLETE',
              taskId: c.taskId,
              jobType: c.jobType,
              success: true,
              outputFilePath: 'C:/Cache/test.bin',
              metadata: {}
            });
          }, 5);
        }
      };

      await bridge.start(2000);

      const scheduler = new JobScheduler();
      scheduler.start();

      const jobCompletedPromise = new Promise<void>((resolve) => {
        scheduler.once('JOB_COMPLETED', (job) => {
          if (job.id === 'asset_job_resilience_test') {
            resolve();
          }
        });
      });

      const testJob: Job = {
        id: 'asset_job_resilience_test',
        type: 'test_asset',
        description: 'Testing asset recovery upon worker crash',
        priority: 'normal',
        state: 'queued',
        retries: 0,
        maxRetries: 2,
        execute: async () => {
          attempts++;
          return bridge.generateAsset({
            jobType: 'waveform',
            sourceFilePath: 'C:/Music/test.mp3',
            destinationPath: 'C:/Cache/test.bin'
          });
        }
      };

      scheduler.enqueue(testJob);

      await jobCompletedPromise;

      // Assert that scheduler saw attempt 1 fail, incremented retries, and re-enqueued
      expect(attempts).toBe(2);
      expect(testJob.retries).toBe(1);
      expect(testJob.state).toBe('completed');
      expect(scheduler.getRawMetrics().completedJobs).toBe(1);
      expect(scheduler.getRawMetrics().failedJobs).toBe(0);

      scheduler.dispose();
    });

    it('Job that fails continuously reaches maxRetries and is marked failed without crashing scheduler', async () => {
      autoSendReadyOnFork = true;

      customOnAssetCommand = (cmd) => {
        const c = cmd as { taskId: string; jobType: 'artwork' | 'waveform' };
        setTimeout(() => {
          mockProcess.simulateWorkerMessage({
            protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
            type: 'EVT_ASSET_COMPLETE',
            taskId: c.taskId,
            jobType: c.jobType,
            success: false,
            error: 'Malformed audio header',
            cancelled: false
          });
        }, 5);
      };

      await bridge.start(2000);

      const scheduler = new JobScheduler();
      scheduler.start();

      let attempts = 0;
      let resolveFinalFailure: () => void;
      const failurePromise = new Promise<void>((resolve) => {
        resolveFinalFailure = resolve;
      });

      const failingJob: Job = {
        id: 'fatal_asset_job',
        type: 'test_asset',
        description: 'Permanently failing asset job',
        priority: 'normal',
        state: 'queued',
        retries: 0,
        maxRetries: 2,
        execute: async () => {
          attempts++;
          return bridge.generateAsset({
            jobType: 'waveform',
            sourceFilePath: 'C:/Music/corrupt.mp3',
            destinationPath: 'C:/Cache/corrupt.bin'
          });
        }
      };

      scheduler.on('JOB_FAILED', (job) => {
        if (job.id === 'fatal_asset_job') {
          resolveFinalFailure();
        }
      });

      scheduler.enqueue(failingJob);

      await failurePromise;

      // 1 initial + 2 retries = 3 attempts total
      expect(attempts).toBe(3);
      expect(failingJob.retries).toBe(2);
      expect(failingJob.state).toBe('failed');
      expect(scheduler.getRawMetrics().failedJobs).toBe(1);

      scheduler.dispose();
    });
  });
});
