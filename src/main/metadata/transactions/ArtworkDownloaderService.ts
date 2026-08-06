import http from 'http';
import https from 'https';

export class ArtworkDownloaderService {
  public async fetchAndValidateArtwork(url: string, timeoutMs = 15000): Promise<Buffer | null> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return null;
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
          if (buffer.length < 16) {
            resolve(null);
            return;
          }

          // Validate magic bytes (JPEG or PNG)
          const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
          const isPng =
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47;

          if (isJpeg || isPng) {
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
}
