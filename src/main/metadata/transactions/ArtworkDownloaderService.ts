import http from 'http';
import https from 'https';
import type { RequestPipeline } from '../../platform/networking/RequestPipeline';

/** Hard ceiling for downloaded artwork before it enters the write pipeline. */
export const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;

export class ArtworkDownloaderService {
  private readonly requestPipeline?: RequestPipeline;
  private readonly maxBytes: number;

  constructor(requestPipeline?: RequestPipeline, maxBytes = MAX_ARTWORK_BYTES) {
    this.requestPipeline = requestPipeline;
    this.maxBytes = maxBytes;
  }

  public async fetchAndValidateArtwork(url: string, timeoutMs = 15000): Promise<Buffer | null> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return null;
    }

    if (this.requestPipeline) {
      try {
        // Audit P1 #6: the pipeline buffers the whole body before we can look
        // at it, so probe the declared size first and refuse oversized targets
        // without ever allocating (servers may still lie - the post-check and
        // streaming fallback remain the hard guarantees).
        try {
          const head = await this.requestPipeline.execute<unknown>({
            url,
            method: 'HEAD',
            timeoutMs
          });
          const headers = (head as unknown as { headers?: Record<string, string> }).headers ?? {};
          const declared = Number(headers['content-length']);
          if (Number.isFinite(declared) && declared > this.maxBytes) {
            return null;
          }
        } catch {
          // HEAD unsupported/blocked -> proceed to GET; post-check guards.
        }

        const res = await this.requestPipeline.execute<Buffer>({
          url,
          method: 'GET',
          responseType: 'buffer',
          timeoutMs
        });
        if (res.data && this.validateMagicBytes(res.data)) {
          // Pipeline path buffers the whole body before we see it; enforce the
          // cap on the result so oversized payloads never reach the writer.
          if (res.data.length > this.maxBytes) {
            return null;
          }
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

        // Reject early when the server declares an oversized payload
        const declaredLength = Number(res.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
          res.destroy();
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          // Hard stop mid-stream for servers that lie about (or omit) size
          if (totalBytes > this.maxBytes) {
            res.destroy();
            resolve(null);
            return;
          }
          chunks.push(chunk);
        });
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
