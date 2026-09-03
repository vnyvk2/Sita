import { describe, expect, it } from 'vitest';
import { toThumbnailUrl } from './artwork';

describe('toThumbnailUrl', () => {
  it('rewrites nora://localfiles/ URLs to nora://thumb/', () => {
    const original = 'nora://localfiles/C:/Music/Cover.jpg';
    expect(toThumbnailUrl(original)).toBe('nora://thumb/C:/Music/Cover.jpg');
  });

  it('rewrites nora://file/ URLs to nora://thumb/', () => {
    const original = 'nora://file/C:/Music/Cover.jpg';
    expect(toThumbnailUrl(original)).toBe('nora://thumb/C:/Music/Cover.jpg');
  });

  it('leaves remote URLs untouched', () => {
    const remote = 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg';
    expect(toThumbnailUrl(remote)).toBe(remote);
  });

  it('handles undefined and empty string gracefully', () => {
    expect(toThumbnailUrl(undefined)).toBeUndefined();
    expect(toThumbnailUrl('')).toBeUndefined();
  });
});
