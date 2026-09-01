import { EventEmitter } from 'events';

import log from '../logger';
import type { Job, JobClass } from './types';

export class JobScheduler extends EventEmitter {
  private interactiveQueue: Job[] = [];
  private backgroundQueue: Job[] = [];
  private maintenanceQueue: Job[] = [];

  private runningJobs = new Map<string, Job>();
  private inFlightJobPromises = new Map<string, Promise<void>>();
  private failedJobsList: Job[] = [];

  // To protect against duplicates across all queues and running state
  private activeJobIds = new Set<string>();
  private deferredTimers = new Map<string, NodeJS.Timeout>();

  private isRunning = false;
  private isDraining = false;

  private concurrencyLimits: Record<JobClass, number> = {
    interactive: 4,
    background: 2,
    maintenance: 1
  };

  // Metrics state
  private completedCount = 0;
  private failedCount = 0;
  private totalExecutionTimeMs = 0;
  private readonly MAX_FAILED_JOBS = 100;

  // Track whether we've already emitted QUEUE_EMPTY to prevent duplicate events
  private isQueueEmptyState = true;
  private pendingMaintenance = false;
  private pendingRetryJobs = new Map<string, { timer: NodeJS.Timeout; job: Job }>();

  constructor(options?: { limits?: Record<JobClass, number> }) {
    super();
    if (options?.limits) {
      this.concurrencyLimits = { ...this.concurrencyLimits, ...options.limits };
    }
  }

  /** Defines the maximum number of concurrent jobs per class. */
  public setConcurrency(limits: Partial<Record<JobClass, number>>) {
    this.concurrencyLimits = { ...this.concurrencyLimits, ...limits };
    this.processNext();
  }

  /** Request maintenance (like Garbage Collection) to be scheduled once the queue becomes empty. */
  public requestMaintenance() {
    this.pendingMaintenance = true;

    // If the queue is already empty and no retry jobs are pending when maintenance is requested,
    // emit immediately so it can start without waiting for another job.
    if (this.isQueueEmptyState && this.runningJobs.size === 0 && this.pendingRetryJobs.size === 0) {
      this.pendingMaintenance = false;
      this.emit('MAINTENANCE_READY');
    }
  }

  /** Enqueues a job. Rejects if the job ID is already active (duplicate protection). */
  public enqueue(job: Job): boolean {
    if (this.isDraining) {
      log.debug(`[JobScheduler] Rejected job ${job.id} because scheduler is shutting down.`);
      return false;
    }

    if (this.activeJobIds.has(job.id)) {
      log.debug(`[JobScheduler] Ignored duplicate job: ${job.id}`);
      return false; // Duplicate rejected
    }

    job.state = 'queued';
    this.activeJobIds.add(job.id);
    this.isQueueEmptyState = false;

    if (job.jobClass === 'interactive') {
      this.interactiveQueue.push(job);
    } else if (job.jobClass === 'maintenance') {
      this.maintenanceQueue.push(job);
    } else {
      this.backgroundQueue.push(job);
    }

    log.debug(`[JobScheduler] Enqueued ${job.jobClass} job: ${job.id}`);
    this.processNext();
    return true;
  }

  /**
   * Schedules a job to be enqueued after a delay. Useful when a job needs to re-check conditions
   * (e.g., album completeness) after its current invocation finishes and its ID is cleared from
   * activeJobIds.
   *
   * If a deferred timer already exists for this job ID, the new timer replaces it. Deferred timers
   * are cancelled during stop() and dispose().
   */
  public scheduleDeferred(job: Job, delayMs: number): void {
    if (this.isDraining) {
      log.debug(
        `[JobScheduler] Rejected deferred job ${job.id} because scheduler is shutting down.`
      );
      return;
    }

    // Cancel any existing deferred timer for this job ID
    const existingTimer = this.deferredTimers.get(job.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.deferredTimers.delete(job.id);
      this.enqueue(job);
    }, delayMs);

    this.deferredTimers.set(job.id, timer);
    log.debug(`[JobScheduler] Scheduled deferred enqueue for ${job.id} in ${delayMs}ms`);
  }

  /**
   * Allows transitioning an already queued background/maintenance job to interactive. Commonly used
   * for Demand-Driven Prioritization (e.g. user scrolled to album).
   */
  public promoteToInteractive(id: string): boolean {
    let index = this.backgroundQueue.findIndex((j) => j.id === id);
    if (index !== -1) {
      const [job] = this.backgroundQueue.splice(index, 1);
      job.jobClass = 'interactive';
      this.interactiveQueue.push(job);
      log.debug(`[JobScheduler] Promoted job to interactive: ${id}`);
      this.processNext();
      return true;
    }

    index = this.maintenanceQueue.findIndex((j) => j.id === id);
    if (index !== -1) {
      const [job] = this.maintenanceQueue.splice(index, 1);
      job.jobClass = 'interactive';
      this.interactiveQueue.push(job);
      log.debug(`[JobScheduler] Promoted job to interactive: ${id}`);
      this.processNext();
      return true;
    }
    return false;
  }

  /** Cancels a specific job. If running, relies on the job's internal cancel() implementation. */
  public cancelJob(id: string): boolean {
    // 1. Cancel if in retry backoff delay
    const pendingRetry = this.pendingRetryJobs.get(id);
    if (pendingRetry) {
      clearTimeout(pendingRetry.timer);
      pendingRetry.job.state = 'cancelled';
      if (pendingRetry.job.cancel) {
        try {
          pendingRetry.job.cancel();
        } catch (e) {
          log.warn(`[JobScheduler] Error cancelling retry job ${id}:`, { error: e });
        }
      }
      this.pendingRetryJobs.delete(id);
      this.activeJobIds.delete(id);
      return true;
    }

    // 2. Remove from queues if queued
    const filterFn = (job: Job) => {
      if (job.id === id) {
        job.state = 'cancelled';
        if (job.cancel) {
          job.cancel();
        }
        return false;
      }
      return true;
    };

    const initialIntLen = this.interactiveQueue.length;
    this.interactiveQueue = this.interactiveQueue.filter(filterFn);

    const initialBgLen = this.backgroundQueue.length;
    this.backgroundQueue = this.backgroundQueue.filter(filterFn);

    const initialMaintLen = this.maintenanceQueue.length;
    this.maintenanceQueue = this.maintenanceQueue.filter(filterFn);

    const wasQueued =
      initialIntLen !== this.interactiveQueue.length ||
      initialBgLen !== this.backgroundQueue.length ||
      initialMaintLen !== this.maintenanceQueue.length;

    // 3. Cancel if running
    const runningJob = this.runningJobs.get(id);
    if (runningJob) {
      runningJob.state = 'cancelled';
      if (runningJob.cancel) {
        runningJob.cancel();
      }
      return true;
    }

    if (wasQueued) {
      this.activeJobIds.delete(id);
      return true;
    }

    return false;
  }

  /** Starts the scheduler processing loop. */
  public start() {
    this.isRunning = true;
    this.isDraining = false;
    this.processNext();
    log.info('[JobScheduler] Started');
  }

  /**
   * Shuts down the scheduler through a two-phase bounded drain: 1. Graceful Drain Phase (up to
   * 15s): Prevents new jobs from starting while waiting for running jobs to complete naturally. 2.
   * Forced Abort & Grace Phase (up to 5s): If jobs survive the drain timeout, broadcasts
   * cancellation (job.state = 'cancelled', job.cancel()) and awaits up to 5 seconds for in-flight
   * promises to settle.
   *
   * Returns surviving job promises that have NOT settled within the grace period. The caller MUST
   * await these (or await a bounded timeout on them) before closing any shared resource (e.g.,
   * database) that jobs depend on.
   */
  public async stop(): Promise<{ survivingJobPromises: Promise<void>[] }> {
    this.isRunning = false;
    this.isDraining = true;
    log.info('[JobScheduler] Draining... waiting for running jobs to finish.');

    for (const { timer, job } of this.pendingRetryJobs.values()) {
      clearTimeout(timer);
      job.state = 'cancelled';
      if (job.cancel) {
        try {
          job.cancel();
        } catch (e) {
          log.warn(`[JobScheduler] Error cancelling retry job ${job.id} during stop:`, {
            error: e
          });
        }
      }
      this.activeJobIds.delete(job.id);
    }
    this.pendingRetryJobs.clear();

    // Cancel any deferred enqueue timers
    for (const timer of this.deferredTimers.values()) {
      clearTimeout(timer);
    }
    this.deferredTimers.clear();

    // 1. Drain wait: wait up to timeout for running jobs to naturally finish
    const timeoutMs = 15000;
    if (this.inFlightJobPromises.size > 0) {
      await Promise.race([
        Promise.allSettled(Array.from(this.inFlightJobPromises.values())),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
      ]);
    }

    let survivingJobPromises: Promise<void>[] = [];

    if (this.inFlightJobPromises.size > 0 || this.runningJobs.size > 0) {
      log.warn(
        `[JobScheduler] Timed out waiting for ${this.runningJobs.size} jobs to finish during drain. Aborting surviving jobs.`
      );
      for (const [id, job] of this.runningJobs.entries()) {
        job.state = 'cancelled';
        if (job.cancel) {
          try {
            job.cancel();
          } catch (e) {
            log.warn(`[JobScheduler] Error cancelling job ${id} during stop:`, { error: e });
          }
        }
      }

      // Snapshot the promises BEFORE clearing tracking.
      // These are the promises the caller must await before closing shared resources.
      survivingJobPromises = Array.from(this.inFlightJobPromises.values());

      // Grace period: wait up to 5s for cancelled jobs to settle
      const GRACE_TIMEOUT_MS = 5000;
      const settleResult = await Promise.race([
        Promise.allSettled(survivingJobPromises).then(() => 'settled' as const),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), GRACE_TIMEOUT_MS))
      ]);

      if (settleResult === 'timeout') {
        log.error(
          `[JobScheduler] ${this.inFlightJobPromises.size} job promises did not settle within ${GRACE_TIMEOUT_MS}ms after cancellation. ` +
            `Returning unsettled promises to caller for write barrier.`
        );
        // Re-snapshot: only return promises that are STILL in-flight
        survivingJobPromises = Array.from(this.inFlightJobPromises.values());
      } else {
        survivingJobPromises = [];
      }

      this.runningJobs.clear();
      this.activeJobIds.clear();
      this.inFlightJobPromises.clear();
    }

    this.isDraining = false;
    log.info('[JobScheduler] Stopped cleanly');
    return { survivingJobPromises };
  }

  /** Completely disposes of the scheduler, cancelling all jobs before unregistering events. */
  public dispose() {
    this.isDraining = true;
    this.isRunning = false;

    for (const { timer, job } of this.pendingRetryJobs.values()) {
      clearTimeout(timer);
      job.state = 'cancelled';
      if (job.cancel) {
        try {
          job.cancel();
        } catch (e) {
          log.warn(`[JobScheduler] Error cancelling retry job ${job.id} during dispose:`, {
            error: e
          });
        }
      }
      this.activeJobIds.delete(job.id);
    }
    this.pendingRetryJobs.clear();

    // Cancel deferred timers
    for (const timer of this.deferredTimers.values()) {
      clearTimeout(timer);
    }
    this.deferredTimers.clear();

    // Clear queues
    this.interactiveQueue = [];
    this.backgroundQueue = [];
    this.maintenanceQueue = [];

    // Cancel running jobs
    for (const [id, job] of this.runningJobs.entries()) {
      job.state = 'cancelled';
      if (job.cancel) {
        try {
          job.cancel();
        } catch (e) {
          log.warn(`[JobScheduler] Error cancelling job ${id} during dispose:`, { error: e });
        }
      }
    }

    this.runningJobs.clear();
    this.activeJobIds.clear();
    this.inFlightJobPromises.clear();
    this.failedJobsList = [];

    // Remove listeners last, so cancellation callbacks can still emit if needed
    this.removeAllListeners();

    log.info('[JobScheduler] Disposed cleanly');
  }

  private getRunningCountByClass(jobClass: JobClass): number {
    let count = 0;
    for (const job of this.runningJobs.values()) {
      if (job.jobClass === jobClass) count++;
    }
    return count;
  }

  private processNext() {
    if (!this.isRunning || this.isDraining) return;

    let startedNewJob = false;
    do {
      startedNewJob = false;

      const intRunning = this.getRunningCountByClass('interactive');
      if (intRunning < this.concurrencyLimits.interactive && this.interactiveQueue.length > 0) {
        const job = this.interactiveQueue.shift()!;
        this.startJob(job);
        startedNewJob = true;
      }

      const bgRunning = this.getRunningCountByClass('background');
      if (bgRunning < this.concurrencyLimits.background && this.backgroundQueue.length > 0) {
        const job = this.backgroundQueue.shift()!;
        this.startJob(job);
        startedNewJob = true;
      }

      const maintRunning = this.getRunningCountByClass('maintenance');
      if (maintRunning < this.concurrencyLimits.maintenance && this.maintenanceQueue.length > 0) {
        const job = this.maintenanceQueue.shift()!;
        this.startJob(job);
        startedNewJob = true;
      }
    } while (startedNewJob);

    // Emit QUEUE_EMPTY if no jobs are running, queues are empty, and no retry jobs are pending
    if (
      this.runningJobs.size === 0 &&
      this.interactiveQueue.length === 0 &&
      this.backgroundQueue.length === 0 &&
      this.maintenanceQueue.length === 0 &&
      this.pendingRetryJobs.size === 0
    ) {
      if (!this.isQueueEmptyState) {
        this.isQueueEmptyState = true;
        this.emit('QUEUE_EMPTY');
      }

      if (this.pendingMaintenance) {
        this.pendingMaintenance = false;
        this.emit('MAINTENANCE_READY');
      }
    } else {
      this.isQueueEmptyState = false;
    }
  }

  private startJob(job: Job) {
    this.runningJobs.set(job.id, job);
    job.state = 'running';
    this.isQueueEmptyState = false;

    const startTime = Date.now();
    this.emit('JOB_STARTED', job);

    // Execute without blocking the loop, but track in-flight promise for deterministic drain
    const jobPromise = this.executeJob(job, startTime);
    this.inFlightJobPromises.set(job.id, jobPromise);
    jobPromise
      .finally(() => {
        this.inFlightJobPromises.delete(job.id);
      })
      .catch(() => {});
  }

  private async executeJob(job: Job, startTime: number) {
    try {
      await job.execute();

      const executionTime = Date.now() - startTime;
      this.totalExecutionTimeMs += executionTime;
      this.completedCount++;

      // If the job was cancelled while it was executing, don't mark as completed
      if (job.state === 'cancelled') {
        return;
      }

      job.state = 'completed';
      this.emit('JOB_COMPLETED', job, executionTime);
    } catch (error) {
      log.error(`[JobScheduler] Job failed: ${job.id}`, { error });

      // If cancelled, don't retry or fail it.
      if (job.state === 'cancelled') {
        return;
      }

      const maxRetries = job.maxRetries ?? 3;
      if (job.retries < maxRetries) {
        job.retries++;
        job.state = 'queued';
        const delayMs = Math.min(500 * Math.pow(2, job.retries - 1), 5000);
        log.warn(
          `[JobScheduler] Scheduling retry ${job.retries}/${maxRetries} for job ${job.id} in ${delayMs}ms.`
        );
        const retryTimer = setTimeout(() => {
          this.pendingRetryJobs.delete(job.id);
          if (this.isDraining || !this.isRunning || job.state === 'cancelled') {
            this.activeJobIds.delete(job.id);
            return;
          }
          if (job.jobClass === 'interactive') {
            this.interactiveQueue.push(job);
          } else if (job.jobClass === 'maintenance') {
            this.maintenanceQueue.push(job);
          } else {
            this.backgroundQueue.push(job);
          }
          this.processNext();
        }, delayMs);
        this.pendingRetryJobs.set(job.id, { timer: retryTimer, job });
      } else {
        job.state = 'failed';
        this.failedCount++;
        this.failedJobsList.push(job);
        if (this.failedJobsList.length > this.MAX_FAILED_JOBS) {
          this.failedJobsList.shift();
        }
        this.emit('JOB_FAILED', job, error);
      }
    } finally {
      this.runningJobs.delete(job.id);
      // We explicitly leave it in activeJobIds if it's running/queued,
      // but remove it once it reaches terminal state (completed/failed/cancelled)
      if (job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled') {
        this.activeJobIds.delete(job.id);
      }

      // Trigger the next job
      this.processNext();
    }
  }

  public getRunningJobs(): Job[] {
    return Array.from(this.runningJobs.values());
  }

  public getRawMetrics() {
    return {
      runningJobs: this.runningJobs.size,
      queuedJobs:
        this.interactiveQueue.length +
        this.backgroundQueue.length +
        this.maintenanceQueue.length +
        this.pendingRetryJobs.size,
      completedJobs: this.completedCount,
      failedJobs: this.failedCount,
      totalExecutionTimeMs: this.totalExecutionTimeMs,
      concurrencyLimits: this.concurrencyLimits
    };
  }

  public getFailedJobs(): Job[] {
    return [...this.failedJobsList];
  }

  public retryRecoverableJobs() {
    const retryable = this.failedJobsList;
    this.failedJobsList = [];
    for (const job of retryable) {
      job.retries = 0;
      job.state = 'queued';
      this.enqueue(job);
    }
  }
}

// Instantiate a single JobScheduler (Singleton Pattern)
// to enforce the "single authority" architectural rule.
export const libraryScheduler = new JobScheduler();
