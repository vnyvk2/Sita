import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MetadataJobManager } from '../MetadataJobManager';
import { MetadataDiagnosticsService } from '../MetadataDiagnosticsService';

describe('Phase 7 — Background Execution, Job Manager & Telemetry Suite', () => {
  let jobManager: MetadataJobManager;
  let diagnosticsService: MetadataDiagnosticsService;

  beforeEach(() => {
    jobManager = new MetadataJobManager(3);
    diagnosticsService = new MetadataDiagnosticsService();
  });

  it('creates and tracks background jobs with formalized status lifecycle', () => {
    const job = jobManager.createJob('job-1', 'SOUR', 'Olivia Rodrigo');
    expect(job.status).toBe('queued');
    expect(job.albumTitle).toBe('SOUR');

    const activeJobs = jobManager.getActiveJobs();
    expect(activeJobs).toHaveLength(1);
  });

  it('routes progress updates and updates job stage cleanly', () => {
    const progressSpy = vi.fn();
    jobManager.on('job:progress', progressSpy);

    jobManager.createJob('job-1', 'SOUR', 'Olivia Rodrigo');
    jobManager.updateJobProgress('job-1', 'matching', 'Matching tracks...', 50);

    const job = jobManager.getJob('job-1');
    expect(job?.stage).toBe('matching');
    expect(job?.progressPercent).toBe(50);
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'matching',
        progressPercent: 50,
        operationId: 'job-1'
      })
    );
  });

  it('supports cancellation via AbortController', () => {
    const job = jobManager.createJob('job-1', 'SOUR', 'Olivia Rodrigo');
    const cancelled = jobManager.cancelJob('job-1');

    expect(cancelled).toBe(true);
    expect(job.status).toBe('cancelled');
    expect(job.abortController.signal.aborted).toBe(true);
  });

  it('records operation telemetry metrics in MetadataDiagnosticsService', () => {
    diagnosticsService.recordOperation({
      operationId: 'job-1',
      providerId: 'musicbrainz',
      durationMs: 450,
      songsProcessed: 11,
      matchesCount: 11,
      warningsCount: 0,
      errorsCount: 0,
      success: true
    });

    const summary = diagnosticsService.getSummary();
    expect(summary.totalOperations).toBe(1);
    expect(summary.successRate).toBe(1);
    expect(summary.totalSongsProcessed).toBe(11);
  });
});
