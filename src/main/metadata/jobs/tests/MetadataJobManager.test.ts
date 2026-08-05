import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MetadataJobManager } from '../MetadataJobManager';
import { MetadataDiagnosticsService } from '../MetadataDiagnosticsService';
import { MetadataApplyService } from '../../services/MetadataApplyService';
import type { AlbumTagPreview } from '../../../../common/metadata/types';

describe('Phase 7 — Autonomous Background Execution Engine, Job Scheduler & Telemetry Suite', () => {
  let jobManager: MetadataJobManager;
  let diagnosticsService: MetadataDiagnosticsService;
  let applyService: MetadataApplyService;

  const mockPreview: AlbumTagPreview = {
    album: { title: 'SOUR', artist: 'Olivia Rodrigo' },
    confidenceLevel: 'Excellent',
    overallConfidence: 0.98,
    provider: 'musicbrainz',
    providerReleaseId: 'mb-sour',
    matches: [
      {
        localSongId: 101,
        songPath: 'song.mp3',
        oldTitle: 'brutal (audio)',
        oldArtist: 'Olivia Rodrigo',
        oldAlbum: 'SOUR',
        oldYear: 2021,
        oldTrackNumber: 1,
        oldDiscNumber: 1,
        oldGenre: 'Pop',
        oldIsrc: 'USUM72101234',
        oldMbid: 'mb-rec-1',
        confidence: 0.98,
        confidenceLevel: 'Excellent',
        why: 'Matched',
        reasons: [],
        applyTrack: true,
        hasWarnings: false,
        warningCount: 0,
        fieldDiffs: [
          { fieldId: 'title', fieldName: 'Title', oldValue: 'brutal (audio)', suggestedValue: 'brutal', userValue: 'brutal', status: 'changed', applyField: true }
        ]
      }
    ],
    warnings: []
  };

  beforeEach(() => {
    diagnosticsService = new MetadataDiagnosticsService();
    applyService = new MetadataApplyService();
    vi.spyOn(applyService, 'applyPreview').mockImplementation(async (_prev, _opts, signal) => {
      if (signal?.aborted) {
        return { success: false, updatedCount: 0, failedCount: 1, errors: ['Operation aborted'] };
      }
      return { success: true, updatedCount: 1, failedCount: 0, errors: [] };
    });

    jobManager = new MetadataJobManager(2, applyService, diagnosticsService);
  });

  it('enforces maxConcurrentJobs queuing and processes jobs as slots open', () => {
    const job1 = jobManager.createJob('j1', 'SOUR', 'Olivia Rodrigo', mockPreview);
    const job2 = jobManager.createJob('j2', 'SOUR', 'Olivia Rodrigo', mockPreview);
    const job3 = jobManager.createJob('j3', 'SOUR', 'Olivia Rodrigo', mockPreview);

    expect(job1.status).toBe('running');
    expect(job2.status).toBe('running');
    expect(job3.status).toBe('queued');

    // Finish job1 -> job3 should start automatically
    jobManager.updateJobProgress('j1', 'completed', 'Done', 100);
    expect(job3.status).toBe('running');
  });

  it('autonomously executes apply job, updates status, and records telemetry', async () => {
    const result = await jobManager.executeApplyJob('j1_manual');

    // Manually triggered job without queue preview
    expect(result.success).toBe(false);

    // Enqueued job with preview executes autonomously
    jobManager.createJob('j2_auto', 'SOUR', 'Olivia Rodrigo', mockPreview);

    // Wait microtask tick for async execution
    await new Promise((r) => setTimeout(r, 50));

    const job = jobManager.getJob('j2_auto');
    expect(job?.status).toBe('completed');

    const summary = diagnosticsService.getSummary();
    expect(summary.totalOperations).toBeGreaterThanOrEqual(1);
    expect(summary.totalSongsUpdated).toBe(1);
  });

  it('cancels job mid-execution via AbortController signal cleanly returning error result', async () => {
    const job = jobManager.createJob('j1', 'SOUR', 'Olivia Rodrigo', mockPreview);

    // Abort job signal
    jobManager.cancelJob('j1');

    const res = await jobManager.executeApplyJob('j1');
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain('aborted');
    expect(job.status).toBe('cancelled');
  });

  it('cleans finished jobs based on LRU maxRetainedJobs bound', () => {
    jobManager.createJob('j1', 'SOUR', 'Olivia Rodrigo', mockPreview);
    jobManager.updateJobProgress('j1', 'completed', 'Done', 100);

    jobManager.cleanCompletedJobs(0, 0); // Force immediate eviction
    expect(jobManager.getJob('j1')).toBeUndefined();
  });
});
