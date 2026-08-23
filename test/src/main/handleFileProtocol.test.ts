import { Readable } from 'stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

class MockReadStream extends Readable {
  path: string;
  options: { start?: number; end?: number };

  constructor(path: string, options: { start?: number; end?: number }) {
    super();
    this.path = path;
    this.options = options;
  }

  _read() {}
}

let mockCreatedStream: MockReadStream | null = null;

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => !p.includes('nonexistent')),
  statSync: vi.fn(() => ({
    size: 10000,
    mtimeMs: 123456789,
    mtime: new Date('2026-01-01T00:00:00.000Z')
  })),
  createReadStream: vi.fn((path: string, options: { start?: number; end?: number }) => {
    mockCreatedStream = new MockReadStream(path, options);
    return mockCreatedStream;
  })
}));

vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(async (url: string) => new Response('mock-full-file-content', { status: 200 }))
  }
}));

vi.mock('../../../src/main/logger', () => ({
  default: {
    silly: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { handleFileProtocol } from '../../../src/main/handleFileProtocol';

describe('handleFileProtocol (Phase P4 Protocol & Streaming)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatedStream = null;
  });

  test('returns 404 when requested file does not exist on disk', async () => {
    const req = new Request('nora://localfiles/C:/music/nonexistent.mp3');
    const res = await handleFileProtocol(req as never);

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe('File not found');
  });

  test('serves full file as 200 OK ReadableStream when no Range header is present', async () => {
    const req = new Request('nora://localfiles/C:/music/song.mp3');
    const res = await handleFileProtocol(req as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('10000');
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('ETag')).toBe('"10000-123456789"');
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  test('returns 206 Partial Content with correct headers for Range request', async () => {
    const req = new Request('nora://localfiles/C:/music/song.flac', {
      headers: { range: 'bytes=0-1023' }
    });
    const res = await handleFileProtocol(req as never);

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1023/10000');
    expect(res.headers.get('Content-Length')).toBe('1024');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('audio/x-flac');
    expect(res.headers.get('ETag')).toBe('"10000-123456789"');
    expect(res.headers.get('Last-Modified')).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  test('returns 416 Range Not Satisfiable when range start exceeds file size', async () => {
    const req = new Request('nora://localfiles/C:/music/song.flac', {
      headers: { range: 'bytes=20000-30000' }
    });
    const res = await handleFileProtocol(req as never);

    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */10000');
  });

  test('applies backpressure on consumer: Node stream pushes chunks only when WebStream pulls', async () => {
    let readCallCount = 0;
    const sourceStream = new Readable({
      read(size) {
        readCallCount++;
        this.push(Buffer.alloc(Math.min(size, 512)));
      }
    });

    const webStream = Readable.toWeb(sourceStream);
    const reader = webStream.getReader();

    expect(readCallCount).toBe(0);

    // First pull
    const chunk1 = await reader.read();
    expect(chunk1.done).toBe(false);
    expect(chunk1.value).toBeDefined();
    const initialReads = readCallCount;
    expect(initialReads).toBeGreaterThan(0);

    // While consumer does not pull, no further reads occur beyond the stream's highWaterMark
    await new Promise((r) => setTimeout(r, 20));
    expect(readCallCount).toBe(initialReads);

    // Signal EOF and read final chunk
    sourceStream.push(null);
    const chunk2 = await reader.read();
    expect(chunk2.done).toBe(false);
  });

  test('destroys fileStream when WebStream is cancelled', async () => {
    const req = new Request('nora://localfiles/C:/music/song.flac', {
      headers: { range: 'bytes=0-9999' }
    });
    const res = await handleFileProtocol(req as never);

    expect(mockCreatedStream).not.toBeNull();
    const stream = mockCreatedStream!;

    // Cancel the ReadableStream
    await res.body?.cancel();
    expect(stream.destroyed).toBe(true);
  });
});
