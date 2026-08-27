import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobScheduler } from '../../../../src/main/workers/jobScheduler';
import type { Job } from '../../../../src/main/workers/types';

describe('JobScheduler', () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    scheduler = new JobScheduler({ maxConcurrency: 2 });
  });

  afterEach(() => {
    scheduler.dispose();
  });

  it('should emit JOB_STARTED and QUEUE_EMPTY events', async () => {
    const jobStartedSpy = vi.fn();
    const queueEmptySpy = vi.fn();

    scheduler.on('JOB_STARTED', jobStartedSpy);
    scheduler.on('QUEUE_EMPTY', queueEmptySpy);

    const mockJob: Job = {
      id: 'test_1',
      type: 'test',
      description: 'Test job',
      priority: 'normal',
      state: 'queued',
      retries: 0,
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    scheduler.enqueue(mockJob);
    scheduler.start();

    // Wait for the job to complete
    await new Promise(resolve => {
      scheduler.on('QUEUE_EMPTY', resolve);
    });

    expect(jobStartedSpy).toHaveBeenCalledWith(mockJob);
    expect(queueEmptySpy).toHaveBeenCalled();
  });

  it('should not re-enqueue a job if it is cancelled while executing', async () => {
    let rejectJob: (err: Error) => void;
    
    const mockJob: Job = {
      id: 'test_cancel',
      type: 'test',
      description: 'Test cancel job',
      priority: 'normal',
      state: 'queued',
      retries: 0,
      execute: () => {
        return new Promise((resolve, reject) => {
          rejectJob = reject;
        });
      },
      cancel: vi.fn()
    };

    scheduler.enqueue(mockJob);
    scheduler.start();

    // Give it a moment to start running
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    // Job is now running, so we cancel it
    scheduler.cancelJob('test_cancel');

    // The job's promise rejects
    rejectJob!(new Error('Aborted'));
    
    // Give it a moment to hit the catch block
    await new Promise((resolve) => setTimeout(resolve, 10));
    
    const metrics = scheduler.getRawMetrics();
    expect(metrics.queuedJobs).toBe(0);
    expect(metrics.runningJobs).toBe(0);
    // Because it was cancelled, it shouldn't count as failed or completed
    expect(metrics.failedJobs).toBe(0);
    expect(metrics.completedJobs).toBe(0);
  });
});
