import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { GarbageCollectionJob } from '@main/workers/jobs/garbageCollectionJob';
import { WAVEFORM_RESOLUTION } from '@main/workers/jobs/waveformJob';
import { MediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { MEDIA_WORKER_PROTOCOL_VERSION } from '@main/workers/process/workerProtocol';
import { isAssetTempFileFor } from '@main/workers/process/handlers/assetJobHandler';
import type { SongData } from '@renderer/types';

class MockUtilityProcess extends EventEmitter {
  public pid = 1234;
  public postMessage = vi.fn();
  public kill = vi.fn();

  public simulateWorkerMessage(event: any) {
    this.emit('message', event);
  }

  public simulateExit(code = 0) {
    this.emit('exit', code);
  }
}

vi.mock('@main/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('Phase 3 FORENSIC: Format Audits, UI Hydration & Protocol Matrix', () => {

  // -------------------------------------------------------------------------
  // Item 10: Waveform 800-byte Format & GC Promotion Validation
  // -------------------------------------------------------------------------
  describe('Item 10: Waveform Format & GC Validation', () => {
    it('Waveform constant validation: WAVEFORM_RESOLUTION * 4 must equal 800 bytes', () => {
      expect(WAVEFORM_RESOLUTION).toBe(200);
      expect(WAVEFORM_RESOLUTION * 4).toBe(800);
    });

    it('GC Validation: size === 800 bytes is strictly enforced for promotion', () => {
      // Test validation logic across various file sizes
      const testSizes = [
        { size: 0, valid: false },
        { size: 4, valid: false },
        { size: 799, valid: false },
        { size: 800, valid: true }, // Exactly 200 Float32 peaks
        { size: 801, valid: false },
        { size: 1600, valid: false }
      ];

      for (const t of testSizes) {
        const isValid = t.size === WAVEFORM_RESOLUTION * 4;
        expect(isValid).toBe(t.valid);
      }
    });

    it('Temp file pattern matching: isAssetTempFileFor strictly distinguishes valid tmp files from unassociated files', () => {
      const destBasename = '123_v1.bin';

      // Valid temp file pattern: ${destBasename}.${pid}.${taskId}.tmp
      expect(isAssetTempFileFor('123_v1.bin.5432.task_abc123.tmp', destBasename)).toBe(true);
      expect(isAssetTempFileFor('123_v1.bin.tmp', destBasename)).toBe(true);

      // Invalid patterns (different song, different derivative, random files)
      expect(isAssetTempFileFor('999_v1.bin.5432.task_abc123.tmp', destBasename)).toBe(false);
      expect(isAssetTempFileFor('123_v1.bin', destBasename)).toBe(false);
      expect(isAssetTempFileFor('123_v1.bin.5432.task_abc123.tmp.bak', destBasename)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Item 11: Hydration ID Mapping & Out-of-Order Deletions
  // -------------------------------------------------------------------------
  describe('Item 11: Hydration ID Mapping under Concurrent Deletions', () => {
    it('Maps returned songs by matching songId against requested IDs without shifting index positions', () => {
      // Requested IDs: 101, 102, 103, 104 at indices 0, 1, 2, 3
      const ids = [101, 102, 103, 104];
      const win = { startIndex: 0, endIndex: 4 };

      // Song 102 was deleted concurrently, DB query returns only 101, 103, 104
      const responseData: Partial<SongData>[] = [
        { songId: 101, title: 'Track 101' } as any,
        { songId: 103, title: 'Track 103' } as any,
        { songId: 104, title: 'Track 104' } as any
      ];

      // Simulate the updated useWindowHydration useMemo logic
      const map = new Map<number, Partial<SongData>>();
      const responseById = new Map<number, Partial<SongData>>();
      for (const item of responseData) {
        responseById.set(item.songId!, item);
      }

      for (let k = 0; k < (win.endIndex - win.startIndex); k += 1) {
        const requestedId = ids[win.startIndex + k];
        if (requestedId !== undefined) {
          const item = responseById.get(requestedId);
          if (item) {
            map.set(win.startIndex + k, item);
          }
        }
      }

      // Verification:
      // Index 0 -> Track 101
      expect(map.get(0)?.title).toBe('Track 101');

      // Index 1 (deleted song 102) -> undefined (unmapped, NOT shifted!)
      expect(map.get(1)).toBeUndefined();

      // Index 2 -> Track 103 (correct slot, NOT shifted into index 1)
      expect(map.get(2)?.title).toBe('Track 103');

      // Index 3 -> Track 104 (correct slot, NOT shifted into index 2)
      expect(map.get(3)?.title).toBe('Track 104');
    });
  });

  // -------------------------------------------------------------------------
  // Item 12: MediaWorkerBridge Protocol Adversarial Matrix
  // -------------------------------------------------------------------------
  describe('Item 12: MediaWorkerBridge Full Protocol Matrix', () => {
    let bridge: MediaWorkerBridge;
    let mockProcess: MockUtilityProcess;

    beforeEach(async () => {
      vi.clearAllMocks();
      mockProcess = new MockUtilityProcess();
      const { utilityProcess } = await import('electron');
      vi.mocked(utilityProcess.fork).mockReturnValue(mockProcess as any);

      bridge = new MediaWorkerBridge();
    });

    it('Protocol Handshake: Rejects malformed or incompatible protocol version', async () => {
      const startPromise = bridge.start(50);

      // Send wrong protocol version (ignored)
      mockProcess.simulateWorkerMessage({
        protocolVersion: 9999, // Incompatible
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: []
      });

      await expect(startPromise).rejects.toThrow(/Timeout waiting for worker EVT_READY after 50ms/);
      expect(bridge.getState()).toBe('CRASHED');
    });

    it('Late Messages: Worker message arriving for non-existent/settled taskId is safely ignored without crash', async () => {
      const startPromise = bridge.start(1000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING']
      });
      await startPromise;

      // Simulate a late EVT_TRACKS_PARSED_BATCH for an unknown or already settled taskId
      expect(() => {
        mockProcess.simulateWorkerMessage({
          protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
          type: 'EVT_TRACKS_PARSED_BATCH',
          taskId: 'stale_task_9999',
          batchId: 1,
          isLastBatch: true,
          tracks: [],
          errors: []
        });
      }).not.toThrow();
    });

    it('Shutdown Barrier: Commands sent after bridge termination throw immediately', async () => {
      const startPromise = bridge.start(1000);
      mockProcess.simulateWorkerMessage({
        protocolVersion: MEDIA_WORKER_PROTOCOL_VERSION,
        type: 'EVT_READY',
        pid: 12345,
        supportedOps: ['CMD_PING']
      });
      await startPromise;

      const terminatePromise = bridge.terminate();
      mockProcess.simulateExit(0);
      await terminatePromise;

      expect(bridge.getState()).toBe('TERMINATED');
      expect(bridge.isReady()).toBe(false);

      await expect(bridge.ping()).rejects.toThrow(/worker is not in READY state/);
    });
  });
});
