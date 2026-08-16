import { describe, expect, it } from 'vitest';

import logger, { normalizeErrorPayload, serializeError } from '../logger';

describe('Logger error normalization and serialization', () => {
  it('should extract error properties including code, errno, syscall, and path', () => {
    const error = Object.assign(new Error('Directory exists'), {
      name: 'SystemError',
      code: 'EEXIST',
      errno: -4075,
      syscall: 'mkdir',
      path: 'C:\\Users\\Mock\\AppData\\Roaming\\nora\\song_covers'
    });

    const serialized = serializeError(error);

    expect(serialized.name).toBe('SystemError');
    expect(serialized.message).toBe('Directory exists');
    expect(serialized.code).toBe('EEXIST');
    expect(serialized.errno).toBe(-4075);
    expect(serialized.syscall).toBe('mkdir');
    expect(serialized.path).toBe('C:\\Users\\Mock\\AppData\\Roaming\\nora\\song_covers');
    expect(serialized.stack).toBeDefined();
  });

  it('Style 1: should normalize logger.error(message, { error })', () => {
    const error = new Error('Database locked');
    const { data, errorMessage } = normalizeErrorPayload({ error, songPath: '/music/song.mp3' });

    expect(errorMessage).toBe('Database locked');
    expect(data.songPath).toBe('/music/song.mp3');
    expect((data.error as any).message).toBe('Database locked');
  });

  it('Style 2: should normalize logger.error(message, meta, error)', () => {
    const error = new Error('Disk full');
    const { data, errorMessage } = normalizeErrorPayload({ operation: 'export' }, error);

    expect(errorMessage).toBe('Disk full');
    expect(data.operation).toBe('export');
    expect((data.error as any).message).toBe('Disk full');
  });

  it('Style 3: should normalize logger.error(message, error)', () => {
    const error = new Error('Network timeout');
    const { data, errorMessage } = normalizeErrorPayload(error);

    expect(errorMessage).toBe('Network timeout');
    expect((data.error as any).message).toBe('Network timeout');
  });
});
