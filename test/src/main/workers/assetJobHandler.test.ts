import fs from 'fs/promises';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_WAVEFORM_GENERATOR_VERSION,
  executeAssetJob,
  WAVEFORM_RESOLUTION
} from '@main/workers/process/handlers/assetJobHandler';

vi.mock('fs/promises');
vi.mock('sharp');
vi.mock('node-taglib-sharp');
vi.mock('@main/utils/extractFrontCover');

describe('assetJobHandler (Phase C4-B Worker Asset Generation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it('handles atomic rename collision gracefully when destination already exists', async () => {
      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        if (filePath === 'C:/Music/test.mp3') return { size: 1048576 } as any;
        if (filePath === 'C:/Cache/waveforms/1_v1.bin') return { size: 800 } as any;
        throw new Error('ENOENT');
      });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue(new Error('EEXIST'));
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
          destinationPath: 'C:/Cache/artworks/sample.webp'
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
          destinationPath: 'C:/Cache/artworks/sample.webp'
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
          destinationPath: 'C:/Cache/artworks/sample.webp'
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
});
