import { describe, expect, it } from 'vitest';

import { MetadataMatcher } from '../MetadataMatcher';

describe('MetadataMatcher — Empty Normalized String Invariant', () => {
  const matcher = new MetadataMatcher(0.4);

  it('does NOT match two distinct CJK-only titles that both normalize to empty strings', () => {
    const result = matcher.scoreCandidate(
      { title: '曲', artist: 'アーティスト' },
      { id: 'rec-1', title: '歌', artists: ['アーティスト'] }
    );

    // Both titles normalize to '' — the guard must award zero title points.
    expect(result.reasons).not.toContain('exact_title_match');
    expect(result.reasons).not.toContain('partial_title_match');
    expect(result.score).toBeLessThan(0.4);
  });

  it('does NOT match two symbol/punctuation-only titles that normalize to empty strings', () => {
    const result = matcher.scoreCandidate(
      { title: '!!!' },
      { id: 'rec-2', title: '???' }
    );

    expect(result.score).toBe(0);
  });

  it('still matches identical real titles regardless of script', () => {
    const result = matcher.scoreCandidate(
      { title: '夜に駆ける' },
      { id: 'rec-3', title: '夜に駆ける' }
    );

    expect(result.reasons).toContain('exact_title_match');
    expect(result.score).toBeGreaterThanOrEqual(0.4);
  });

  it('never awards the artist points when both artists normalize to empty strings', () => {
    const result = matcher.scoreCandidate(
      { title: 'Real Title', artist: '♪♪♪' },
      { id: 'rec-4', title: 'Real Title', artists: ['♫♫'] }
    );

    expect(result.reasons).toContain('exact_title_match');
    expect(result.reasons).not.toContain('artist_match');
  });
});
