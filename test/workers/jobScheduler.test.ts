import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobScheduler } from '../../src/main/workers/jobScheduler';
import type { Job } from '../../src/main/workers/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('JobScheduler', () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    scheduler = new JobScheduler();
    scheduler.setConcurrency({ interactive: 2, background: 1, maintenance: 1 });
    scheduler.start();
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  it('should execute a job successfully', async () => {
    const executeMock = vi.fn().mockResolvedValue(undefined);
    const job: Job = {
      id: 'test_1',
      type: 'test',
      jobClass: 'interactive',
      state: 'queued',
      retries: 0,
      execute: executeMock,
    };

    const promise = new Promise<void>((resolve) => {
      scheduler.on('JOB_COMPLETED', (completedJob) => {
        if (completedJob.id === 'test_1') resolve();
      });
    });

    scheduler.enqueue(job);
    await promise;

    expect(executeMock).toHaveBeenCalledOnce();
    const metrics = scheduler.getRawMetrics();
    expect(metrics.completedJobs).toBe(1);
    expect(metrics.runningJobs).toBe(0);
    expect(metrics.queuedJobs).toBe(0);
  });

  it('should prevent duplicate jobs by ID', async () => {
    const executeMock = vi.fn().mockImplementation(async () => {
      await sleep(50);
    });

    const job1: Job = {
      id: 'duplicate_1',
      type: 'test',
      jobClass: 'interactive',
      state: 'queued',
      retries: 0,
      execute: executeMock,
    };

    const job2: Job = {
      id: 'duplicate_1', // SAME ID
      type: 'test',
      jobClass: 'interactive',
      state: 'queued',
      retries: 0,
      execute: executeMock,
    };

    const enqueued1 = scheduler.enqueue(job1);
    const enqueued2 = scheduler.enqueue(job2);

    expect(enqueued1).toBe(true);
    expect(enqueued2).toBe(false); // Second one rejected

    await sleep(100);
    expect(executeMock).toHaveBeenCalledOnce();
  });

  it('should process high priority jobs before normal priority', async () => {
    // Pause processing to allow queueing
    await scheduler.stop();

    const executionOrder: string[] = [];

    const createJob = (id: string, priority: 'high' | 'normal'): Job => ({
      id,
      type: 'test',
      jobClass: priority === 'high' ? 'interactive' : 'background',
      state: 'queued',
      retries: 0,
      execute: async () => {
        executionOrder.push(id);
      },
    });

    scheduler.enqueue(createJob('normal_1', 'normal'));
    scheduler.enqueue(createJob('high_1', 'high'));
    scheduler.enqueue(createJob('normal_2', 'normal'));
    scheduler.enqueue(createJob('high_2', 'high'));

    const promise = new Promise<void>((resolve) => {
      let completed = 0;
      scheduler.on('JOB_COMPLETED', () => {
        completed++;
        if (completed === 4) resolve();
      });
    });

    scheduler.start();
    await promise;

    expect(executionOrder).toEqual(['high_1', 'normal_1', 'high_2', 'normal_2']);
  });

  it('should correctly handle job cancellation (fake 100, cancel 50)', async () => {
    // Stop processing to queue everything
    await scheduler.stop();

    const executeMock = vi.fn().mockResolvedValue(undefined);

    // Queue 100
    for (let i = 0; i < 100; i++) {
      scheduler.enqueue({
        id: `job_${i}`,
        type: 'test',
        jobClass: 'interactive',
        state: 'queued',
        retries: 0,
        execute: executeMock,
      });
    }

    // Cancel 50
    for (let i = 0; i < 50; i++) {
      const success = scheduler.cancelJob(`job_${i}`);
      expect(success).toBe(true);
    }

    const promise = new Promise<void>((resolve) => {
      let completed = 0;
      scheduler.on('JOB_COMPLETED', () => {
        completed++;
        if (completed === 50) resolve();
      });
    });

    scheduler.start();
    await promise;

    // We queued 100, cancelled 50, so execute should only be called 50 times.
    expect(executeMock).toHaveBeenCalledTimes(50);
  });

  it('should strictly respect maxConcurrency limit', async () => {
    // We expect exactly 2 jobs running simultaneously
    const maxAllowedConcurrency = 2;
    
    // Stop the running scheduler from beforeEach
    await scheduler.stop();
    // Restart with a strict limit
    scheduler = new JobScheduler();
    scheduler.setConcurrency({ interactive: maxAllowedConcurrency, background: 1, maintenance: 1 });
    scheduler.start();

    let maxSimultaneous = 0;
    let currentlyRunning = 0;

    const executeMock = vi.fn().mockImplementation(async () => {
      currentlyRunning++;
      if (currentlyRunning > maxSimultaneous) {
        maxSimultaneous = currentlyRunning;
      }
      // Hold the slot open for a bit to ensure overlap
      await sleep(20);
      currentlyRunning--;
    });

    const totalJobs = 20;

    // Queue them up
    for (let i = 0; i < totalJobs; i++) {
      scheduler.enqueue({
        id: `conc_job_${i}`,
        type: 'test',
        jobClass: 'interactive',
        state: 'queued',
        retries: 0,
        execute: executeMock,
      });
    }

    const promise = new Promise<void>((resolve) => {
      let completed = 0;
      scheduler.on('JOB_COMPLETED', () => {
        completed++;
        if (completed === totalJobs) resolve();
      });
    });

    await promise;

    expect(executeMock).toHaveBeenCalledTimes(totalJobs);
    expect(maxSimultaneous).toBe(maxAllowedConcurrency);
  });
});
