import { EventEmitter } from 'events';
import type { AlbumTagPreview, AutoTagStage, ProgressEventPayload } from '../../../common/metadata/types';
import type { MetadataApplyService, ApplyResult } from '../services/MetadataApplyService';
import type { MetadataDiagnosticsService } from './MetadataDiagnosticsService';

export interface MetadataJob {
  id: string;
  albumTitle: string;
  artistName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stage: AutoTagStage;
  message: string;
  progressPercent: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  preview: AlbumTagPreview;
  abortController: AbortController;
  isExecuting?: boolean;
}

export class MetadataJobManager extends EventEmitter {
  private readonly jobs: Map<string, MetadataJob> = new Map();
  private readonly queue: string[] = [];
  private readonly activeJobs: Set<string> = new Set();
  private readonly maxConcurrentJobs: number;
  private readonly applyService: MetadataApplyService;
  private readonly diagnosticsService: MetadataDiagnosticsService;

  constructor(
    maxConcurrentJobs = 3,
    applyService?: MetadataApplyService,
    diagnosticsService?: MetadataDiagnosticsService
  ) {
    super();
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.applyService = applyService ?? (new (require('../services/MetadataApplyService').MetadataApplyService)());
    this.diagnosticsService = diagnosticsService ?? (new (require('./MetadataDiagnosticsService').MetadataDiagnosticsService)());
  }

  /**
   * Enqueues a new metadata apply job.
   */
  public createJob(
    jobId: string,
    albumTitle: string,
    artistName: string,
    preview: AlbumTagPreview
  ): MetadataJob {
    const abortController = new AbortController();

    const job: MetadataJob = {
      id: jobId,
      albumTitle,
      artistName,
      status: 'queued',
      stage: 'idle',
      message: 'Job enqueued',
      progressPercent: 0,
      createdAt: Date.now(),
      preview,
      abortController
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);

    this.processQueue();
    return job;
  }

  /**
   * Process the autonomous job queue up to maxConcurrentJobs threshold.
   */
  public processQueue(): void {
    while (this.activeJobs.size < this.maxConcurrentJobs && this.queue.length > 0) {
      const nextJobId = this.queue.shift();
      if (!nextJobId) break;

      const job = this.jobs.get(nextJobId);
      if (job && job.status === 'queued') {
        this.activeJobs.add(nextJobId);
        job.status = 'running';
        job.startedAt = Date.now();

        // Autonomously execute the job in background
        this.executeApplyJob(nextJobId).catch((err) => {
          this.emit('job:error', { jobId: nextJobId, error: err });
        });
      }
    }
  }

  public getJob(jobId: string): MetadataJob | undefined {
    return this.jobs.get(jobId);
  }

  public getActiveJobs(): MetadataJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status === 'queued' || j.status === 'running'
    );
  }

  /**
   * Updates job stage/status and progress percentage.
   * NOTE: Completing, failing, or cancelling a job removes it from activeJobs and automatically calls processQueue() to schedule the next queued job.
   */
  public updateJobProgress(jobId: string, stage: AutoTagStage, message: string, progressPercent?: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = stage === 'completed' ? 'completed' : stage === 'failed' ? 'failed' : stage === 'cancelled' ? 'cancelled' : 'running';
    job.stage = stage;
    job.message = message;
    if (progressPercent !== undefined) {
      job.progressPercent = progressPercent;
    }

    if (stage === 'running' && !job.startedAt) {
      job.startedAt = Date.now();
    }
    if (stage === 'completed' || stage === 'failed' || stage === 'cancelled') {
      job.completedAt = Date.now();
      job.isExecuting = false;
      this.activeJobs.delete(jobId);
      this.processQueue(); // Queue recursion: Schedule next job as active slot opens
    }

    const payload: ProgressEventPayload = {
      stage,
      message,
      progressPercent: job.progressPercent,
      operationId: jobId
    };

    this.emit('progress', payload);
  }

  /**
   * Cancels an active or queued job.
   */
  public cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.abortController.abort();
    this.updateJobProgress(jobId, 'cancelled', 'Job cancelled by user', 0);
  }

  /**
   * Executes a job through MetadataApplyService.
   */
  public async executeApplyJob(jobId: string): Promise<ApplyResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { success: false, updatedCount: 0, failedCount: 0, errors: ['Job not found'] };
    }

    // Duplicate Execution Guard
    if (job.isExecuting) {
      return { success: false, updatedCount: 0, failedCount: 0, errors: ['Job is already executing'] };
    }

    job.isExecuting = true;
    const startTime = Date.now();
    this.updateJobProgress(jobId, 'applying', `Applying metadata updates for ${job.albumTitle}...`, 20);

    try {
      const result = await this.applyService.applyPreview(job.preview, undefined, job.abortController.signal);
      const durationMs = Date.now() - startTime;

      const selectedMatches = job.preview.matches.filter((m) => m.applyTrack);

      // Record Telemetry
      this.diagnosticsService.recordOperation({
        operationId: jobId,
        providerId: job.preview.provider,
        durationMs,
        songsTotal: job.preview.matches.length,
        songsSelected: selectedMatches.length,
        songsUpdated: result.updatedCount,
        warningsCount: job.preview.warnings.length,
        errorsCount: result.errors.length,
        success: result.success
      });

      if (result.success) {
        this.updateJobProgress(jobId, 'completed', `Successfully updated ${result.updatedCount} tracks.`, 100);
      } else {
        const isCancelled = job.abortController.signal.aborted;
        this.updateJobProgress(jobId, isCancelled ? 'cancelled' : 'failed', `Apply failed: ${result.errors.join('; ')}`, 100);
      }

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCancelled = (err instanceof Error && err.name === 'CancelledError') || job.abortController.signal.aborted;

      this.updateJobProgress(jobId, isCancelled ? 'cancelled' : 'failed', msg, 0);

      this.diagnosticsService.recordOperation({
        operationId: jobId,
        providerId: job.preview?.provider,
        durationMs: Date.now() - startTime,
        songsTotal: job.preview?.matches.length ?? 0,
        songsSelected: job.preview?.matches.filter((m) => m.applyTrack).length ?? 0,
        songsUpdated: 0,
        warningsCount: job.preview?.warnings.length ?? 0,
        errorsCount: 1,
        success: false
      });

      return {
        success: false,
        updatedCount: 0,
        failedCount: job.preview?.matches.length ?? 0,
        errors: [msg]
      };
    }
  }

  /**
   * Clean completed/cancelled jobs keeping only recent maxRetainedJobs (LRU eviction).
   */
  public cleanCompletedJobs(maxAgeMs = 24 * 60 * 60 * 1000, maxRetainedJobs = 50): void {
    const now = Date.now();
    const finished = Array.from(this.jobs.values())
      .filter((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    // Keep top maxRetainedJobs recent jobs, delete older or expired ones
    finished.forEach((job, index) => {
      const age = now - (job.completedAt ?? job.createdAt);
      if (index >= maxRetainedJobs || age > maxAgeMs) {
        this.jobs.delete(job.id);
      }
    });
  }
}
