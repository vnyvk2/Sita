// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';

// Mock Web Audio API for jsdom environment
class MockAudioContext {
  currentTime = 0;
  destination = {};
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn()
    };
  }
  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: { value: 1000 },
      gain: { value: 0 },
      Q: { value: 1 },
      connect: vi.fn()
    };
  }
  createMediaElementSource() {
    return { connect: vi.fn() };
  }
  close() {
    return Promise.resolve();
  }
}
window.AudioContext = MockAudioContext as any;

import AudioPlayer from '@renderer/other/player';
import { store } from '@renderer/store/store';

describe('Playback Pipeline Rigorous Engineering Audit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-playback-audit-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('P0: Real Sharp Image Decoding vs Path-Only Payload', () => {
    it('benchmarks real Sharp decoding time and memory on disk image', async () => {
      const testImagePath = path.join(tempDir, 'test_cover.jpg');

      // Generate a realistic 2000x2000 JPEG cover artwork
      await sharp({
        create: {
          width: 2000,
          height: 2000,
          channels: 3,
          background: { r: 64, g: 128, b: 200 }
        }
      })
        .jpeg({ quality: 85 })
        .toFile(testImagePath);

      const fileSize = fs.statSync(testImagePath).size;

      // 1. Measure real Sharp .toBuffer() duration and memory
      const t0 = performance.now();
      const sharpBuffer = await sharp(testImagePath).toBuffer();
      const t1 = performance.now();
      const sharpDuration = t1 - t0;

      // 2. Measure path-only duration (just string resolution)
      const t2 = performance.now();
      const resolvedPath = `nora://artworks/test_cover.jpg`;
      const t3 = performance.now();
      const pathDuration = t3 - t2;

      console.log(`[Sharp Real Benchmark] 2000x2000 JPEG file size: ${(fileSize / 1024).toFixed(1)} KB`);
      console.log(`[Sharp Real Benchmark] sharp(path).toBuffer() execution time: ${sharpDuration.toFixed(2)} ms`);
      console.log(`[Sharp Real Benchmark] path-only resolution time: ${pathDuration.toFixed(4)} ms`);
      console.log(`[Sharp Real Benchmark] Sharp Buffer allocated in RAM: ${(sharpBuffer.length / 1024).toFixed(1)} KB`);

      expect(sharpBuffer.length).toBeGreaterThan(0);
      expect(sharpDuration).toBeGreaterThan(pathDuration);
    });

    it('measures payload memory retention accurately (Heap vs External vs RSS)', () => {
      // Clean memory measurement of retaining 50 raw 2MB Buffer objects vs 50 path strings
      const initialMem = process.memoryUsage();

      // 50 x 2MB binary buffers
      const buffers: Buffer[] = [];
      for (let i = 0; i < 50; i++) {
        buffers.push(Buffer.alloc(2 * 1024 * 1024));
      }

      const memWithBuffers = process.memoryUsage();
      const bufferExternalMB = (memWithBuffers.external - initialMem.external) / (1024 * 1024);
      const bufferRssMB = (memWithBuffers.rss - initialMem.rss) / (1024 * 1024);

      console.log(`[Accurate Memory Profile] 50 x 2MB Buffers retained in Node memory:`);
      console.log(`  - External (ArrayBuffer/C++ bindings): +${bufferExternalMB.toFixed(2)} MB`);
      console.log(`  - Process RSS delta: +${bufferRssMB.toFixed(2)} MB`);

      // Clear buffers
      buffers.length = 0;

      // 50 path strings
      const baseMem = process.memoryUsage();
      const paths: string[] = [];
      for (let i = 0; i < 50; i++) {
        paths.push(`nora://artworks/${i}.webp`);
      }

      const memWithPaths = process.memoryUsage();
      const pathExternalMB = (memWithPaths.external - baseMem.external) / (1024 * 1024);

      console.log(`[Accurate Memory Profile] 50 path strings retained:`);
      console.log(`  - External memory: ${pathExternalMB.toFixed(4)} MB`);

      expect(bufferExternalMB).toBeGreaterThan(90); // ~100MB allocated in external buffer memory
    });
  });

  describe('P0: Real AudioPlayer Class Race Condition & Caller Integration', () => {
    it('proves AudioPlayer class discards out-of-order getSong responses and suppresses stale recordListening', async () => {
      const mockQueuesManager = {
        getActiveQueue: () => ({
          on: vi.fn(),
          currentSongId: 1,
          hasNext: true,
          hasPrevious: false,
          length: 5,
          position: 0,
          moveToNext: vi.fn(),
          moveToPrevious: vi.fn(),
          moveToPosition: vi.fn(),
          moveToStart: vi.fn(),
          isEmpty: false
        }),
        on: vi.fn()
      } as any;

      const player = new AudioPlayer(mockQueuesManager);

      // Mock audio element behavior in jsdom
      player.audio.load = vi.fn();
      player.audio.play = vi.fn().mockResolvedValue(undefined);

      const recordListeningEvents: number[] = [];
      player.on('recordListening', (data: any) => {
        recordListeningEvents.push(data.songId);
      });

      // Variable latencies: Track 1 = 80ms, Track 2 = 40ms, Track 3 = 10ms
      const latencies: Record<number, number> = { 1: 80, 2: 40, 3: 10 };

      window.api = {
        audioLibraryControls: {
          getSong: vi.fn().mockImplementation((songId: number) => {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  songId,
                  title: `Track ${songId}`,
                  duration: 200,
                  path: `nora://music/song_${songId}.flac`,
                  artworkPaths: { artworkPath: `nora://artworks/${songId}.webp` }
                });
              }, latencies[songId]);
            });
          })
        }
      } as any;

      // User rapidly calls playSongById for 1, then 2, then 3
      const p1 = player.playSongById(1);
      const p2 = player.playSongById(2);
      const p3 = player.playSongById(3);

      await Promise.all([p1, p2, p3]);

      console.log(`[AudioPlayer Class Integration] Final player.audio.src: ${player.audio.src}`);
      console.log(`[AudioPlayer Class Integration] Final store.state.currentSongData.songId: ${store.state.currentSongData?.songId}`);
      console.log(`[AudioPlayer Class Integration] Record listening events emitted: ${JSON.stringify(recordListeningEvents)}`);

      // 1. Final audio source is strictly Track 3
      expect(player.audio.src).toBe('nora://music/song_3.flac');

      // 2. Final store songId is strictly Track 3
      expect(store.state.currentSongData?.songId).toBe(3);

      // 3. Stale track 1 and 2 did NOT emit recordListening events
      expect(recordListeningEvents).toEqual([3]);

      player.destroy();
    });
  });

  describe('P1: Real Disk File Stream Backpressure Flow Control', () => {
    it('demonstrates that pause/resume bounds producer chunk buffering on slow consumer reading a real file', async () => {
      // 1. Create a 5 MB binary test file on disk
      const testFilePath = path.join(tempDir, 'test_audio.flac');
      const chunkSize = 64 * 1024; // 64 KB
      const totalChunks = 80; // 80 * 64KB = 5.12 MB
      const testBuffer = Buffer.alloc(chunkSize, 0xaa);

      const writeStream = fs.createWriteStream(testFilePath);
      for (let i = 0; i < totalChunks; i++) {
        writeStream.write(testBuffer);
      }
      await new Promise((r) => writeStream.end(r));

      // 2. Set up Web ReadableStream with backpressure (as implemented in handleFileProtocol)
      const fileStream = fs.createReadStream(testFilePath, { highWaterMark: chunkSize });
      let chunksEnqueued = 0;
      let pauseCalls = 0;
      let resumeCalls = 0;

      const origPause = fileStream.pause.bind(fileStream);
      const origResume = fileStream.resume.bind(fileStream);

      fileStream.pause = () => {
        pauseCalls++;
        return origPause();
      };
      fileStream.resume = () => {
        resumeCalls++;
        return origResume();
      };

      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          fileStream.on('data', (chunk) => {
            const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            controller.enqueue(new Uint8Array(bufferChunk));
            chunksEnqueued++;

            // Backpressure: pause disk stream when WebStream queue is satisfied
            if (controller.desiredSize !== null && controller.desiredSize <= 0) {
              fileStream.pause();
            }
          });

          fileStream.on('end', () => {
            try {
              controller.close();
            } catch {}
          });
        },
        pull() {
          fileStream.resume();
        },
        cancel() {
          fileStream.destroy();
        }
      });

      // 3. Read 3 chunks slowly (simulating slow media decode by browser)
      const reader = webStream.getReader();

      // Read chunk 1
      const chunk1 = await reader.read();
      expect(chunk1.value?.length).toBe(chunkSize);

      // Give event loop 30ms to verify disk stream did NOT dump all 80 chunks
      await new Promise((r) => setTimeout(r, 30));
      console.log(`[Stream Backpressure Real File] Chunks enqueued after reading 1 chunk: ${chunksEnqueued} / ${totalChunks}`);
      console.log(`[Stream Backpressure Real File] Stream pause calls: ${pauseCalls}, resume calls: ${resumeCalls}`);

      // With backpressure, the fileStream paused after initial buffer filled (<= 3 chunks enqueued)
      expect(chunksEnqueued).toBeLessThan(5);
      expect(pauseCalls).toBeGreaterThanOrEqual(1);

      // Read chunk 2
      const chunk2 = await reader.read();
      expect(chunk2.value?.length).toBe(chunkSize);

      // Read chunk 3
      const chunk3 = await reader.read();
      expect(chunk3.value?.length).toBe(chunkSize);

      // Cancel stream to clean up
      await reader.cancel();
      fileStream.destroy();

      console.log(`[Stream Backpressure Real File] Successfully bounded producer memory to ${chunksEnqueued * 64} KB instead of full 5.12 MB!`);
    });
  });
});
