import { EventEmitter } from 'events';
import type { Job } from './types';
import log from '../logger';



export class JobScheduler extends EventEmitter {
  private highPriorityQueue: Job[] = [];
  private normalPriorityQueue: Job[] = [];
  private lowPriorityQueue: Job[] = [];
  private runningJobs = new Map<string, Job>();
  private failedJobsList: Job[] = [];
  
  // To protect against duplicates across all queues and running state
  private activeJobIds = new Set<string>();

  private isRunning = false;
  private isDraining = false;
  private maxConcurrency = 4;

  // Metrics state
  private completedCount = 0;
  private failedCount = 0;
  private totalExecutionTimeMs = 0;
  private readonly MAX_FAILED_JOBS = 100;
  
  // Track whether we've already emitted QUEUE_EMPTY to prevent duplicate events
  private isQueueEmptyState = true;

  constructor(options?: { maxConcurrency?: number }) {
    super();
    if (options?.maxConcurrency) {
      this.maxConcurrency = options.maxConcurrency;
    }
  }

  /**
   * Defines the maximum number of concurrent jobs.
   * Can be configured dynamically per job type later if needed.
   */
  public setConcurrency(limit: number) {
    this.maxConcurrency = limit;
    this.processNext();
  }

  /**
   * Enqueues a job. Rejects if the job ID is already active (duplicate protection).
   */
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

    if (job.priority === 'high') {
      this.highPriorityQueue.push(job);
    } else if (job.priority === 'low') {
      this.lowPriorityQueue.push(job);
    } else {
      this.normalPriorityQueue.push(job);
    }

    log.debug(`[JobScheduler] Enqueued ${job.priority} priority job: ${job.id}`);
    this.processNext();
    return true;
  }

  /**
   * Allows transitioning an already queued normal priority job to high priority.
   * Commonly used for Demand-Driven Prioritization (e.g. user scrolled to album).
   */
  public prioritizeJob(id: string): boolean {
    let index = this.normalPriorityQueue.findIndex(j => j.id === id);
    if (index !== -1) {
      const [job] = this.normalPriorityQueue.splice(index, 1);
      job.priority = 'high';
      this.highPriorityQueue.push(job);
      log.debug(`[JobScheduler] Reprioritized job to high: ${id}`);
      this.processNext();
      return true;
    }

    index = this.lowPriorityQueue.findIndex(j => j.id === id);
    if (index !== -1) {
      const [job] = this.lowPriorityQueue.splice(index, 1);
      job.priority = 'high';
      this.highPriorityQueue.push(job);
      log.debug(`[JobScheduler] Reprioritized job to high: ${id}`);
      this.processNext();
      return true;
    }
    return false;
  }

  /**
   * Cancels a specific job. If running, relies on the job's internal cancel() implementation.
   */
  public cancelJob(id: string): boolean {
    // 1. Remove from queues
    const filterFn = (j: Job) => j.id !== id;
    
    const initialHighLen = this.highPriorityQueue.length;
    this.highPriorityQueue = this.highPriorityQueue.filter(filterFn);
    
    const initialNormalLen = this.normalPriorityQueue.length;
    this.normalPriorityQueue = this.normalPriorityQueue.filter(filterFn);

    const initialLowLen = this.lowPriorityQueue.length;
    this.lowPriorityQueue = this.lowPriorityQueue.filter(filterFn);

    const wasQueued = (initialHighLen !== this.highPriorityQueue.length) || 
                      (initialNormalLen !== this.normalPriorityQueue.length) ||
                      (initialLowLen !== this.lowPriorityQueue.length);
    
    // 2. Cancel if running
    const runningJob = this.runningJobs.get(id);
    if (runningJob) {
      runningJob.state = 'cancelled';
      if (runningJob.cancel) {
        runningJob.cancel();
      }
      this.runningJobs.delete(id);
      this.activeJobIds.delete(id);
      this.processNext();
      return true;
    }

    if (wasQueued) {
      this.activeJobIds.delete(id);
      return true;
    }

    return false;
  }

  /**
   * Starts the scheduler processing loop.
   */
  public start() {
    this.isRunning = true;
    this.isDraining = false;
    this.processNext();
    log.info('[JobScheduler] Started');
  }

  /**
   * Gracefully shuts down the scheduler, preventing new jobs from starting
   * while letting existing ones finish.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.isDraining = true;
    log.info('[JobScheduler] Draining... waiting for running jobs to finish.');

    // Simple wait until all running jobs complete
    while (this.runningJobs.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isDraining = false;
    log.info('[JobScheduler] Stopped cleanly');
  }

  /**
   * Completely disposes of the scheduler, cancelling all jobs before unregistering events.
   */
  public dispose() {
    this.isDraining = true;
    this.isRunning = false;
    
    // Clear queues
    this.highPriorityQueue = [];
    this.normalPriorityQueue = [];
    this.lowPriorityQueue = [];
    
    // Cancel running jobs
    for (const [id, job] of this.runningJobs.entries()) {
      job.state = 'cancelled';
      if (job.cancel) {
        try {
          job.cancel();
        } catch (e) {
          log.warn(`[JobScheduler] Error cancelling job ${id} during dispose:`, e);
        }
      }
    }
    
    this.runningJobs.clear();
    this.activeJobIds.clear();
    this.failedJobsList = [];
    
    // Remove listeners last, so cancellation callbacks can still emit if needed
    this.removeAllListeners();
    
    log.info('[JobScheduler] Disposed cleanly');
  }

  private async processNext() {
    if (!this.isRunning || this.isDraining) return;

    // Fill all available worker slots
    while (this.runningJobs.size < this.maxConcurrency) {
      // Pull from High Priority first
      let job = this.highPriorityQueue.shift();
      if (!job) {
        job = this.normalPriorityQueue.shift();
      }
      if (!job) {
        job = this.lowPriorityQueue.shift();
      }

      if (!job) break; // Queues are empty

      this.runningJobs.set(job.id, job);
      job.state = 'running';
      this.isQueueEmptyState = false;
      
      const startTime = Date.now();
      this.emit('JOB_STARTED', job);

      // Execute without blocking the while loop
      this.executeJob(job, startTime);
    }
    
    // Emit QUEUE_EMPTY if no jobs are running and queues are empty
    if (this.runningJobs.size === 0 && 
        this.highPriorityQueue.length === 0 && 
        this.normalPriorityQueue.length === 0 && 
        this.lowPriorityQueue.length === 0) {
      if (!this.isQueueEmptyState) {
        this.isQueueEmptyState = true;
        this.emit('QUEUE_EMPTY');
      }
    }
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
      // Removed ASSET_CREATED here; the job plugin itself should emit business events.

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
        // Re-enqueue as high priority to try and flush it? Or normal. We'll use existing priority.
        if (job.priority === 'high') {
          this.highPriorityQueue.push(job);
        } else if (job.priority === 'low') {
          this.lowPriorityQueue.push(job);
        } else {
          this.normalPriorityQueue.push(job);
        }
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
      queuedJobs: this.highPriorityQueue.length + this.normalPriorityQueue.length + this.lowPriorityQueue.length,
      completedJobs: this.completedCount,
      failedJobs: this.failedCount,
      totalExecutionTimeMs: this.totalExecutionTimeMs,
      maxWorkers: this.maxConcurrency
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
