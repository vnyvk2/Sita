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
  public postMessage = vi.fn((msg?: { type?: string }) => {
    if (msg?.type === 'CMD_SHUTDOWN') {
      setTimeout(() => this.simulateExit(0), 5);
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

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'C:/mock/app',
    getPath: () => 'C:/mock/userData'
  },
  utilityProcess: {
    fork: vi.fn(() => {
      mockProcess = new MockUtilityProcess(nextPid++);
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
    bridge = new MediaWorkerBridge();
    bridge.resetSupervisionStateForTesting();
  });

  afterEach(async () => {
    autoSendReadyOnFork = false;
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

  describe('Rolling 60s Crash Window & Exact Crash Threshold', () => {
    it('should auto-restart on crashes 1, 2, and 3, but suppress restart on crash 4 within 60s', async () => {
      // 1. Boot worker
      await completeHandshake(bridge.start(2000), 10001);
      expect(bridge.getState()).toBe('READY');

      // Crash #1 -> schedules restart with backoff
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(bridge.getConsecutiveCrashCount()).toBe(1);
      expect(bridge.getCrashTimestamps()).toHaveLength(1);

      // Complete restart #1
      await completeHandshake(bridge.start(2000), 10002);
      expect(bridge.getState()).toBe('READY');

      // Crash #2 -> schedules restart with backoff
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(bridge.getConsecutiveCrashCount()).toBe(2);
      expect(bridge.getCrashTimestamps()).toHaveLength(2);

      // Complete restart #2
      await completeHandshake(bridge.start(2000), 10003);
      expect(bridge.getState()).toBe('READY');

      // Crash #3 -> schedules restart with backoff
      mockProcess.simulateExit(1);
      expect(bridge.hasPendingRestartTimer()).toBe(true);
      expect(bridge.getConsecutiveCrashCount()).toBe(3);
      expect(bridge.getCrashTimestamps()).toHaveLength(3);

      // Complete restart #3
      await completeHandshake(bridge.start(2000), 10004);
      expect(bridge.getState()).toBe('READY');

      // Crash #4 within rolling 60s -> MUST NOT RESTART
      const crashLimitSpy = vi.fn();
      bridge.once('crash_limit_exceeded', crashLimitSpy);

      mockProcess.simulateExit(1);

      expect(crashLimitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ code: 1, crashCount: 4 })
      );
      expect(bridge.getState()).toBe('CRASHED');
      expect(bridge.hasPendingRestartTimer()).toBe(false);
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

  describe('Single-Flight Startup & Restart', () => {
    it('concurrent start() calls await the same startup promise without spawning duplicate processes', async () => {
      const { utilityProcess } = await import('electron');
      const initialForks = vi.mocked(utilityProcess.fork).mock.calls.length;

      // Dispatch 3 concurrent start calls
      const p1 = bridge.start(2000);
      const p2 = bridge.start(2000);
      const p3 = bridge.start(2000);

      // Exactly 1 fork call should have been initiated
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(initialForks + 1);

      // Complete handshake
      await completeHandshake(p1, 10001);
      await Promise.all([p2, p3]);

      expect(bridge.getState()).toBe('READY');
      expect(vi.mocked(utilityProcess.fork).mock.calls.length).toBe(initialForks + 1);
    });
  });

  describe('Consecutive Backoff & Task Completion Reset', () => {
    it('resets consecutiveCrashCount only upon successful task completion', async () => {
      await completeHandshake(bridge.start(2000), 10001);

      // Crash #1
      mockProcess.simulateExit(1);
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Restart worker
      await completeHandshake(bridge.start(2000), 10002);

      // Consecutive crash count is NOT reset merely because EVT_READY arrived
      expect(bridge.getConsecutiveCrashCount()).toBe(1);

      // Dispatch an asset task
      const assetPromise = bridge.generateAsset({
        jobType: 'artwork',
        sourceFilePath: 'C:/Music/song.mp3',
        destinationPath: 'C:/Cache/artworks/song.webp'
      });

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

  describe('JobScheduler Integration & Failure Recovery', () => {
    it('Scheduler catches Bridge rejection, increments retries, and retries the job naturally', async () => {
      autoSendReadyOnFork = true;
      await bridge.start(2000);

      const scheduler = new JobScheduler();
      scheduler.start();

      let attempts = 0;
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
          if (attempts === 1) {
            // First attempt: dispatch to bridge, but worker crashes mid-task
            const p = bridge.generateAsset({
              jobType: 'waveform',
              sourceFilePath: 'C:/Music/test.mp3',
              destinationPath: 'C:/Cache/test.bin'
            });
            setTimeout(() => {
              mockProcess.simulateExit(1);
            }, 10);
            return p;
          } else {
            // Retry attempt: succeeds
            const p = bridge.generateAsset({
              jobType: 'waveform',
              sourceFilePath: 'C:/Music/test.mp3',
              destinationPath: 'C:/Cache/test.bin'
            });
            setTimeout(() => {
              const cmdCall = mockProcess.postMessage.mock.calls[mockProcess.postMessage.mock.calls.length - 1];
              const taskId = (cmdCall[0] as { taskId: string }).taskId;
              mockProcess.simulateWorkerMessage({
                protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
                type: 'EVT_ASSET_COMPLETE',
                taskId,
                jobType: 'waveform',
                success: true,
                outputFilePath: 'C:/Cache/test.bin',
                metadata: {}
              });
            }, 20);
            return p;
          }
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
          const p = bridge.generateAsset({
            jobType: 'waveform',
            sourceFilePath: 'C:/Music/corrupt.mp3',
            destinationPath: 'C:/Cache/corrupt.bin'
          });
          setTimeout(() => {
            const cmdCall = mockProcess.postMessage.mock.calls[mockProcess.postMessage.mock.calls.length - 1];
            const taskId = (cmdCall[0] as { taskId: string }).taskId;
            mockProcess.simulateWorkerMessage({
              protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
              type: 'EVT_ASSET_COMPLETE',
              taskId,
              jobType: 'waveform',
              success: false,
              error: 'Malformed audio header',
              cancelled: false
            });
          }, 10);
          return p;
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
