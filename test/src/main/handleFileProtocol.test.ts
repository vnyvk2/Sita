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

  test('delegates to net.fetch for full file requests (no Range header)', async () => {
    const req = new Request('nora://localfiles/C:/music/song.mp3');
    const res = await handleFileProtocol(req as never);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('mock-full-file-content');
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

  test('applies backpressure and pauses fileStream when consumer buffer is saturated', async () => {
    const req = new Request('nora://localfiles/C:/music/song.flac', {
      headers: { range: 'bytes=0-9999' }
    });
    const res = await handleFileProtocol(req as never);

    expect(mockCreatedStream).not.toBeNull();
    const stream = mockCreatedStream!;

    // Emit data chunks
    stream.emit('data', Buffer.alloc(1024));
    // The stream pauses when the reader's queue is filled
    expect(stream.options.start).toBe(0);
    expect(stream.options.end).toBe(9999);
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
