import fs from 'fs';
import os from 'os';
import path from 'path';

import { TagWriterService } from '@main/metadata/services/TagWriterService';
import { File } from 'node-taglib-sharp';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Round-trip gate for the download-song feature.
 *
 * Verifies that node-taglib-sharp (via TagWriterService) can write tags AND embedded artwork to the
 * exact container formats yt-dlp produces for audio-only downloads:
 *
 * - M4A (AAC in MP4 container, yt-dlp `-f bestaudio[ext=m4a]`)
 * - OPUS (Opus in Ogg container, yt-dlp `-f bestaudio[ext=opus]`)
 *
 * This is a FORMAT-CAPABILITY gate: if a container listed in the extractor's SUPPORTED_EXTENSIONS
 * cannot hold tags/artwork, the whitelist must be corrected so the pipeline never advertises a
 * format it cannot tag. A transient runtime tagging failure on an otherwise supported file is
 * tolerated by design — the audio is kept and library parsing falls back to the filename.
 */

const FIXTURES_DIR = path.resolve(__dirname, '../../../../../test/fixtures/downloads');
const FIXTURES = ['sample.m4a', 'sample.opus'];

describe('TagWriterService round-trip on downloaded-audio formats', () => {
  let tempDir: string;
  const service = new TagWriterService();

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-download-tagging-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeArtworkBuffer = async (): Promise<Buffer> =>
    sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 120, g: 40, b: 200 }
      }
    })
      .png()
      .toBuffer();

  describe.each(FIXTURES)('%s', (fixtureName) => {
    it('writes and reads back metadata', async () => {
      const filePath = path.join(tempDir, fixtureName);
      fs.copyFileSync(path.join(FIXTURES_DIR, fixtureName), filePath);

      const result = await service.writeTags({
        filePath,
        title: 'Round Trip Title',
        artist: 'Round Trip Artist',
        album: 'Round Trip Album',
        year: 2026,
        trackNumber: 7,
        genre: 'Test Genre'
      });

      expect(result.success).toBe(true);

      const file = File.createFromPath(filePath);
      try {
        expect(file.tag.title).toBe('Round Trip Title');
        expect(file.tag.performers).toContain('Round Trip Artist');
        expect(file.tag.album).toBe('Round Trip Album');
        expect(file.tag.year).toBe(2026);
        expect(file.tag.track).toBe(7);
        expect(file.tag.genres).toContain('Test Genre');
      } finally {
        file.dispose();
      }
    });

    it('embeds and reads back front-cover artwork', async () => {
      const filePath = path.join(tempDir, fixtureName);
      fs.copyFileSync(path.join(FIXTURES_DIR, fixtureName), filePath);

      const artworkBuffer = await makeArtworkBuffer();

      const result = await service.writeTags({
        filePath,
        title: 'Artwork Probe',
        artworkBuffer
      });

      expect(result.success).toBe(true);

      const file = File.createFromPath(filePath);
      try {
        expect(file.tag.pictures.length).toBeGreaterThan(0);
        const picture = file.tag.pictures[0];
        expect(picture.data.length).toBeGreaterThan(0);
        expect(picture.data.toByteArray().length).toBeGreaterThan(0);
        expect(picture.type).toBeDefined();
      } finally {
        file.dispose();
      }
    });
  });
});
