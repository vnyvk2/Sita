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

  it('schedules retries with backoff and marks job failed after reaching maxRetries', async () => {
    vi.useFakeTimers();
    let executionAttempts = 0;
    const mockJob: Job = {
      id: 'test_retry_backoff',
      type: 'test',
      description: 'Test retry job',
      priority: 'normal',
      state: 'queued',
      retries: 0,
      maxRetries: 2,
      execute: async () => {
        executionAttempts++;
        throw new Error('Deterministic test error');
      }
    };

    const failedSpy = vi.fn();
    scheduler.on('JOB_FAILED', failedSpy);

    scheduler.enqueue(mockJob);
    scheduler.start();

    // Initial attempt runs immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(executionAttempts).toBe(1);
    expect(mockJob.retries).toBe(1);
    expect(scheduler.getRawMetrics().failedJobs).toBe(0);
    expect(scheduler.getRawMetrics().queuedJobs).toBe(1);

    // Advance 500ms for Retry 1
    await vi.advanceTimersByTimeAsync(500);
    expect(executionAttempts).toBe(2);
    expect(mockJob.retries).toBe(2);
    expect(scheduler.getRawMetrics().failedJobs).toBe(0);

    // Advance 1000ms for Retry 2 (permanent failure after maxRetries)
    await vi.advanceTimersByTimeAsync(1000);
    expect(executionAttempts).toBe(3); // Initial + retry 1 + retry 2 = 3 attempts
    expect(mockJob.retries).toBe(2);
    expect(mockJob.state).toBe('failed');
    expect(failedSpy).toHaveBeenCalledWith(mockJob, expect.any(Error));

    vi.useRealTimers();
  });

  it('should cancel a job that is currently waiting in retry backoff and clean up activeJobIds', async () => {
    vi.useFakeTimers();
    let executionAttempts = 0;
    const mockJob: Job = {
      id: 'test_cancel_during_retry',
      type: 'test',
      description: 'Test cancel in retry',
      priority: 'normal',
      state: 'queued',
      retries: 0,
      maxRetries: 3,
      execute: async () => {
        executionAttempts++;
        throw new Error('Fail once');
      }
    };

    scheduler.enqueue(mockJob);
    scheduler.start();

    // Attempt 1 runs immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(executionAttempts).toBe(1);
    expect(mockJob.retries).toBe(1);

    // Cancel while waiting in backoff
    const cancelled = scheduler.cancelJob('test_cancel_during_retry');
    expect(cancelled).toBe(true);
    expect(mockJob.state).toBe('cancelled');
    expect(scheduler.getRawMetrics().queuedJobs).toBe(0);

    // Advance past retry delay to verify attempt 2 never runs
    await vi.advanceTimersByTimeAsync(1000);
    expect(executionAttempts).toBe(1);

    // Verify it can now be enqueued again cleanly because activeJobIds was cleared
    const reEnqueued = scheduler.enqueue({ ...mockJob, retries: 0, state: 'queued' });
    expect(reEnqueued).toBe(true);

    vi.useRealTimers();
  });

  it('does not emit QUEUE_EMPTY or MAINTENANCE_READY while a retry job is waiting in backoff delay', async () => {
    vi.useFakeTimers();
    let executionAttempts = 0;
    const mockJob: Job = {
      id: 'test_retry_queue_empty',
      type: 'test',
      description: 'Test retry queue empty',
      priority: 'normal',
      state: 'queued',
      retries: 0,
      maxRetries: 1,
      execute: async () => {
        executionAttempts++;
        if (executionAttempts === 1) {
          throw new Error('Fail once then succeed');
        }
      }
    };

    const queueEmptySpy = vi.fn();
    const maintenanceReadySpy = vi.fn();
    scheduler.on('QUEUE_EMPTY', queueEmptySpy);
    scheduler.on('MAINTENANCE_READY', maintenanceReadySpy);

    scheduler.enqueue(mockJob);
    scheduler.start();
    scheduler.requestMaintenance();

    // Run attempt 1 (fails and enters 500ms retry backoff)
    await vi.advanceTimersByTimeAsync(0);
    expect(executionAttempts).toBe(1);
    expect(mockJob.retries).toBe(1);

    // Invariant: While retry is sleeping, QUEUE_EMPTY and MAINTENANCE_READY must NOT be emitted
    expect(queueEmptySpy).not.toHaveBeenCalled();
    expect(maintenanceReadySpy).not.toHaveBeenCalled();

    // Advance 500ms -> retry runs and completes
    await vi.advanceTimersByTimeAsync(500);
    expect(executionAttempts).toBe(2);
    expect(mockJob.state).toBe('completed');

    // Invariant: Once all retries complete, QUEUE_EMPTY and MAINTENANCE_READY are emitted
    expect(queueEmptySpy).toHaveBeenCalled();
    expect(maintenanceReadySpy).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
