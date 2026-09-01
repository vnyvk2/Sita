import {
  MetadataConflictError,
  MetadataError,
  MetadataNotFoundError,
  MetadataProviderError,
  MetadataValidationError
} from '@main/metadata/common/errors';
import { describe, expect, it } from 'vitest';

describe('MetadataErrors', () => {
  it('should construct MetadataError correctly', () => {
    const err = new MetadataError('Base metadata error');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MetadataError');
    expect(err.message).toBe('Base metadata error');
  });

  it('should construct MetadataNotFoundError with details', () => {
    const err = new MetadataNotFoundError('song', 123);
    expect(err).toBeInstanceOf(MetadataError);
    expect(err.name).toBe('MetadataNotFoundError');
    expect(err.message).toContain('song');
    expect(err.message).toContain('123');
  });

  it('should construct MetadataConflictError with field details', () => {
    const err = new MetadataConflictError('genre', 'Mismatched values');
    expect(err.name).toBe('MetadataConflictError');
    expect(err.message).toContain('genre');
  });

  it('should construct MetadataProviderError with provider id', () => {
    const err = new MetadataProviderError('musicbrainz', 'Timeout');
    expect(err.name).toBe('MetadataProviderError');
    expect(err.message).toContain('musicbrainz');
  });

  it('should construct MetadataValidationError with field failure details', () => {
    const err = new MetadataValidationError('year', 'Invalid year range');
    expect(err.name).toBe('MetadataValidationError');
    expect(err.message).toContain('year');
  });
});
