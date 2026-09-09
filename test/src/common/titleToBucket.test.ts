import { describe, expect, it } from 'vitest';
import { titleToBucket } from '../../../src/common/titleToBucket';

describe('titleToBucket (Single Source of Truth)', () => {
  it('handles null, undefined, and empty string as #', () => {
    expect(titleToBucket(null)).toBe('#');
    expect(titleToBucket(undefined)).toBe('#');
    expect(titleToBucket('')).toBe('#');
  });

  it('trims leading whitespace before determining bucket', () => {
    expect(titleToBucket('   Hello')).toBe('H');
    expect(titleToBucket('\tWorld')).toBe('W');
    expect(titleToBucket('\n\rDance')).toBe('D');
    expect(titleToBucket('   ')).toBe('#');
  });

  it('maps ASCII letters to uppercase A-Z', () => {
    expect(titleToBucket('apple')).toBe('A');
    expect(titleToBucket('Banana')).toBe('B');
    expect(titleToBucket('zoo')).toBe('Z');
    expect(titleToBucket('Queen')).toBe('Q');
  });

  it('maps numbers and symbols to #', () => {
    expect(titleToBucket('10 Cool Songs')).toBe('#');
    expect(titleToBucket('007 Theme')).toBe('#');
    expect(titleToBucket('!Action')).toBe('#');
    expect(titleToBucket('$Dollar')).toBe('#');
    expect(titleToBucket('[Intro] Track')).toBe('#');
  });

  it('maps non-Latin and accented characters to #', () => {
    expect(titleToBucket('Élodie')).toBe('#');
    expect(titleToBucket('über cool')).toBe('#');
    expect(titleToBucket('🔥 Fire Track')).toBe('#');
    expect(titleToBucket('東京')).toBe('#');
    expect(titleToBucket('తెలుగు పాట')).toBe('#');
  });
});
