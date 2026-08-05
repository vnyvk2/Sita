import { EventEmitter } from 'events';
import type { AutoTagStage, ProgressEventPayload } from '../../../common/metadata/types';

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
}

export class MetadataJobManager extends EventEmitter {
  private readonly jobs: Map<string, MetadataJob> = new Map();
  private readonly maxConcurrentJobs: number;

  constructor(maxConcurrentJobs = 3) {
    super();
    this.maxConcurrentJobs = maxConcurrentJobs;
  }

  public createJob(jobId: string, albumTitle: string, artistName?: string): MetadataJob {
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
      abortController: new AbortController()
    };

    this.jobs.set(jobId, job);
    this.emit('job:created', job);
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
    }

    const payload: ProgressEventPayload = {
      stage,
      message,
      progressPercent: job.progressPercent,
      operationId: jobId
    };

    this.emit('job:progress', payload);
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

  public cleanCompletedJobs(maxAgeMs = 1000 * 60 * 30): void {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (job.completedAt && now - job.completedAt > maxAgeMs) {
        this.jobs.delete(id);
      }
    }
  }
}
