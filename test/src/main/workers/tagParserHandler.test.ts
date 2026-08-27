import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDuration,
  getArtistNames,
  parseTrackMetadata,
  parseTracksStreaming
} from '@main/workers/process/handlers/tagParserHandler';

const mockFileInstance = {
  tag: {
    title: 'Test Song',
    performers: ['Artist A', 'Artist B'],
    albumArtists: ['Album Artist A'],
    album: 'Greatest Hits',
    genres: ['Rock', 'Alternative'],
    year: 2024,
    track: 1,
    disc: 1,
    pictures: []
  },
  properties: {
    durationMilliseconds: 185500,
    audioSampleRate: 44100,
    audioBitrate: 320,
    audioChannels: 2
  },
  dispose: vi.fn()
};

vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: vi.fn(() => mockFileInstance)
  },
  PictureType: {
    FrontCover: 3
  }
}));

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn().mockResolvedValue({
      birthtime: new Date(100000),
      mtime: new Date(200000)
    })
  }
}));

describe('tagParserHandler (Phase C3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Helper utilities', () => {
    it('should split artists with separators correctly', () => {
      expect(getArtistNames('Pink Floyd, David Gilmour & Roger Waters')).toEqual([
        'Pink Floyd',
        'David Gilmour',
        'Roger Waters'
      ]);
      expect(getArtistNames(undefined)).toEqual([]);
    });

    it('should format duration to 2 decimal places', () => {
      expect(formatDuration(185.556)).toBe('185.56');
      expect(formatDuration(undefined)).toBe('0.00');
    });
  });

  describe('parseTrackMetadata', () => {
    it('should extract metadata and dispose taglib handle in finally block', async () => {
      const parsed = await parseTrackMetadata('C:/Music/test.mp3', 42);

      expect(parsed.title).toBe('Test Song');
      expect(parsed.artists).toEqual(['Artist A', 'Artist B']);
      expect(parsed.album).toBe('Greatest Hits');
      expect(parsed.duration).toBe('185.50');
      expect(parsed.folderId).toBe(42);
      expect(parsed.year).toBe(2024);
      expect(parsed.sampleRate).toBe(44100);
      expect(parsed.bitRate).toBe(320);
      expect(mockFileInstance.dispose).toHaveBeenCalledTimes(1);
    });

    it('should dispose taglib handle in finally block even if tag reading throws', async () => {
      const failingFile = {
        get tag(): unknown {
          throw new Error('Corrupted ID3 header');
        },
        dispose: vi.fn()
      };
      const { File } = await import('node-taglib-sharp');
      vi.mocked(File.createFromPath).mockReturnValueOnce(failingFile as unknown as typeof mockFileInstance);

      await expect(parseTrackMetadata('C:/Music/corrupt.mp3')).rejects.toThrow('Corrupted ID3 header');
      expect(failingFile.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseTracksStreaming with 100-track backpressure', () => {
    it('should stream tracks in 100-item chunks and pause until ACK resolves (last batch completes without ACK)', async () => {
      // 250 test tracks
      const testTracks = Array.from({ length: 250 }, (_, i) => ({
        songPath: `C:/Music/track_${i}.mp3`,
        folderId: 1
      }));

      const dispatchedBatches: Array<{
        batchId: number;
        isLastBatch: boolean;
        trackCount: number;
      }> = [];

      const ackResolvers: Array<() => void> = [];

      const streamPromise = parseTracksStreaming(testTracks, {
        taskId: 'task_123',
        batchSize: 100,
        maxConcurrency: 8,
        onBatchReady: async (batch) => {
          dispatchedBatches.push({
            batchId: batch.batchId,
            isLastBatch: batch.isLastBatch,
            trackCount: batch.tracks.length
          });

          // Production contract: only non-final batches wait for CMD_ACK_BATCH
          if (!batch.isLastBatch) {
            await new Promise<void>((resolve) => {
              ackResolvers.push(resolve);
            });
          }
        }
      });

      // Let microtasks run to complete batch 1
      await new Promise((resolve) => setImmediate(resolve));

      // Batch 1 should have been emitted
      expect(dispatchedBatches).toHaveLength(1);
      expect(dispatchedBatches[0]).toEqual({
        batchId: 1,
        isLastBatch: false,
        trackCount: 100
      });

      // Worker should be paused waiting for ACK. Batch 2 not yet dispatched.
      expect(ackResolvers).toHaveLength(1);

      // Simulate Main process sending ACK for batch 1
      const ack1 = ackResolvers.shift()!;
      ack1();

      await new Promise((resolve) => setImmediate(resolve));

      // Batch 2 should now have been emitted
      expect(dispatchedBatches).toHaveLength(2);
      expect(dispatchedBatches[1]).toEqual({
        batchId: 2,
        isLastBatch: false,
        trackCount: 100
      });

      // Simulate Main process sending ACK for batch 2
      const ack2 = ackResolvers.shift()!;
      ack2();

      await new Promise((resolve) => setImmediate(resolve));

      // Batch 3 (final 50 tracks) should now be emitted with isLastBatch: true
      expect(dispatchedBatches).toHaveLength(3);
      expect(dispatchedBatches[2]).toEqual({
        batchId: 3,
        isLastBatch: true,
        trackCount: 50
      });

      // The final batch MUST NOT wait for an ACK; worker streaming finishes immediately
      await streamPromise;
      expect(ackResolvers).toHaveLength(0);
    });

    it('should halt streaming when abortSignal is triggered', async () => {
      const testTracks = Array.from({ length: 250 }, (_, i) => ({
        songPath: `C:/Music/track_${i}.mp3`,
        folderId: 1
      }));

      const abortController = new AbortController();
      const dispatchedBatches: number[] = [];

      const streamPromise = parseTracksStreaming(testTracks, {
        taskId: 'task_abort',
        batchSize: 100,
        abortSignal: abortController.signal,
        onBatchReady: async (batch) => {
          dispatchedBatches.push(batch.batchId);
          // Abort during batch 1 ACK
          abortController.abort();
        }
      });

      await streamPromise;

      // Only batch 1 should have dispatched before abort stopped the loop
      expect(dispatchedBatches).toEqual([1]);
    });

    it('should obey batch-boundary cancellation: finish in-flight batch and discard subsequent batches', async () => {
      const testTracks = Array.from({ length: 300 }, (_, i) => ({
        songPath: `C:/Music/track_${i}.mp3`,
        folderId: 1
      }));

      const abortController = new AbortController();
      const processedBatches: number[] = [];

      const streamPromise = parseTracksStreaming(testTracks, {
        taskId: 'task_boundary_abort',
        batchSize: 100,
        abortSignal: abortController.signal,
        onBatchReady: async (batch) => {
          // Check cancellation at batch boundary (mimicking Main-side onBatch check)
          if (abortController.signal.aborted) {
            return;
          }
          processedBatches.push(batch.batchId);

          if (batch.batchId === 1) {
            // Abort while batch 1 is committing
            abortController.abort();
          }
        }
      });

      await streamPromise;

      // Batch 1 completed atomically; batches 2 and 3 were never processed
      expect(processedBatches).toEqual([1]);
    });
  });
});
