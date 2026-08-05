import { EventEmitter } from 'events';
import type { AlbumTagPreview, AutoTagStage, ProgressEventPayload, TrackMatchPreview } from '../../../common/metadata/types';
import { MetadataApplyService, type ApplyResult } from '../services/MetadataApplyService';
import { MetadataDiagnosticsService } from './MetadataDiagnosticsService';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MetadataJob {
  jobId: string;
  albumTitle: string;
  artistName?: string;
  status: JobStatus;
  stage: AutoTagStage;
  progressPercent: number;
  message: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  abortController: AbortController;
  preview?: AlbumTagPreview;
}

export class MetadataJobManager extends EventEmitter {
  private readonly jobs: Map<string, MetadataJob> = new Map();
  private readonly queue: string[] = [];
  private readonly activeJobs: Set<string> = new Set();
  private readonly maxConcurrentJobs: number;
  private readonly diagnosticsService: MetadataDiagnosticsService;

  constructor(maxConcurrentJobs = 3, diagnosticsService?: MetadataDiagnosticsService) {
    super();
    this.maxConcurrentJobs = maxConcurrentJobs;
    this.diagnosticsService = diagnosticsService ?? new MetadataDiagnosticsService();
  }

  public get diagnostics(): MetadataDiagnosticsService {
    return this.diagnosticsService;
  }

  public createJob(jobId: string, albumTitle: string, artistName?: string, preview?: AlbumTagPreview): MetadataJob {
    if (this.jobs.has(jobId)) {
      return this.jobs.get(jobId)!;
    }

    const job: MetadataJob = {
      jobId,
      albumTitle,
      artistName,
      status: 'queued',
      stage: 'idle',
      progressPercent: 0,
      message: 'Job queued in background',
      createdAt: Date.now(),
      abortController: new AbortController(),
      preview
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.emit('job:created', job);

    this.processQueue();
    return job;
  }

  public getJob(jobId: string): MetadataJob | undefined {
    return this.jobs.get(jobId);
  }

  public getActiveJobs(): MetadataJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status === 'queued' || j.status === 'running'
    );
  }

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
      this.activeJobs.delete(jobId);
      this.processQueue(); // Trigger queue processing when an active slot opens
    }

    const payload: ProgressEventPayload = {
      stage,
      message,
      progressPercent: job.progressPercent,
      operationId: jobId
    };

    this.emit('job:progress', payload);
  }

  public async executeApplyJob(jobId: string, applyService: MetadataApplyService): Promise<ApplyResult> {
    const job = this.jobs.get(jobId);
    if (!job || !job.preview) {
      throw new Error(`Job '${jobId}' not found or missing preview data`);
    }

    const startTime = Date.now();
    this.updateJobProgress(jobId, 'applying', `Applying metadata updates for ${job.albumTitle}...`, 20);

    try {
      const result = await applyService.applyPreview(job.preview, job.abortController.signal);
      const durationMs = Date.now() - startTime;

      // Record Telemetry
      this.diagnosticsService.recordOperation({
        operationId: jobId,
        providerId: job.preview.provider,
        durationMs,
        songsProcessed: job.preview.matches.length,
        matchesCount: job.preview.matches.filter((m) => m.applyTrack).length,
        warningsCount: job.preview.warnings.length,
        errorsCount: result.errors.length,
        success: result.success
      });

      if (result.success) {
        this.updateJobProgress(jobId, 'completed', `Successfully updated ${result.updatedCount} tracks.`, 100);
      } else {
        this.updateJobProgress(jobId, 'failed', `Apply failed: ${result.errors.join('; ')}`, 100);
      }

      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateJobProgress(jobId, err instanceof Error && err.name === 'CancelledError' ? 'cancelled' : 'failed', msg, 0);

      this.diagnosticsService.recordOperation({
        operationId: jobId,
        providerId: job.preview.provider,
        durationMs: Date.now() - startTime,
        songsProcessed: job.preview.matches.length,
        matchesCount: job.preview.matches.filter((m) => m.applyTrack).length,
        warningsCount: job.preview.warnings.length,
        errorsCount: 1,
        success: false
      });

      throw err;
    } finally {
      this.cleanCompletedJobs();
    }
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return false;
    }

    job.abortController.abort();
    this.updateJobProgress(jobId, 'cancelled', `Job '${jobId}' cancelled by user.`, 0);
    return true;
  }

  public cleanCompletedJobs(maxAgeMs = 1000 * 60 * 30, maxRetainedJobs = 50): void {
    const now = Date.now();
    const finished = Array.from(this.jobs.values()).filter(
      (j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled'
    );

    // Evict old finished jobs exceeding maxAgeMs or maxRetainedJobs LRU bound
    for (const job of finished) {
      if ((job.completedAt && now - job.completedAt > maxAgeMs) || finished.length > maxRetainedJobs) {
        this.jobs.delete(job.jobId);
      }
    }
  }

  private processQueue(): void {
    while (this.activeJobs.size < this.maxConcurrentJobs && this.queue.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.jobs.get(jobId);

      if (job && job.status === 'queued') {
        this.activeJobs.add(jobId);
        job.status = 'running';
        this.updateJobProgress(jobId, 'running', `Processing job ${jobId}...`, 10);
      }
    }
  }
}
