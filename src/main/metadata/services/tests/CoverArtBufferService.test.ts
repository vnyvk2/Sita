import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverArtBufferService } from '../CoverArtBufferService';
import type { ArtworkDownloaderService } from '../../transactions/ArtworkDownloaderService';

describe('CoverArtBufferService', () => {
  let mockDownloader: ArtworkDownloaderService;

  beforeEach(() => {
    mockDownloader = {
      fetchAndValidateArtwork: vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('invalid')) return null;
        return Buffer.from(`fake-image-bytes-for-${url}`);
      })
    } as unknown as ArtworkDownloaderService;
  });

  it('fetches buffer and returns it', async () => {
    const service = new CoverArtBufferService(mockDownloader);
    const buf = await service.fetchBuffer('https://example.com/art.jpg');

    expect(buf).not.toBeNull();
    expect(buf?.toString()).toBe('fake-image-bytes-for-https://example.com/art.jpg');
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(1);
  });

  it('caches the downloaded buffer and does not call downloader again', async () => {
    const service = new CoverArtBufferService(mockDownloader);
    const url = 'https://example.com/cover.jpg';

    const buf1 = await service.fetchBuffer(url);
    const buf2 = await service.fetchBuffer(url);

    expect(buf1).toBe(buf2);
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent in-flight fetches for the same URL', async () => {
    const service = new CoverArtBufferService(mockDownloader);
    const url = 'https://example.com/concurrent.jpg';

    const [b1, b2, b3] = await Promise.all([
      service.fetchBuffer(url),
      service.fetchBuffer(url),
      service.fetchBuffer(url)
    ]);

    expect(b1).toBe(b2);
    expect(b2).toBe(b3);
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(1);
  });

  it('returns null for non-http or invalid URLs without calling downloader', async () => {
    const service = new CoverArtBufferService(mockDownloader);

    expect(await service.fetchBuffer('')).toBeNull();
    expect(await service.fetchBuffer('ftp://example.com/art.jpg')).toBeNull();
    expect(await service.fetchBuffer('file:///local/art.jpg')).toBeNull();
    expect(mockDownloader.fetchAndValidateArtwork).not.toHaveBeenCalled();
  });

  it('evicts oldest entry when exceeding maxCacheSize', async () => {
    const service = new CoverArtBufferService(mockDownloader, 2);

    await service.fetchBuffer('https://example.com/1.jpg');
    await service.fetchBuffer('https://example.com/2.jpg');
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(2);

    // 3rd fetch triggers eviction of 1.jpg
    await service.fetchBuffer('https://example.com/3.jpg');
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(3);

    // Requesting 1.jpg again causes re-fetch
    await service.fetchBuffer('https://example.com/1.jpg');
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(4);

    // Requesting 3.jpg uses cache
    await service.fetchBuffer('https://example.com/3.jpg');
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(4);
  });

  it('clears cache on clearCache()', async () => {
    const service = new CoverArtBufferService(mockDownloader);
    const url = 'https://example.com/art.jpg';

    await service.fetchBuffer(url);
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(1);

    service.clearCache();

    await service.fetchBuffer(url);
    expect(mockDownloader.fetchAndValidateArtwork).toHaveBeenCalledTimes(2);
  });
});
