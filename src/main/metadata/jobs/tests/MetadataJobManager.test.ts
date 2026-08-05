import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MetadataJobManager } from '../MetadataJobManager';
import { MetadataDiagnosticsService } from '../MetadataDiagnosticsService';
import { MetadataApplyService, CancelledError } from '../../services/MetadataApplyService';
import { TagWriterService } from '../../services/TagWriterService';
import type { AlbumTagPreview } from '../../../../common/metadata/types';

describe('Phase 7 — Background Execution Engine, Job Scheduler & Telemetry Suite', () => {
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
    jobManager = new MetadataJobManager(2, diagnosticsService);

    const tagWriter = new TagWriterService();
    vi.spyOn(tagWriter, 'writeBatch').mockResolvedValue([{ filePath: 'song.mp3', success: true }]);
    const dbUpdater = vi.fn().mockResolvedValue(true);

    applyService = new MetadataApplyService({ tagWriter, dbUpdater });
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

  it('executes apply job, updates status, and records telemetry automatically', async () => {
    jobManager.createJob('j1', 'SOUR', 'Olivia Rodrigo', mockPreview);

    const result = await jobManager.executeApplyJob('j1', applyService);
    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);

    const job = jobManager.getJob('j1');
    expect(job?.status).toBe('completed');

    const summary = diagnosticsService.getSummary();
    expect(summary.totalOperations).toBe(1);
    expect(summary.successRate).toBe(1);
    expect(summary.totalSongsProcessed).toBe(1);
  });

  it('cancels job mid-execution via AbortController signal', async () => {
    const job = jobManager.createJob('j1', 'SOUR', 'Olivia Rodrigo', mockPreview);

    // Abort job signal
    jobManager.cancelJob('j1');

    await expect(jobManager.executeApplyJob('j1', applyService)).rejects.toThrow(CancelledError);
    expect(job.status).toBe('cancelled');
  });

  it('cleans finished jobs based on LRU maxRetainedJobs bound', () => {
    jobManager.createJob('j1', 'SOUR', 'Olivia Rodrigo', mockPreview);
    jobManager.updateJobProgress('j1', 'completed', 'Done', 100);

    jobManager.cleanCompletedJobs(0, 0); // Force immediate eviction
    expect(jobManager.getJob('j1')).toBeUndefined();
  });
});
