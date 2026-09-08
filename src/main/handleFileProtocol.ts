import { createReadStream, promises as fsp, type Stats } from 'fs';
import { pathToFileURL } from 'url';

import { net } from 'electron';
import mime from 'mime';

import logger from './logger';
import { getThumbnail, isThumbnailDisabled } from './thumbnails/thumbnailService';

export const decodeNoraFilePath = (urlStr: string): { filePath: string; host: string } => {
  const url = new URL(urlStr);
  const decodedPath = decodeURIComponent(url.pathname);
  const filePath =
    process.platform === 'darwin' ? decodedPath : decodedPath.replace(/^[/\\]{1,2}/gm, '');
  return { filePath, host: url.host };
};

export const handleFileProtocol = async (req: GlobalRequest) => {
  try {
    const { filePath, host } = decodeNoraFilePath(req.url);

    let stat: Stats;
    try {
      stat = await fsp.stat(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code && code !== 'ENOENT') throw err;
      logger.warn('File not found via nora:// protocol', { url: req.url, filePath });
      return new Response('File not found', { status: 404 });
    }

    if (host === 'thumb' && !isThumbnailDisabled()) {
      try {
        const thumb = await getThumbnail(filePath);
        if (thumb) {
          const ifNoneMatch = req.headers.get('if-none-match');
          if (ifNoneMatch && ifNoneMatch === thumb.etag) {
            return new Response(null, {
              status: 304,
              headers: {
                ETag: thumb.etag,
                'Cache-Control': 'no-cache'
              }
            });
          }

          return new Response(new Uint8Array(thumb.buffer), {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'no-cache',
              'Accept-Ranges': 'bytes',
              'Content-Length': thumb.buffer.length.toString(),
              ETag: thumb.etag
            }
          });
        }
      } catch (thumbErr) {
        logger.debug('Thumbnail generation fallback to full-res', { filePath, thumbErr });
      }
    }

    const mimeType = mime.getType(filePath) || 'application/octet-stream';
    const fileSize = stat.size;
    const mtimeMs = Math.trunc(stat.mtimeMs);
    const etag = `"${fileSize}-${mtimeMs}"`;

    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'no-cache'
        }
      });
    }

    const range = req.headers.get('range');
    logger.silly('Serving file from nora://', { url: req.url, range, filePath, mimeType });

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      ETag: etag
    };

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new Response(null, {
          status: 416,
          headers: { ...headers, 'Content-Range': `bytes */${fileSize}` }
        });
      }

      const chunksize = end - start + 1;

      // Create a proper ReadableStream with backpressure from the file stream
      const fileStream = createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });

      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => {
            try {
              // Ensure chunk is a Buffer before converting to Uint8Array
              const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              controller.enqueue(new Uint8Array(bufferChunk));

              // Apply backpressure: pause disk read when WebStream buffer is full
              if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                fileStream.pause();
              }
            } catch (error) {
              // Stream might be closed, ignore the error
              if (controller.desiredSize !== null) {
                controller.error(error);
              }
            }
          });

          fileStream.on('end', () => {
            try {
              controller.close();
            } catch {
              // Stream might already be closed, ignore the error
            }
          });

          fileStream.on('error', (error) => {
            try {
              controller.error(error);
            } catch {
              // Stream might already be closed, ignore the error
            }
          });
        },

        pull() {
          // Resume reading when downstream consumer needs more data
          fileStream.resume();
        },

        cancel() {
          fileStream.destroy();
        }
      });

      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
      headers['Content-Length'] = chunksize.toString();

      return new Response(webStream, {
        status: 206,
        headers
      });
    } else if (typeof net?.fetch === 'function') {
      const asFileUrl = pathToFileURL(filePath).toString();
      const response = await net.fetch(asFileUrl);
      const resHeaders = new Headers(response.headers);
      resHeaders.set('ETag', etag);
      resHeaders.set('Cache-Control', 'no-cache');
      resHeaders.set('Accept-Ranges', 'bytes');
      if (mimeType) {
        resHeaders.set('Content-Type', mimeType);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders
      });
    } else {
      const fileData = await fsp.readFile(filePath);
      return new Response(new Uint8Array(fileData), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache',
          'Accept-Ranges': 'bytes',
          'Content-Length': fileSize.toString(),
          ETag: etag
        }
      });
    }
  } catch (error) {
    logger.error('Error handling media protocol:', { error }, error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
