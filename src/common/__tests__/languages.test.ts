import { describe, expect, it } from 'vitest';

import { KNOWN_LANGUAGES, normalizeLanguageName } from '../languages';

describe('common/languages — normalizeLanguageName', () => {
  it('preserves known languages and standardizes case and whitespace', () => {
    expect(normalizeLanguageName('Telugu')).toBe('Telugu');
    expect(normalizeLanguageName('  telugu  ')).toBe('Telugu');
    expect(normalizeLanguageName('HINDI')).toBe('Hindi');
    expect(normalizeLanguageName('japanese')).toBe('Japanese');
    expect(normalizeLanguageName('SPANISH')).toBe('Spanish');
  });

  it('maps ISO 639-1 and 639-2 codes to canonical English language names', () => {
    expect(normalizeLanguageName('te')).toBe('Telugu');
    expect(normalizeLanguageName('tel')).toBe('Telugu');
    expect(normalizeLanguageName('en')).toBe('English');
    expect(normalizeLanguageName('eng')).toBe('English');
    expect(normalizeLanguageName('hi')).toBe('Hindi');
    expect(normalizeLanguageName('hin')).toBe('Hindi');
    expect(normalizeLanguageName('ta')).toBe('Tamil');
    expect(normalizeLanguageName('tam')).toBe('Tamil');
    expect(normalizeLanguageName('ja')).toBe('Japanese');
    expect(normalizeLanguageName('jpn')).toBe('Japanese');
    expect(normalizeLanguageName('ko')).toBe('Korean');
    expect(normalizeLanguageName('kor')).toBe('Korean');
  });

  it('preserves and title-cases custom user languages not in KNOWN_LANGUAGES', () => {
    expect(normalizeLanguageName('klingon')).toBe('Klingon');
    expect(normalizeLanguageName('  latin  ')).toBe('Latin');
    expect(normalizeLanguageName('ancient greek')).toBe('Ancient Greek');
  });

  it('returns empty string for empty or whitespace-only inputs', () => {
    expect(normalizeLanguageName('')).toBe('');
    expect(normalizeLanguageName('   ')).toBe('');
  });

  it('has known languages list containing major Indian and international languages', () => {
    expect(KNOWN_LANGUAGES).toContain('Telugu');
    expect(KNOWN_LANGUAGES).toContain('Tamil');
    expect(KNOWN_LANGUAGES).toContain('Hindi');
    expect(KNOWN_LANGUAGES).toContain('English');
    expect(KNOWN_LANGUAGES).toContain('Japanese');
    expect(KNOWN_LANGUAGES).toContain('Korean');
    expect(KNOWN_LANGUAGES.length).toBeGreaterThanOrEqual(19);
  });
});
