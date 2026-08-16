import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobScheduler } from '../jobScheduler';
import type { Job, JobClass, JobState } from '../types';

class MockJob implements Job {
  public id: string;
  public type = 'mock_job';
  public state: JobState = 'queued';
  public jobClass: JobClass;
  public retries = 0;
  public maxRetries?: number;
  public description: string;
  public executeFn: () => Promise<void>;
  public cancelFn?: () => void;

  constructor(
    id: string,
    jobClass: JobClass = 'background',
    executeFn: () => Promise<void> = async () => {},
    maxRetries = 2
  ) {
    this.id = id;
    this.jobClass = jobClass;
    this.description = `Mock job ${id}`;
    this.executeFn = executeFn;
    this.maxRetries = maxRetries;
  }

  async execute(): Promise<void> {
    await this.executeFn();
  }

  cancel(): void {
    if (this.cancelFn) this.cancelFn();
  }
}

describe('JobScheduler', () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    scheduler = new JobScheduler({
      limits: {
        interactive: 2,
        background: 2,
        maintenance: 1
      }
    });
  });

  describe('Enqueue & Duplicate Protection', () => {
    it('should enqueue new jobs and reject duplicates with same ID', () => {
      const job1 = new MockJob('job_1', 'background');
      const duplicateJob = new MockJob('job_1', 'interactive');

      expect(scheduler.enqueue(job1)).toBe(true);
      expect(scheduler.enqueue(duplicateJob)).toBe(false);
    });

    it('should reject jobs when draining / shutting down', async () => {
      const runningJob = new MockJob('job_running', 'interactive', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      scheduler.start();
      scheduler.enqueue(runningJob);

      await new Promise((resolve) => setTimeout(resolve, 10)); // wait for job to start running

      const stopPromise = scheduler.stop();
      const job = new MockJob('job_drain', 'background');

      expect(scheduler.enqueue(job)).toBe(false);
      await stopPromise;
    });
  });

  describe('Priority & Concurrency', () => {
    it('should prioritize interactive jobs over background jobs', async () => {
      const executionOrder: string[] = [];

      let resolveJobA: () => void;
      let resolveJobB: () => void;

      const jobA = new MockJob('job_bg', 'background', async () => {
        executionOrder.push('job_bg');
      });

      const jobB = new MockJob('job_interactive', 'interactive', async () => {
        executionOrder.push('job_interactive');
      });

      // Enqueue background first, then interactive while stopped
      scheduler.enqueue(jobA);
      scheduler.enqueue(jobB);

      scheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executionOrder[0]).toBe('job_interactive');
      expect(executionOrder[1]).toBe('job_bg');
    });

    it('should promote background job to interactive queue with promoteToInteractive', () => {
      const job = new MockJob('promo_1', 'background');
      scheduler.enqueue(job);

      expect(scheduler.promoteToInteractive('promo_1')).toBe(true);
      expect(job.jobClass).toBe('interactive');
    });

    it('should respect concurrency limits per jobClass', async () => {
      scheduler.start();

      let activeCount = 0;
      let maxObservedActive = 0;

      const createBlockingJob = (id: string) =>
        new MockJob(id, 'background', async () => {
          activeCount++;
          if (activeCount > maxObservedActive) maxObservedActive = activeCount;
          await new Promise((resolve) => setTimeout(resolve, 30));
          activeCount--;
        });

      scheduler.enqueue(createBlockingJob('b1'));
      scheduler.enqueue(createBlockingJob('b2'));
      scheduler.enqueue(createBlockingJob('b3'));
      scheduler.enqueue(createBlockingJob('b4'));

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(maxObservedActive).toBeLessThanOrEqual(2);
    });
  });

  describe('Retries & Error Handling', () => {
    it('should retry failed jobs up to maxRetries before emitting JOB_FAILED', async () => {
      let attempts = 0;
      const job = new MockJob('retry_job', 'interactive', async () => {
        attempts++;
        throw new Error(`Failure on attempt ${attempts}`);
      }, 2); // maxRetries = 2 (3 total attempts: initial + 2 retries)

      const failedSpy = vi.fn();
      scheduler.on('JOB_FAILED', failedSpy);

      scheduler.start();
      scheduler.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(attempts).toBe(3);
      expect(job.state).toBe('failed');
      expect(failedSpy).toHaveBeenCalledWith(job, expect.any(Error));
      expect(scheduler.getFailedJobs()).toContain(job);
    });

    it('should re-enqueue failed jobs when retryRecoverableJobs is called', async () => {
      let fail = true;
      const job = new MockJob('recoverable_job', 'interactive', async () => {
        if (fail) throw new Error('First run fail');
      }, 0); // maxRetries = 0 -> fails immediately

      scheduler.start();
      scheduler.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(scheduler.getFailedJobs()).toHaveLength(1);

      fail = false;
      scheduler.retryRecoverableJobs();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(scheduler.getFailedJobs()).toHaveLength(0);
      expect(job.state).toBe('completed');
    });
  });

  describe('Cancellation & Disposal', () => {
    it('should cancel queued jobs without executing them', () => {
      const execSpy = vi.fn();
      const job = new MockJob('cancel_queued', 'background', async () => {
        execSpy();
      });

      scheduler.enqueue(job);
      expect(scheduler.cancelJob('cancel_queued')).toBe(true);

      scheduler.start();
      expect(execSpy).not.toHaveBeenCalled();
    });

    it('should invoke cancel() on running jobs when cancelled', async () => {
      const cancelSpy = vi.fn();
      const job = new MockJob('cancel_running', 'interactive', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      job.cancelFn = cancelSpy;

      scheduler.start();
      scheduler.enqueue(job);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(scheduler.cancelJob('cancel_running')).toBe(true);

      expect(job.state).toBe('cancelled');
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should dispose cleanly by cancelling active jobs and clearing queues', () => {
      const job = new MockJob('dispose_job', 'background');
      scheduler.enqueue(job);

      scheduler.dispose();

      const metrics = scheduler.getRawMetrics();
      expect(metrics.queuedJobs).toBe(0);
      expect(metrics.runningJobs).toBe(0);
    });
  });

  describe('Lifecycle Events & Maintenance', () => {
    it('should emit QUEUE_EMPTY when all jobs complete', async () => {
      const queueEmptySpy = vi.fn();
      scheduler.on('QUEUE_EMPTY', queueEmptySpy);

      scheduler.start();
      scheduler.enqueue(new MockJob('quick_1', 'interactive'));
      scheduler.enqueue(new MockJob('quick_2', 'background'));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(queueEmptySpy).toHaveBeenCalled();
    });

    it('should emit MAINTENANCE_READY when requestMaintenance is called and queue is empty', () => {
      const maintSpy = vi.fn();
      scheduler.on('MAINTENANCE_READY', maintSpy);

      scheduler.requestMaintenance();

      expect(maintSpy).toHaveBeenCalled();
    });
  });
});
