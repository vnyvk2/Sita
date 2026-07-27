import { describe, it, expect } from 'vitest';
import { normalizeForSearch } from '../../../../src/common/search/normalizeForSearch';

describe('normalizeForSearch', () => {
  it('should lowercase and trim', () => {
    expect(normalizeForSearch('  Hello World  ')).toBe('hello world');
  });

  it('should remove punctuation and symbols', () => {
    expect(normalizeForSearch('AC/DC')).toBe('acdc');
    expect(normalizeForSearch('AC DC')).toBe('ac dc');
    expect(normalizeForSearch('Ac-Dc')).toBe('acdc');
    expect(normalizeForSearch('A.R. Rahman')).toBe('ar rahman');
    expect(normalizeForSearch('AR Rahman')).toBe('ar rahman');
    expect(normalizeForSearch('a r rahman')).toBe('a r rahman');
    expect(normalizeForSearch('a.r. rahman')).toBe('ar rahman');
    expect(normalizeForSearch('50%')).toBe('50');
    expect(normalizeForSearch('Ke$ha')).toBe('keha'); // Because $ is punctuation
    expect(normalizeForSearch('C++')).toBe('c');
  });

  it('should remove diacritics', () => {
    expect(normalizeForSearch('Björk')).toBe('bjork');
    expect(normalizeForSearch('Beyoncé')).toBe('beyonce');
    expect(normalizeForSearch('Pokémon')).toBe('pokemon');
    expect(normalizeForSearch('Ålphå')).toBe('alpha');
  });

  it('should collapse whitespace', () => {
    expect(normalizeForSearch('a   b\tc\n\rd')).toBe('a b c d');
  });

  it('should be idempotent', () => {
    const input = '  A.R. Rahman (ft. Beyoncé & Björk) - 50%  ';
    const firstPass = normalizeForSearch(input);
    const secondPass = normalizeForSearch(firstPass);
    expect(firstPass).toBe(secondPass);
  });
});
