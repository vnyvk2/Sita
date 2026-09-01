import { describe, it, expect } from 'vitest';

import { normalizeQuery } from '../../../../src/main/search/normalize/normalizeQuery';

describe('normalizeQuery', () => {
  it('should return original, normalized, and escaped fields', () => {
    const result = normalizeQuery('  A.R. Rahman  ');

    expect(result.original).toBe('A.R. Rahman');
    expect(result.normalized).toBe('ar rahman');
    expect(result.escaped).toBe('a.r. rahman');
  });

  it('should escape SQL wildcard characters in escaped field', () => {
    const result = normalizeQuery('100% _real_ \\deal');

    // Original keeps spaces as they are, but escaped collapses whitespace and lowercases
    // and escapes % _ \
    expect(result.escaped).toBe('100\\% \\_real\\_ \\\\deal');
  });

  it('should handle typical artist names with special characters', () => {
    const result = normalizeQuery('AC/DC');
    expect(result.escaped).toBe('ac/dc');
    expect(result.normalized).toBe('acdc');
  });
});
