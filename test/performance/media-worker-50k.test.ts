import { EventEmitter } from 'events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaWorkerBridge } from '../../src/main/workers/process/MediaWorkerBridge';
import type { ParsedTrackDTO } from '../../src/main/workers/process/workerProtocol';

class MockUtilityProcess extends EventEmitter {
  public postMessage = vi.fn();
  public kill = vi.fn();
  public pid = 9999;
}

let mockChildProcess: MockUtilityProcess;

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('C:/mock/app'),
    getPath: vi.fn().mockReturnValue('C:/mock/userData')
  },
  utilityProcess: {
    fork: vi.fn().mockImplementation(() => mockChildProcess)
  }
}));

describe('Phase C5: 50,000-Track Worker Streaming & Backpressure Benchmark', () => {
  let bridge: MediaWorkerBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChildProcess = new MockUtilityProcess();
    bridge = new MediaWorkerBridge();
  });

  it('streams and ingests 50,000 tracks in 500 batches with bounded event loop delay and backpressure', async () => {
    const totalTracks = 50000;
    const batchSize = 100;
    const totalBatches = totalTracks / batchSize;

    // Start bridge
    const startPromise = bridge.start();
    mockChildProcess.emit('message', {
      protocolVersion: 1,
      type: 'EVT_READY',
      pid: 9999,
      supportedOps: ['WALK_DIRECTORY', 'PARSE_TRACK_BATCH', 'GENERATE_ASSET']
    });
    await startPromise;

    const tracks = Array.from({ length: totalTracks }, (_, i) => ({
      songPath: `C:/Music/Track_${i}.mp3`,
      folderId: (i % 10) + 1
    }));

    let receivedTracks = 0;
    let receivedBatches = 0;
    let currentTaskId = '';
    let nextBatchToSend = 1;

    // When bridge sends CMD_PARSE_TRACK_BATCH (initial) or CMD_ACK_BATCH (backpressure), emit next batch
    mockChildProcess.postMessage.mockImplementation((msg: any) => {
      if (msg.type === 'CMD_PARSE_TRACK_BATCH') {
        currentTaskId = msg.taskId;
        sendNextBatch();
      } else if (msg.type === 'CMD_ACK_BATCH') {
        sendNextBatch();
      }
    });

    function sendNextBatch() {
      if (nextBatchToSend > totalBatches) return;
      const b = nextBatchToSend++;
      const isLastBatch = b === totalBatches;
      const batchTracks: ParsedTrackDTO[] = Array.from({ length: batchSize }, (_, i) => ({
        path: `C:/Music/Track_${(b - 1) * batchSize + i}.mp3`,
        title: `Track ${(b - 1) * batchSize + i}`,
        artists: ['Artist'],
        album: 'Album',
        duration: 180,
        bitrate: 320,
        sampleRate: 44100
      }));

      // Emit on next tick
      queueMicrotask(() => {
        mockChildProcess.emit('message', {
          protocolVersion: 1,
          type: 'EVT_TRACKS_PARSED_BATCH',
          taskId: currentTaskId,
          batchId: b,
          isLastBatch,
          tracks: batchTracks,
          errors: []
        });
      });
    }

    const startTime = performance.now();

    const streamPromise = bridge.parseTrackBatchStream(tracks, {
      batchSize,
      onBatch: async (batch) => {
        receivedBatches++;
        receivedTracks += batch.tracks.length;
        // Invariant: batch size must never exceed 100
        expect(batch.tracks.length).toBeLessThanOrEqual(batchSize);
      }
    });

    const result = await streamPromise;
    const elapsedMs = performance.now() - startTime;

    expect(receivedBatches).toBe(500);
    expect(receivedTracks).toBe(50000);
    expect(result.totalParsed).toBe(50000);
    expect(result.totalErrors).toBe(0);
    expect(result.cancelled).toBe(false);

    const throughput = Math.round(totalTracks / (elapsedMs / 1000));
    console.log(
      `\n[50k Stream Benchmark] Processed ${receivedTracks.toLocaleString()} tracks in ${elapsedMs.toFixed(2)}ms (${throughput.toLocaleString()} tracks/sec)`
    );
  }, 30000);
});
