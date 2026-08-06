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

  private validateMagicBytes(buffer: Buffer): boolean {
    if (buffer.length < 16) return false;
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    return isJpeg || isPng;
  }
}
