import { normalizeForMatching } from '@main/metadata/matching/normalizeForMatching';
import { describe, expect, it } from 'vitest';

describe('normalizeForMatching (Canonical Normalization Contract)', () => {
  it('preserves CJK script characters intact', () => {
    expect(normalizeForMatching('夜に駆ける')).toBe('夜に駆ける');
    expect(normalizeForMatching('前前前世')).toBe('前前前世');
    expect(normalizeForMatching('米津玄師')).toBe('米津玄師');
    expect(normalizeForMatching('初音ミク')).toBe('初音ミク');
  });

  it('preserves Cyrillic script characters and converts to lowercase', () => {
    expect(normalizeForMatching('Кино')).toBe('кино');
    expect(normalizeForMatching('Группа крови')).toBe('группа крови');
    expect(normalizeForMatching('Звезда по имени Солнце')).toBe('звезда по имени солнце');
  });

  it('preserves Arabic script characters intact', () => {
    expect(normalizeForMatching('أغنية جميلة')).toBe('أغنية جميلة');
    expect(normalizeForMatching('فيروز')).toBe('فيروز');
  });

  it('strips Latin combining diacritics while preserving base letters', () => {
    expect(normalizeForMatching('Café')).toBe('cafe');
    expect(normalizeForMatching('Déjà Vu')).toBe('deja vu');
    expect(normalizeForMatching('Björk')).toBe('bjork');
  });

  it('converts punctuation and symbols to single space preserving token boundaries', () => {
    expect(normalizeForMatching('AC/DC')).toBe('ac dc');
    expect(normalizeForMatching('Rock & Roll')).toBe('rock roll');
    expect(normalizeForMatching('A.R. Rahman')).toBe('a r rahman');
    expect(normalizeForMatching('Simon & Garfunkel')).toBe('simon garfunkel');
  });

  it('produces identical output for composed (NFC) and decomposed (NFD) Unicode representations', () => {
    const composed = 'Café';
    const decomposed = 'Cafe\u0301';
    expect(normalizeForMatching(composed)).toBe(normalizeForMatching(decomposed));
    expect(normalizeForMatching(composed)).toBe('cafe');

    const cjkComposed = '夜に駆ける'.normalize('NFC');
    const cjkDecomposed = '夜に駆ける'.normalize('NFD');
    expect(normalizeForMatching(cjkComposed)).toBe(normalizeForMatching(cjkDecomposed));
  });

  it('returns empty string for inputs without letters or numbers', () => {
    expect(normalizeForMatching('🎵🔥✨')).toBe('');
    expect(normalizeForMatching('---...---')).toBe('');
    expect(normalizeForMatching('   ')).toBe('');
    expect(normalizeForMatching('')).toBe('');
    expect(normalizeForMatching(undefined)).toBe('');
  });
});
