import { describe, expect, it } from 'vitest';
import { ArtworkDownloaderService } from '@main/metadata/transactions/ArtworkDownloaderService';

describe('ArtworkDownloaderService (Phase 3 Magic Bytes Validation)', () => {
  const service = new ArtworkDownloaderService();

  it('validates standard JPEG magic bytes (0xFF 0xD8 0xFF)', () => {
    const validJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
    ]);
    expect(service.validateMagicBytes(validJpeg)).toBe(true);
  });

  it('validates standard PNG magic bytes (0x89 PNG header)', () => {
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
    ]);
    expect(service.validateMagicBytes(validPng)).toBe(true);
  });

  it('validates WebP magic bytes (RIFF....WEBP)', () => {
    const validWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x20, 0x00, 0x00, 0x00, // file length
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
      0x56, 0x50, 0x38, 0x20  // 'VP8 '
    ]);
    expect(service.validateMagicBytes(validWebp)).toBe(true);
  });

  it('validates AVIF magic bytes (....ftypavif or ....ftypavis)', () => {
    const validAvif = Buffer.from([
      0x00, 0x00, 0x00, 0x1c, // box length
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x61, 0x76, 0x69, 0x66, // 'avif'
      0x00, 0x00, 0x00, 0x00
    ]);
    expect(service.validateMagicBytes(validAvif)).toBe(true);

    const validAvis = Buffer.from([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x61, 0x76, 0x69, 0x73, // 'avis'
      0x00, 0x00, 0x00, 0x00
    ]);
    expect(service.validateMagicBytes(validAvis)).toBe(true);
  });

  it('rejects arbitrary RIFF data that is not WebP (e.g. WAV/AVI)', () => {
    const riffWav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // 'WAVE' (not WEBP)
      0x66, 0x6d, 0x74, 0x20
    ]);
    expect(service.validateMagicBytes(riffWav)).toBe(false);
  });

  it('rejects arbitrary ftyp data that is not AVIF (e.g. MP4/QuickTime)', () => {
    const ftypMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // 'isom' (MP4, not avif)
      0x00, 0x00, 0x02, 0x00
    ]);
    expect(service.validateMagicBytes(ftypMp4)).toBe(false);
  });

  it('rejects truncated buffers (< 16 bytes)', () => {
    const truncated = Buffer.from([0xff, 0xd8, 0xff]);
    expect(service.validateMagicBytes(truncated)).toBe(false);
  });

  it('rejects HTML 404 / text masquerading as image', () => {
    const htmlResponse = Buffer.from('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    expect(service.validateMagicBytes(htmlResponse)).toBe(false);

    const jsonResponse = Buffer.from('{"error":"Not Found","statusCode":404}');
    expect(service.validateMagicBytes(jsonResponse)).toBe(false);
  });
});
