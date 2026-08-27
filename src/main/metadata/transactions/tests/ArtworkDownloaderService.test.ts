import http from 'http';
import type { AddressInfo } from 'net';
import { createHash } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArtworkDownloaderService, MAX_ARTWORK_BYTES } from '../ArtworkDownloaderService';

const makeJpeg = (sizeBytes: number): Buffer => {
  const buf = Buffer.alloc(sizeBytes);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  // deterministic filler
  createHash('sha1').update(String(sizeBytes)).digest().copy(buf, 16);
  return buf;
};

describe('ArtworkDownloaderService — hard size ceiling', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts artwork at or below the ceiling', async () => {
    const small = makeJpeg(1024);
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
      res.writeHead(200, { 'content-length': String(small.length) });
      res.end(small);
    });

    const downloader = new ArtworkDownloaderService(undefined);
    const result = await downloader.fetchAndValidateArtwork(`${baseUrl}/small.jpg`);
    expect(result).not.toBeNull();
    expect(result?.length).toBe(1024);
  });

  it('rejects early when content-length declares an oversized payload', async () => {
    const huge = makeJpeg(MAX_ARTWORK_BYTES + 1024);
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
      res.writeHead(200, { 'content-length': String(huge.length) });
      res.end(huge);
    });

    const downloader = new ArtworkDownloaderService(undefined);
    const result = await downloader.fetchAndValidateArtwork(`${baseUrl}/huge-declared.jpg`);
    expect(result).toBeNull();
  });

  it('aborts mid-stream when a lying server streams past the ceiling', async () => {
    // No content-length: chunked transfer larger than the cap
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
      res.writeHead(200);
      const chunk = makeJpeg(1024 * 1024); // 1MB chunks
      for (let i = 0; i < 9 && !res.writableEnded; i++) {
        res.write(chunk);
      }
      res.end();
    });

    const downloader = new ArtworkDownloaderService(undefined);
    const result = await downloader.fetchAndValidateArtwork(`${baseUrl}/huge-chunked.jpg`);
    expect(result).toBeNull();
  });

  it('HEAD pre-check refuses declared-oversized targets without a GET allocation (audit P1 #6)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        headers: { 'content-length': String(100 * 1024 * 1024) },
        data: undefined
      })
      .mockResolvedValue({ status: 200, headers: {}, data: makeJpeg(64) });

    const downloader = new ArtworkDownloaderService({ execute } as never);
    const result = await downloader.fetchAndValidateArtwork(`${baseUrl}/huge-head.jpg`);

    expect(result).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].method).toBe('HEAD'); // GET never allocated
  });
});
