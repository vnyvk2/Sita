import http from 'http';
import https from 'https';
import type { RequestPipeline } from '../../platform/networking/RequestPipeline';

export class ArtworkDownloaderService {
  private readonly requestPipeline?: RequestPipeline;

  constructor(requestPipeline?: RequestPipeline) {
    this.requestPipeline = requestPipeline;
  }

  public async fetchAndValidateArtwork(url: string, timeoutMs = 15000): Promise<Buffer | null> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return null;
    }

    if (this.requestPipeline) {
      try {
        const res = await this.requestPipeline.execute<Buffer>({
          url,
          method: 'GET',
          responseType: 'buffer',
          timeoutMs
        });
        if (res.data && this.validateMagicBytes(res.data)) {
          return res.data;
        }
      } catch (_err) {
        // Fallback to node http/https
      }
    }

    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (this.validateMagicBytes(buffer)) {
            resolve(buffer);
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  public validateMagicBytes(buffer: Buffer): boolean {
    if (buffer.length < 16) return false;

    // JPEG: 0xFF 0xD8 0xFF
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (isJpeg) return true;

    // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    if (isPng) return true;

    // WebP: RIFF (bytes 0-3: 0x52 0x49 0x46 0x46) and WEBP (bytes 8-11: 0x57 0x45 0x42 0x50)
    const isWebp =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    if (isWebp) return true;

    // AVIF: ISO-BMFF box header with ftyp (bytes 4-7: 0x66 0x74 0x79 0x70) and major_brand avif/avis (bytes 8-11)
    const isAvif =
      buffer[4] === 0x66 &&
      buffer[5] === 0x74 &&
      buffer[6] === 0x79 &&
      buffer[7] === 0x70 &&
      buffer[8] === 0x61 &&
      buffer[9] === 0x76 &&
      buffer[10] === 0x69 &&
      (buffer[11] === 0x66 || buffer[11] === 0x73);
    if (isAvif) return true;

    return false;
  }
}
