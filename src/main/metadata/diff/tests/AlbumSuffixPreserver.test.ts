import { describe, expect, it } from 'vitest';

import { AlbumSuffixPreserver } from '../AlbumSuffixPreserver';

describe('AlbumSuffixPreserver Unit Test Suite', () => {
  it('preserves "(Deluxe)" when base album titles match', () => {
    const res = AlbumSuffixPreserver.preserveAlbumSuffix('SOUR (Deluxe)', 'SOUR');
    expect(res).toBe('SOUR (Deluxe)');
  });

  it('preserves "(Gracie\'s Version)" when base album titles match', () => {
    const res = AlbumSuffixPreserver.preserveAlbumSuffix(
      "The Secret (Gracie's Version)",
      'The Secret'
    );
    expect(res).toBe("The Secret (Gracie's Version)");
  });

  it('preserves "(Taylor\'s Version)" when base album titles match', () => {
    const res = AlbumSuffixPreserver.preserveAlbumSuffix("1989 (Taylor's Version)", '1989');
    expect(res).toBe("1989 (Taylor's Version)");
  });

  it('preserves "[Explicit]" when base album titles match', () => {
    const res = AlbumSuffixPreserver.preserveAlbumSuffix('After Hours [Explicit]', 'After Hours');
    expect(res).toBe('After Hours [Explicit]');
  });

  it('does NOT preserve suffix if base album titles differ completely', () => {
    const res = AlbumSuffixPreserver.preserveAlbumSuffix(
      'Greatest Hits (Deluxe)',
      'The Eminem Show'
    );
    expect(res).toBe('The Eminem Show');
  });

  it('returns remote album directly if no suffix is present in local title', () => {
    const res = AlbumSuffixPreserver.preserveAlbumSuffix('SOUR', 'SOUR');
    expect(res).toBe('SOUR');
  });
});
