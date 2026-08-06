import type { MetadataHealth } from '../domain/MetadataHealth';
import type { MetadataOperationManager } from '../operations/MetadataOperationManager';
import type { MetadataResolutionManager } from '../resolution/MetadataResolutionManager';
import type { MetadataTransactionManager } from '../transactions/MetadataTransactionManager';

export interface SongMetadataInput {
  songId: number;
  filePath?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  artworkBuffer?: Buffer;
  hasArtwork?: boolean;
}

export interface BackgroundEnrichmentJob {
  id: string;
  songId: number;
  filePath?: string;
  title?: string;
  artist?: string;
  album?: string;
  enqueuedAt: number;
  attempts: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface LibraryHealthReport {
  totalSongs: number;
  overallScore: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  missingTitles: number;
  missingArtists: number;
  missingAlbums: number;
  missingArtworks: number;
  missingGenres: number;
  assessedAt: number;
}

export type WorkerStepResult =
  | { status: 'processed'; jobId: string }
  | { status: 'retry_scheduled'; jobId: string; attempts: number }
  | { status: 'failed'; jobId: string }
  | { status: 'queue_empty' }
  | { status: 'paused' };

export interface JobPersister {
  saveJob(job: BackgroundEnrichmentJob): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
  loadPendingJobs(): Promise<BackgroundEnrichmentJob[]>;
}

export type JobWorkerHandler = (job: BackgroundEnrichmentJob) => Promise<boolean>;

export class BackgroundEnrichmentQueue {
  private readonly operationManager?: MetadataOperationManager;
  private readonly resolutionManager?: MetadataResolutionManager;
  private readonly transactionManager?: MetadataTransactionManager;
  private readonly persister?: JobPersister;
  private readonly pendingJobs: Map<string, BackgroundEnrichmentJob> = new Map();
  private isRunning = false;
  private isPausedState = false;
  private processedCounter = 0;
  private failedCounter = 0;
  private customHandler?: JobWorkerHandler;
  private readonly maxRetries: number;

  constructor(options?: {
    operationManager?: MetadataOperationManager;
    resolutionManager?: MetadataResolutionManager;
    transactionManager?: MetadataTransactionManager;
    persister?: JobPersister;
    workerHandler?: JobWorkerHandler;
    maxRetries?: number;
  }) {
    this.operationManager = options?.operationManager;
    this.resolutionManager = options?.resolutionManager;
    this.transactionManager = options?.transactionManager;
    this.persister = options?.persister;
    this.customHandler = options?.workerHandler;
    this.maxRetries = options?.maxRetries ?? 3;
  }

  public async restorePersistedJobs(): Promise<number> {
    if (!this.persister) return 0;
    try {
      const jobs = await this.persister.loadPendingJobs();
      let restored = 0;
      for (const j of jobs) {
        if (!this.pendingJobs.has(j.id)) {
          this.pendingJobs.set(j.id, j);
          restored++;
        }
      }
      return restored;
    } catch (_err) {
      return 0;
    }
  }

  public enqueueEnrichment(songId: number, filePath?: string, songMeta?: Partial<SongMetadataInput>): string {
    const jobId = `enrich-${songId}-${Date.now()}`;
    const job: BackgroundEnrichmentJob = {
      id: jobId,
      songId,
      filePath,
      title: songMeta?.title,
      artist: songMeta?.artist,
      album: songMeta?.album,
      enqueuedAt: Date.now(),
      attempts: 0,
      maxRetries: this.maxRetries,
      status: 'pending'
    };

    this.pendingJobs.set(jobId, job);

    if (this.persister) {
      void this.persister.saveJob(job);
    }

    if (this.operationManager) {
      this.operationManager.createOperation(jobId, 'BackgroundEnrichment', [songId], 'Background');
    }

    if (this.isRunning && !this.isPausedState) {
      void this.processWorkerQueue();
    }

    return jobId;
  }

  public autoEnqueueUnhealthySongs(songs: SongMetadataInput[]): number {
    let enqueued = 0;
    for (const song of songs) {
      const health = this.evaluateSongHealth(song);
      if (health.rating === 'Fair' || health.rating === 'Poor') {
        this.enqueueEnrichment(song.songId, song.filePath, song);
        enqueued++;
      }
    }
    return enqueued;
  }

  public startWorkerLoop(handler?: JobWorkerHandler): void {
    if (handler) this.customHandler = handler;
    this.isRunning = true;
    this.isPausedState = false;
    void this.processWorkerQueue();
  }

  public pause(): void {
    this.isPausedState = true;
  }

  public resume(): void {
    this.isPausedState = false;
    if (this.isRunning) {
      void this.processWorkerQueue();
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  private async processWorkerQueue(): Promise<void> {
    while (this.isRunning && !this.isPausedState && this.pendingJobs.size > 0) {
      const step = await this.processNextStep();
      if (step.status === 'queue_empty' || step.status === 'paused') {
        break;
      }
    }
  }

  public async processNextStep(): Promise<WorkerStepResult> {
    if (this.isPausedState) {
      return { status: 'paused' };
    }

    if (this.pendingJobs.size === 0) {
      return { status: 'queue_empty' };
    }

    const nextEntry = Array.from(this.pendingJobs.entries()).find(([, j]) => j.status === 'pending');
    if (!nextEntry) {
      return { status: 'queue_empty' };
    }

    const [jobId, job] = nextEntry;
    job.status = 'processing';
    job.attempts++;

    if (this.operationManager) {
      this.operationManager.updateState(jobId, 'Searching', `Background processing for song ${job.songId} (Attempt ${job.attempts}/${job.maxRetries})`, 25);
    }

    let success = false;

    try {
      if (this.customHandler) {
        success = await this.customHandler(job);
      } else {
        success = await this.defaultProcessJob(job);
      }
    } catch (_err) {
      success = false;
    }

    if (success) {
      job.status = 'completed';
      this.processedCounter++;
      this.pendingJobs.delete(jobId);
      if (this.persister) {
        void this.persister.deleteJob(jobId);
      }
      if (this.operationManager) {
        this.operationManager.updateState(jobId, 'Completed', `Background enrichment completed for song ${job.songId}`, 100);
      }
      return { status: 'processed', jobId };
    } else {
      if (job.attempts < job.maxRetries) {
        job.status = 'pending';
        if (this.persister) {
          void this.persister.saveJob(job);
        }
        if (this.operationManager) {
          this.operationManager.updateState(jobId, 'Created', `Retrying background enrichment for song ${job.songId} (${job.attempts}/${job.maxRetries})`, 0);
        }
        return { status: 'retry_scheduled', jobId, attempts: job.attempts };
      } else {
        job.status = 'failed';
        this.failedCounter++;
        this.pendingJobs.delete(jobId);
        if (this.persister) {
          void this.persister.deleteJob(jobId);
        }
        if (this.operationManager) {
          this.operationManager.updateState(jobId, 'Failed', `Background enrichment failed after ${job.attempts} attempts for song ${job.songId}`, 0);
        }
        return { status: 'failed', jobId };
      }
    }
  }

  private async defaultProcessJob(job: BackgroundEnrichmentJob): Promise<boolean> {
    if (this.resolutionManager && this.transactionManager && job.filePath) {
      try {
        const queryTitle = job.title || `Song-${job.songId}`;
        const queryArtist = job.artist;
        const resolution = await this.resolutionManager.resolve(job.id, {
          resources: { primaryType: 'track', targetResources: [{ id: job.songId, type: 'track', attributes: {} }] },
          execution: { mode: 'Background' },
          request: { query: { trackTitle: queryTitle, artistName: queryArtist } }
        });

        if (resolution && resolution.candidates.length > 0) {
          const top = resolution.candidates[0];
          const txRes = await this.transactionManager.executeTransaction(job.id, [
            {
              resourceId: job.songId,
              filePath: job.filePath,
              fieldMutations: [
                { fieldId: 'title', newValue: top.title, providerId: top.providerId, confidenceScore: top.score },
                { fieldId: 'artist', newValue: top.artist, providerId: top.providerId, confidenceScore: top.score }
              ]
            }
          ]);
          return txRes.success;
        }
      } catch (_err) {
        return false;
      }
    }
    return true;
  }

  public evaluateSongHealth(song: SongMetadataInput): MetadataHealth {
    let score = 100;
    const issues: string[] = [];

    if (!song.title || song.title.trim().length === 0) {
      score -= 30;
      issues.push('Missing song title');
    }

    if (!song.artist || song.artist.trim().length === 0 || song.artist.toLowerCase() === 'unknown artist') {
      score -= 25;
      issues.push('Missing or generic artist');
    }

    if (!song.album || song.album.trim().length === 0 || song.album.toLowerCase() === 'unknown album') {
      score -= 20;
      issues.push('Missing or generic album');
    }

    if (!song.hasArtwork && !song.artworkBuffer) {
      score -= 15;
      issues.push('Missing cover artwork');
    }

    if (!song.genre || song.genre.trim().length === 0) {
      score -= 10;
      issues.push('Missing genre tag');
    }

    const finalScore = Math.max(0, score);
    let rating: MetadataHealth['rating'] = 'Poor';
    if (finalScore >= 90) rating = 'Excellent';
    else if (finalScore >= 75) rating = 'Good';
    else if (finalScore >= 50) rating = 'Fair';

    return {
      resourceId: song.songId,
      resourceType: 'track',
      score: finalScore,
      rating,
      issues,
      assessedAt: Date.now()
    };
  }

  public assessLibraryHealth(songs: SongMetadataInput[]): LibraryHealthReport {
    if (!songs || songs.length === 0) {
      return {
        totalSongs: 0,
        overallScore: 100,
        rating: 'Excellent',
        missingTitles: 0,
        missingArtists: 0,
        missingAlbums: 0,
        missingArtworks: 0,
        missingGenres: 0,
        assessedAt: Date.now()
      };
    }

    let missingTitles = 0;
    let missingArtists = 0;
    let missingAlbums = 0;
    let missingArtworks = 0;
    let missingGenres = 0;
    let scoreSum = 0;

    for (const song of songs) {
      const h = this.evaluateSongHealth(song);
      scoreSum += h.score;

      if (!song.title) missingTitles++;
      if (!song.artist || song.artist.toLowerCase() === 'unknown artist') missingArtists++;
      if (!song.album || song.album.toLowerCase() === 'unknown album') missingAlbums++;
      if (!song.hasArtwork && !song.artworkBuffer) missingArtworks++;
      if (!song.genre) missingGenres++;
    }

    const avgScore = Math.round(scoreSum / songs.length);
    let rating: LibraryHealthReport['rating'] = 'Poor';
    if (avgScore >= 90) rating = 'Excellent';
    else if (avgScore >= 75) rating = 'Good';
    else if (avgScore >= 50) rating = 'Fair';

    return {
      totalSongs: songs.length,
      overallScore: avgScore,
      rating,
      missingTitles,
      missingArtists,
      missingAlbums,
      missingArtworks,
      missingGenres,
      assessedAt: Date.now()
    };
  }

  public get pendingCount(): number {
    return Array.from(this.pendingJobs.values()).filter((j) => j.status === 'pending').length;
  }

  public get isProcessing(): boolean {
    return this.isRunning && !this.isPausedState;
  }

  public get isPaused(): boolean {
    return this.isPausedState;
  }

  public get processedCount(): number {
    return this.processedCounter;
  }

  public get failedCount(): number {
    return this.failedCounter;
  }
}
