import { describe, expect, it } from 'vitest';

import { unwrapSpotifyTrack } from '../../../../src/main/spotify/api/types';

describe('unwrapSpotifyTrack (DTO Normalization & Strict Validation)', () => {
  const sampleTrack = {
    id: 'track_123',
    name: 'Bohemian Rhapsody',
    uri: 'spotify:track:track_123',
    artists: [{ name: 'Queen', uri: 'spotify:artist:queen' }],
    duration_ms: 354000
  };

  it('should unwrap direct track object with valid name and identifiers', () => {
    const result = unwrapSpotifyTrack(sampleTrack);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Bohemian Rhapsody');
    expect(result?.id).toBe('track_123');
  });

  it('should unwrap item with top-level track wrapper: { track: ... }', () => {
    const payload = {
      added_at: '2026-01-01T00:00:00Z',
      is_local: false,
      track: sampleTrack
    };
    const result = unwrapSpotifyTrack(payload);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Bohemian Rhapsody');
  });

  it('should unwrap 2026 endpoint shape: { item: { ... } }', () => {
    const payload = {
      added_at: '2026-01-01T00:00:00Z',
      item: sampleTrack
    };
    const result = unwrapSpotifyTrack(payload);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Bohemian Rhapsody');
  });

  it('should unwrap nested payload shape: { item: { track: { ... } } }', () => {
    const payload = {
      added_at: '2026-01-01T00:00:00Z',
      item: {
        track: sampleTrack
      }
    };
    const result = unwrapSpotifyTrack(payload);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Bohemian Rhapsody');
  });

  it('should return null for null, undefined, or primitive inputs', () => {
    expect(unwrapSpotifyTrack(null)).toBeNull();
    expect(unwrapSpotifyTrack(undefined)).toBeNull();
    expect(unwrapSpotifyTrack('')).toBeNull();
    expect(unwrapSpotifyTrack(123)).toBeNull();
    expect(unwrapSpotifyTrack(true)).toBeNull();
  });

  it('should return null for malformed objects lacking valid track name', () => {
    expect(unwrapSpotifyTrack({})).toBeNull();
    expect(unwrapSpotifyTrack({ name: '' })).toBeNull();
    expect(unwrapSpotifyTrack({ name: '   ' })).toBeNull();
    expect(unwrapSpotifyTrack({ track: {} })).toBeNull();
    expect(unwrapSpotifyTrack({ item: {} })).toBeNull();
    expect(unwrapSpotifyTrack({ item: { track: { name: '' } } })).toBeNull();
  });

  it('should reject bare objects that have a name but no track identifiers or media properties', () => {
    expect(unwrapSpotifyTrack({ name: 'Hello' })).toBeNull();
    expect(unwrapSpotifyTrack({ track: { name: 'Hello' } })).toBeNull();
    expect(unwrapSpotifyTrack({ item: { name: 'Hello' } })).toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', external_ids: {} })).toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', external_ids: { isrc: '' } })).toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', external_ids: { isrc: '   ' } })).toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', artists: [] })).toBeNull();
  });

  it('should accept objects with name and at least one identifier or track attribute', () => {
    expect(unwrapSpotifyTrack({ name: 'Hello', id: '123' })).not.toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', uri: 'spotify:track:123' })).not.toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', artists: [{ name: 'Adele' }] })).not.toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', duration_ms: 200000 })).not.toBeNull();
    expect(unwrapSpotifyTrack({ name: 'Hello', external_ids: { isrc: 'US123' } })).not.toBeNull();
  });
});
