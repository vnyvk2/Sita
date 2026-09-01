import { EventEmitter } from 'events';

import { db } from '@main/db/db';
import { ReplayGainJob } from '@main/workers/jobs/replayGainJob';
import { WaveformJob } from '@main/workers/jobs/waveformJob';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      waveforms: {
        findFirst: vi.fn()
      },
      songs: {
        findFirst: vi.fn()
      },
      replayGain: {
        findFirst: vi.fn()
      },
      albumsSongs: {
        findFirst: vi.fn()
      }
    },
    transaction: vi.fn()
  }
}));

vi.mock('@main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: {
    generateAsset: vi.fn()
  }
}));

describe('WaveformJob and ReplayGainJob (Unsupported Codec Graceful Handling)', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventEmitter();
  });

  it('WaveformJob gracefully skips without error or DB write when codec is unsupported', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false,
      error: 'Unsupported audio codec for waveform generation: test.mp3',
      metadata: { method: 'unsupported_codec' }
    });

    const job = new WaveformJob(101, 'C:/Music/test.mp3', 'Test Song', eventBus);
    await expect(job.execute()).resolves.toBeUndefined();

    // Verify no DB transaction/insert occurred
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('ReplayGainJob gracefully skips without error or DB write when codec is unsupported', async () => {
    vi.mocked(db.query.songs.findFirst).mockResolvedValue({
      id: 101,
      path: 'C:/Music/test.mp3'
    } as any);
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false,
      error: 'Unsupported audio codec for ReplayGain analysis: test.mp3',
      metadata: { method: 'unsupported_codec' }
    });

    const job = new ReplayGainJob(101, eventBus);
    await expect(job.execute()).resolves.toBeUndefined();

    // Verify no DB transaction/insert occurred
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
