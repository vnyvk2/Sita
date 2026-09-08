import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { addDefaultAppProtocolToFilePath } from '../../../src/main/fs/resolveFilePaths';
import { decodeNoraFilePath, handleFileProtocol } from '../../../src/main/handleFileProtocol';

describe('Production handleFileProtocol Deterministic Tests', () => {
  let tempDir: string;
  let sampleFilePath: string;
  const fileSize = 256 * 1024; // 256 KB

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-protocol-test-'));
    sampleFilePath = path.join(tempDir, 'audio_sample.mp3');
    fs.writeFileSync(sampleFilePath, Buffer.alloc(fileSize, 0x55));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('returns 404 for non-existent file paths', async () => {
    const missingUrl = addDefaultAppProtocolToFilePath('C:/invalid/path/missing.mp3');
    const req = new Request(missingUrl);

    const response = await handleFileProtocol(req as any);
    expect(response.status).toBe(404);
  });

  it('returns 416 Range Not Satisfiable when range start exceeds file size', async () => {
    const fileUrl = addDefaultAppProtocolToFilePath(sampleFilePath);
    const req = new Request(fileUrl, {
      headers: { range: `bytes=${fileSize + 1000}-` }
    });

    const response = await handleFileProtocol(req as any);
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe(`bytes */${fileSize}`);
  });

  it('serves 206 Partial Content with correct Content-Range and headers', async () => {
    const fileUrl = addDefaultAppProtocolToFilePath(sampleFilePath);
    const req = new Request(fileUrl, {
      headers: { range: 'bytes=0-1023' }
    });

    const response = await handleFileProtocol(req as any);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-1023/${fileSize}`);
    expect(response.headers.get('Content-Length')).toBe('1024');

    // Read the chunk from body stream
    const reader = response.body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value?.length).toBe(1024);
  });

  it('verifies backpressure flow control and cancellation on the actual handleFileProtocol stream', async () => {
    // Create a 5.12 MB binary file (80 x 64KB chunks)
    const largeFilePath = path.join(tempDir, 'large_sample.flac');
    const chunkSize = 64 * 1024;
    const writeStream = fs.createWriteStream(largeFilePath);
    for (let i = 0; i < 80; i++) {
      writeStream.write(Buffer.alloc(chunkSize, 0x77));
    }
    await new Promise((r) => writeStream.end(r));

    const largeFileUrl = addDefaultAppProtocolToFilePath(largeFilePath);
    const req = new Request(largeFileUrl, {
      headers: { range: 'bytes=0-' }
    });

    const response = await handleFileProtocol(req as any);
    expect(response.status).toBe(206);
    expect(response.body).toBeDefined();

    const reader = response.body!.getReader();

    // Read 1 chunk
    const chunk1 = await reader.read();
    expect(chunk1.value?.length).toBe(chunkSize);

    // Cancel reader to test destruction / cleanup
    await reader.cancel();

    // Reading after cancellation yields done: true
    const chunkAfterCancel = await reader.read();
    expect(chunkAfterCancel.done).toBe(true);
  });

  it('generates ETag header and returns 304 Not Modified when If-None-Match matches', async () => {
    const fileUrl = addDefaultAppProtocolToFilePath(sampleFilePath);
    const stat = fs.statSync(sampleFilePath);
    const expectedEtag = `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;

    // First request without If-None-Match
    const req1 = new Request(fileUrl, {
      headers: { range: 'bytes=0-1023' }
    });
    const res1 = await handleFileProtocol(req1 as any);
    expect(res1.headers.get('ETag')).toBe(expectedEtag);

    // Second request with matching If-None-Match
    const req2 = new Request(fileUrl, {
      headers: { 'if-none-match': expectedEtag }
    });
    const res2 = await handleFileProtocol(req2 as any);
    expect(res2.status).toBe(304);
    expect(res2.headers.get('ETag')).toBe(expectedEtag);
    expect(res2.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('returns 200/206 with updated ETag when file is modified', async () => {
    const fileUrl = addDefaultAppProtocolToFilePath(sampleFilePath);
    const oldEtag = `"123-456"`;

    const req = new Request(fileUrl, {
      headers: {
        'if-none-match': oldEtag,
        range: 'bytes=0-1023'
      }
    });
    const res = await handleFileProtocol(req as any);
    expect(res.status).toBe(206);
    expect(res.headers.get('ETag')).not.toBe(oldEtag);
  });

  it('correctly extracts filePath and host across different nora:// URL formats', () => {
    const r1 = decodeNoraFilePath('nora://localfiles/C:/music/track.mp3');
    expect(r1.host).toBe('localfiles');
    expect(r1.filePath).toBe('C:/music/track.mp3');

    const r2 = decodeNoraFilePath('nora://thumb/C:/covers/album.jpg');
    expect(r2.host).toBe('thumb');
    expect(r2.filePath).toBe('C:/covers/album.jpg');
  });

  it('falls back to serving full file when thumbnail is requested for non-image or disabled', async () => {
    // sampleFilePath is audio_sample.mp3 (not an image, nativeImage will be empty)
    const thumbUrl = `nora://thumb/${sampleFilePath.replace(/\\/g, '/')}`;
    const req = new Request(thumbUrl);

    const res = await handleFileProtocol(req as any);
    // Should fallback to serving the file (200/206 depending on range)
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeDefined();
  });

  it('rethrows non-ENOENT filesystem errors (e.g. EACCES) resulting in 500 Internal Server Error', async () => {
    const fileUrl = addDefaultAppProtocolToFilePath(sampleFilePath);
    const req = new Request(fileUrl);

    // Mock fsp.stat to reject with EACCES
    const statSpy = vi.spyOn(fs.promises, 'stat').mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { code: 'EACCES' })
    );

    const res = await handleFileProtocol(req as any);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal Server Error');

    statSpy.mockRestore();
  });
});
