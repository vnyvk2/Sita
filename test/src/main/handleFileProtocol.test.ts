import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { handleFileProtocol } from '../../../src/main/handleFileProtocol';
import { addDefaultAppProtocolToFilePath } from '../../../src/main/fs/resolveFilePaths';

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
});
