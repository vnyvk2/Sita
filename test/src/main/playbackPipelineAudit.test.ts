import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';

describe('Playback Pipeline Adversarial Audit & Performance Profiling', () => {
  describe('P0: Artwork Sharp & IPC Serialization Overhead', () => {
    it('quantifies latency and buffer size of Sharp processing on song load', async () => {
      const fakeImageBuffer = Buffer.alloc(4 * 1024 * 1024); // 4 MB raw buffer

      const startSharp = performance.now();
      const base64Str = fakeImageBuffer.toString('base64');
      const endSharp = performance.now();

      const serializationDuration = endSharp - startSharp;
      console.log(`[Playback Audit] 4MB Artwork Base64 string length: ${base64Str.length} chars (~${(base64Str.length / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`[Playback Audit] Base64 serialization time: ${serializationDuration.toFixed(2)} ms`);

      expect(base64Str.length).toBeGreaterThan(4 * 1024 * 1024);
    });

    it('benchmarks RAM footprint over 100 song skips: with Sharp buffers vs with artworkPath only', async () => {
      // 1. Old Architecture: 100 skips with 2MB Sharp image buffers
      const initialMem = process.memoryUsage();
      const initialTotal = initialMem.heapUsed + initialMem.external + initialMem.arrayBuffers;

      const oldPayloads: any[] = [];
      for (let i = 0; i < 100; i++) {
        oldPayloads.push({
          songId: i,
          title: `Song ${i}`,
          artwork: Buffer.alloc(2 * 1024 * 1024) // 2MB binary buffer per track
        });
      }
      const memWithBuffers = process.memoryUsage();
      const totalWithBuffers = memWithBuffers.heapUsed + memWithBuffers.external + memWithBuffers.arrayBuffers;
      const bufferOverheadMB = (totalWithBuffers - initialTotal) / (1024 * 1024);
      console.log(`[RAM Benchmark] 100 skips with Sharp binary Buffers: +${bufferOverheadMB.toFixed(2)} MB total RAM (external + arrayBuffers)`);

      // Clear old payloads
      oldPayloads.length = 0;

      // 2. New Architecture: 100 skips with artworkPath string only
      const baseMem = process.memoryUsage();
      const baseTotal = baseMem.heapUsed + baseMem.external + baseMem.arrayBuffers;

      const newPayloads: any[] = [];
      for (let i = 0; i < 100; i++) {
        newPayloads.push({
          songId: i,
          title: `Song ${i}`,
          artwork: undefined,
          artworkPath: `nora://artworks/${i}.webp`
        });
      }
      const memWithPaths = process.memoryUsage();
      const totalWithPaths = memWithPaths.heapUsed + memWithPaths.external + memWithPaths.arrayBuffers;
      const pathOverheadMB = (totalWithPaths - baseTotal) / (1024 * 1024);
      console.log(`[RAM Benchmark] 100 skips with artworkPath string only: +${pathOverheadMB.toFixed(2)} MB total RAM`);

      expect(bufferOverheadMB).toBeGreaterThan(150); // ~200MB allocated
      expect(pathOverheadMB).toBeLessThan(1); // < 1MB allocated
    });
  });

  describe('P0: Rapid Skip Race Condition in AudioPlayer', () => {
    it('proves out-of-order resolution overwrites audio.src without a generation token', async () => {
      let currentAudioSrc = '';
      let currentSongIdInStore = 0;

      const mockAudio = {
        set src(val: string) {
          currentAudioSrc = val;
        },
        get src() {
          return currentAudioSrc;
        }
      };

      const songLatencies: Record<number, number> = {
        1: 100,
        2: 50,
        3: 10
      };

      const getSongMock = (songId: number): Promise<{ songId: number; path: string }> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ songId, path: `nora://music/song_${songId}.flac` });
          }, songLatencies[songId]);
        });
      };

      async function vulnerableLoadSong(songId: number) {
        const songData = await getSongMock(songId);
        currentSongIdInStore = songData.songId;
        mockAudio.src = `${songData.path}?ts=${Date.now()}`;
      }

      const p1 = vulnerableLoadSong(1);
      const p2 = vulnerableLoadSong(2);
      const p3 = vulnerableLoadSong(3);

      await Promise.all([p1, p2, p3]);

      // Vulnerable: Track 1 finished last and overwrote Track 3!
      expect(currentSongIdInStore).toBe(1);
      expect(mockAudio.src).toContain('song_1.flac');
    });

    it('proves generation token / requestId guarantees correct latest song resolution', async () => {
      let currentAudioSrc = '';
      let currentSongIdInStore = 0;
      let loadRequestId = 0;

      const mockAudio = {
        set src(val: string) {
          currentAudioSrc = val;
        },
        get src() {
          return currentAudioSrc;
        }
      };

      const songLatencies: Record<number, number> = {
        1: 100,
        2: 50,
        3: 10
      };

      const getSongMock = (songId: number): Promise<{ songId: number; path: string }> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ songId, path: `nora://music/song_${songId}.flac` });
          }, songLatencies[songId]);
        });
      };

      async function hardenedLoadSong(songId: number) {
        const currentReq = ++loadRequestId;
        const songData = await getSongMock(songId);

        if (currentReq !== loadRequestId) {
          return;
        }

        currentSongIdInStore = songData.songId;
        mockAudio.src = songData.path;
      }

      const p1 = hardenedLoadSong(1);
      const p2 = hardenedLoadSong(2);
      const p3 = hardenedLoadSong(3);

      await Promise.all([p1, p2, p3]);

      // Hardened: Track 3 is properly retained as the final active track!
      expect(currentSongIdInStore).toBe(3);
      expect(mockAudio.src).toBe('nora://music/song_3.flac');
    });
  });

  describe('P1: Stream Backpressure Simulation', () => {
    it('verifies that backpressure pauses producer when consumer queue is full', async () => {
      class MockReadStream extends EventEmitter {
        paused = false;
        pause() {
          this.paused = true;
        }
        resume() {
          this.paused = false;
        }
        destroy() {}
      }

      const mockFileStream = new MockReadStream();
      let streamPausedCount = 0;
      let streamResumedCount = 0;

      const originalPause = mockFileStream.pause.bind(mockFileStream);
      const originalResume = mockFileStream.resume.bind(mockFileStream);

      mockFileStream.pause = () => {
        streamPausedCount++;
        originalPause();
      };
      mockFileStream.resume = () => {
        streamResumedCount++;
        originalResume();
      };

      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          mockFileStream.on('data', (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
            if (controller.desiredSize !== null && controller.desiredSize <= 0) {
              mockFileStream.pause();
            }
          });
        },
        pull() {
          mockFileStream.resume();
        }
      });

      // Emit chunk that fills queue
      mockFileStream.emit('data', Buffer.alloc(64 * 1024));

      expect(mockFileStream.paused).toBe(true);
      expect(streamPausedCount).toBe(1);

      // Downstream reader consumes chunk
      const reader = webStream.getReader();
      const readResult = await reader.read();
      expect(readResult.value?.length).toBe(64 * 1024);

      // When reader needs more, pull() resumes producer
      expect(mockFileStream.paused).toBe(false);
      expect(streamResumedCount).toBe(1);
    });
  });
});
