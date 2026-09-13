import type { ArtworkDownloaderService } from '../transactions/ArtworkDownloaderService';

export interface ICoverArtBufferService {
  fetchBuffer(url: string, timeoutMs?: number): Promise<Buffer | null>;
  clearCache(): void;
}

export class CoverArtBufferService implements ICoverArtBufferService {
  private readonly downloader: ArtworkDownloaderService;
  private readonly bufferCache = new Map<string, Buffer>();
  private readonly inFlight = new Map<string, Promise<Buffer | null>>();
  private readonly maxCacheSize: number;

  constructor(downloader: ArtworkDownloaderService, maxCacheSize = 30) {
    this.downloader = downloader;
    this.maxCacheSize = maxCacheSize;
  }

  public async fetchBuffer(url: string, timeoutMs = 15000): Promise<Buffer | null> {
    if (!url || typeof url !== 'string') return null;

    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) return null;

    if (this.bufferCache.has(trimmed)) {
      return this.bufferCache.get(trimmed)!;
    }

    const existingPromise = this.inFlight.get(trimmed);
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      try {
        const buffer = await this.downloader.fetchAndValidateArtwork(trimmed, timeoutMs);
        if (buffer) {
          if (this.bufferCache.size >= this.maxCacheSize) {
            const firstKey = this.bufferCache.keys().next().value;
            if (firstKey) this.bufferCache.delete(firstKey);
          }
          this.bufferCache.set(trimmed, buffer);
        }
        return buffer;
      } finally {
        this.inFlight.delete(trimmed);
      }
    })();

    this.inFlight.set(trimmed, fetchPromise);
    return fetchPromise;
  }

  public clearCache(): void {
    this.bufferCache.clear();
    this.inFlight.clear();
  }
}
