import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_REPLAYGAIN_GENERATOR_VERSION,
  CURRENT_WAVEFORM_GENERATOR_VERSION,
  executeAssetJob,
  WAVEFORM_RESOLUTION
} from '@main/workers/process/handlers/assetJobHandler';
import { defaultAudioDecoderRegistry } from '@main/workers/process/audio/AudioDecoderRegistry';

vi.mock('fs/promises');
vi.mock('sharp');
vi.mock('node-taglib-sharp');
vi.mock('@main/utils/extractFrontCover');

describe('assetJobHandler (Phase C4 Worker Asset Generation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultAudioDecoderRegistry.registerDecoder({
      codec: 'mock_decoder',
      supports: (f) => /\.mp3$/i.test(f) || /\.wav$/i.test(f),
      probe: async () => ({
        sampleRate: 44100,
        channels: 2,
        bitDepth: 16,
        duration: 1,
        totalSamples: 44100,
        codec: 'mock_codec'
      }),
      decodeStream: async (_file, _opts, onChunk) => {
        const samples = new Float32Array(44100).fill(0.5);
        await onChunk({
          channelData: [samples, samples],
          sampleOffset: 0,
          frameCount: 44100,
          totalSamples: 44100
        });
      }
    });
  });

  describe('Waveform Generation', () => {
    it('generates Float32Array(200) peaks and writes atomically to destination', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1048576 } as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const result = await executeAssetJob({
        taskId: 'task-waveform-1',
        jobType: 'waveform',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/waveforms/1_v1.bin'
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputFilePath).toBe('C:/Cache/waveforms/1_v1.bin');
        expect(result.metadata.resolution).toBe(WAVEFORM_RESOLUTION);
        expect(result.metadata.generatorVersion).toBe(CURRENT_WAVEFORM_GENERATOR_VERSION);
      }

      // Verify atomic temp file write and rename
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/1_v1\.bin\.\d+\.task-waveform-1\.tmp$/),
        expect.any(Buffer)
      );
      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringMatching(/1_v1\.bin\.\d+\.task-waveform-1\.tmp$/),
        'C:/Cache/waveforms/1_v1.bin'
      );
    });

    it('handles cancellation and cleans up temp file', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1048576 } as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const controller = new AbortController();
      controller.abort();

      const result = await executeAssetJob({
        taskId: 'task-cancel-1',
        jobType: 'waveform',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/waveforms/1_v1.bin'
        },
        abortSignal: controller.signal
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.cancelled).toBe(true);
      }
    });

    it('handles atomic rename collision gracefully when destination already exists with EEXIST code', async () => {
      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        if (filePath === 'C:/Music/test.mp3') return { size: 1048576 } as any;
        if (filePath === 'C:/Cache/waveforms/1_v1.bin') return { size: 800 } as any;
        throw new Error('ENOENT');
      });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const eexistError: any = new Error('EEXIST: file already exists');
      eexistError.code = 'EEXIST';
      vi.mocked(fs.rename).mockRejectedValue(eexistError);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await executeAssetJob({
        taskId: 'task-collision-1',
        jobType: 'waveform',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/waveforms/1_v1.bin'
        }
      });

      expect(result.success).toBe(true);
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/1_v1\.bin\.\d+\.task-collision-1\.tmp$/)
      );
    });

    it('rethrows fatal permission error during atomic publish without swallowing as collision', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1048576 } as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const permError: any = new Error('EACCES: permission denied');
      permError.code = 'EACCES';
      vi.mocked(fs.rename).mockRejectedValue(permError);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await executeAssetJob({
        taskId: 'task-perm-error',
        jobType: 'waveform',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/waveforms/1_v1.bin'
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('EACCES');
      }
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/1_v1\.bin\.\d+\.task-perm-error\.tmp$/)
      );
    });
  });

  describe('Artwork Generation', () => {
    it('extracts ID3 cover, generates 50x50 optimized and full WebP images atomically', async () => {
      const mockDispose = vi.fn();
      const taglib = await import('node-taglib-sharp');
      vi.mocked(taglib.File.createFromPath).mockReturnValue({
        tag: { pictures: [{ data: { toByteArray: () => new Uint8Array([1, 2, 3, 4]) } }] },
        dispose: mockDispose
      } as any);

      const { extractFrontCover } = await import('@main/utils/extractFrontCover');
      vi.mocked(extractFrontCover).mockReturnValue(new Uint8Array([1, 2, 3, 4]));

      const sharp = (await import('sharp')).default;
      const mockSharpInstance = {
        webp: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue({ width: 500, height: 500 })
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const result = await executeAssetJob({
        taskId: 'task-artwork-1',
        jobType: 'artwork',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/artworks'
        }
      });

      expect(mockDispose).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.hasEmbeddedArtwork).toBe(true);
        expect(result.metadata.isDefaultArtwork).toBe(false);
        expect(result.metadata.width).toBe(500);
        expect(result.metadata.height).toBe(500);
        expect(Array.isArray(result.metadata.payloads)).toBe(true);
      }

      // Verify Sharp calls: 50x50 quality 50 for optimized, full for main
      expect(mockSharpInstance.webp).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 50, effort: 0 })
      );
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(50, 50);
      expect(fs.rename).toHaveBeenCalledTimes(2);
    });

    it('rolls back newly published optimized file if full-image publication fails (Dual Publication Atomicity)', async () => {
      const mockDispose = vi.fn();
      const taglib = await import('node-taglib-sharp');
      vi.mocked(taglib.File.createFromPath).mockReturnValue({
        tag: { pictures: [{ data: { toByteArray: () => new Uint8Array([1, 2, 3, 4]) } }] },
        dispose: mockDispose
      } as any);

      const { extractFrontCover } = await import('@main/utils/extractFrontCover');
      vi.mocked(extractFrontCover).mockReturnValue(new Uint8Array([1, 2, 3, 4]));

      const sharp = (await import('sharp')).default;
      const mockSharpInstance = {
        webp: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue({ width: 500, height: 500 })
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      // First rename (optimized) succeeds, second rename (full) fails
      let renameCallCount = 0;
      vi.mocked(fs.rename).mockImplementation(async () => {
        renameCallCount++;
        if (renameCallCount === 2) {
          const err: any = new Error('EIO: disk error on full webp publish');
          err.code = 'EIO';
          throw err;
        }
      });

      const result = await executeAssetJob({
        taskId: 'task-artwork-partial-fail',
        jobType: 'artwork',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/artworks'
        }
      });

      expect(result.success).toBe(false);
      // PROVE: rollback unlinked the newly published optimized file to avoid half-state
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/-optimized\.webp$/)
      );
    });

    it('preserves pre-existing optimized webp when collision occurs and full webp publish fails', async () => {
      const mockDispose = vi.fn();
      const taglib = await import('node-taglib-sharp');
      vi.mocked(taglib.File.createFromPath).mockReturnValue({
        tag: { pictures: [{ data: { toByteArray: () => new Uint8Array([1, 2, 3, 4]) } }] },
        dispose: mockDispose
      } as any);

      const { extractFrontCover } = await import('@main/utils/extractFrontCover');
      vi.mocked(extractFrontCover).mockReturnValue(new Uint8Array([1, 2, 3, 4]));

      const sharp = (await import('sharp')).default;
      const mockSharpInstance = {
        webp: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue({ width: 500, height: 500 })
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // Destination for optimized webp already exists (collision)
      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        if (filePath.endsWith('-optimized.webp')) return { size: 4096 } as any;
        throw new Error('ENOENT');
      });

      const eexistError: any = new Error('EEXIST: file already exists');
      eexistError.code = 'EEXIST';

      // First rename gets EEXIST (collision with existing file), second rename gets EIO fatal error
      vi.mocked(fs.rename)
        .mockRejectedValueOnce(eexistError)
        .mockRejectedValueOnce(new Error('EIO: Disk I/O error on full webp'));

      const result = await executeAssetJob({
        taskId: 'task-artwork-existing-opt-fail',
        jobType: 'artwork',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/artworks'
        }
      });

      expect(result.success).toBe(false);
      // PROVE: rollback NEVER unlinks the pre-existing optimized webp (only temp files unlinked)
      expect(fs.unlink).not.toHaveBeenCalledWith(
        expect.stringMatching(/artworks[\\\/][a-f0-9]+-optimized\.webp$/)
      );
    });

    it('rethrows error and unlinks temp if rename fails with collision code but destination stat fails', async () => {
      const mockDispose = vi.fn();
      const taglib = await import('node-taglib-sharp');
      vi.mocked(taglib.File.createFromPath).mockReturnValue({
        tag: { pictures: [{ data: { toByteArray: () => new Uint8Array([1, 2, 3, 4]) } }] },
        dispose: mockDispose
      } as any);

      const { extractFrontCover } = await import('@main/utils/extractFrontCover');
      vi.mocked(extractFrontCover).mockReturnValue(new Uint8Array([1, 2, 3, 4]));

      const sharp = (await import('sharp')).default;
      const mockSharpInstance = {
        webp: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue({ width: 500, height: 500 })
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // Stat fails (e.g. destination does NOT exist or permission error)
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      const epermError: any = new Error('EPERM: operation not permitted');
      epermError.code = 'EPERM';
      vi.mocked(fs.rename).mockRejectedValue(epermError);

      const result = await executeAssetJob({
        taskId: 'task-artwork-eperm-no-dest',
        jobType: 'artwork',
        input: {
          sourceFilePath: 'C:/Music/test.mp3',
          destinationPath: 'C:/Cache/artworks'
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('EPERM');
      }
    });

    it('returns isDefaultArtwork = true when song has no embedded artwork', async () => {
      const mockDispose = vi.fn();
      const taglib = await import('node-taglib-sharp');
      vi.mocked(taglib.File.createFromPath).mockReturnValue({
        tag: { pictures: [] },
        dispose: mockDispose
      } as any);

      const { extractFrontCover } = await import('@main/utils/extractFrontCover');
      vi.mocked(extractFrontCover).mockReturnValue(undefined);

      const result = await executeAssetJob({
        taskId: 'task-artwork-none',
        jobType: 'artwork',
        input: {
          sourceFilePath: 'C:/Music/noart.mp3',
          destinationPath: 'C:/Cache/artworks'
        }
      });

      expect(mockDispose).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.isDefaultArtwork).toBe(true);
        expect(result.metadata.hasEmbeddedArtwork).toBe(false);
      }
    });

    it('cleans up temp files if Sharp processing fails', async () => {
      const mockDispose = vi.fn();
      const taglib = await import('node-taglib-sharp');
      vi.mocked(taglib.File.createFromPath).mockReturnValue({
        tag: { pictures: [{ data: { toByteArray: () => new Uint8Array([1, 2, 3, 4]) } }] },
        dispose: mockDispose
      } as any);

      const { extractFrontCover } = await import('@main/utils/extractFrontCover');
      vi.mocked(extractFrontCover).mockReturnValue(new Uint8Array([1, 2, 3, 4]));

      const sharp = (await import('sharp')).default;
      const mockSharpInstance = {
        webp: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockRejectedValue(new Error('VipsJpeg: Corrupt JPEG data'))
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await executeAssetJob({
        taskId: 'task-corrupt-art',
        jobType: 'artwork',
        input: {
          sourceFilePath: 'C:/Music/corrupt.mp3',
          destinationPath: 'C:/Cache/artworks'
        }
      });

      expect(mockDispose).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Corrupt JPEG data');
      }
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('ReplayGain Loudness Analysis (Phase C4-C)', () => {
    it('computes loudness metrics from audio file in worker', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1048576 } as any);

      const result = await executeAssetJob({
        taskId: 'task-rg-1',
        jobType: 'replaygain',
        input: {
          sourceFilePath: 'C:/Music/song.mp3',
          destinationPath: ''
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.metadata.trackGain).toBe('number');
        expect(typeof result.metadata.trackPeak).toBe('number');
        expect(typeof result.metadata.samplePeak).toBe('number');
        expect(typeof result.metadata.integratedLoudness).toBe('number');
        expect(result.metadata.generatorVersion).toBe(CURRENT_REPLAYGAIN_GENERATOR_VERSION);
      }
    });

    it('handles cancellation cleanly during ReplayGain analysis', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1048576 } as any);

      const controller = new AbortController();
      controller.abort();

      const result = await executeAssetJob({
        taskId: 'task-rg-cancel',
        jobType: 'replaygain',
        input: {
          sourceFilePath: 'C:/Music/song.mp3',
          destinationPath: ''
        },
        abortSignal: controller.signal
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.cancelled).toBe(true);
      }
    });
  });
});
