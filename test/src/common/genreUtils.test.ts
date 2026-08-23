import { describe, expect, it } from 'vitest';
import { GENRE_SEPARATOR_REGEX, parseGenreList } from '../../../src/common/genreUtils';

describe('genreUtils - parseGenreList', () => {
  it('splits comma-separated genres with and without spaces', () => {
    expect(parseGenreList('Rock,pop')).toEqual(['Rock', 'pop']);
    expect(parseGenreList('Rock, Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock, Pop, Jazz')).toEqual(['Rock', 'Pop', 'Jazz']);
  });

  it('splits semicolon-separated genres', () => {
    expect(parseGenreList('Rock;Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock; Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock; Pop; Indie')).toEqual(['Rock', 'Pop', 'Indie']);
  });

  it('splits whitespace-surrounded slashes and backslashes', () => {
    expect(parseGenreList('Rock / Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock \\ Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock | Pop')).toEqual(['Rock', 'Pop']);
  });

  it('splits consecutive slashes (//)', () => {
    expect(parseGenreList('Rock//Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock // Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList('Rock///Pop')).toEqual(['Rock', 'Pop']);
  });

  it('preserves standalone slashes without spaces for compound genres', () => {
    expect(parseGenreList('Hip-Hop/Rap')).toEqual(['Hip-Hop/Rap']);
    expect(parseGenreList('R&B/Soul')).toEqual(['R&B/Soul']);
    expect(parseGenreList('AC/DC')).toEqual(['AC/DC']);
    expect(parseGenreList('Hip-Hop/Rap, Pop')).toEqual(['Hip-Hop/Rap', 'Pop']);
  });

  it('preserves ampersands in genre names', () => {
    expect(parseGenreList('Rock & Roll')).toEqual(['Rock & Roll']);
    expect(parseGenreList('R&B')).toEqual(['R&B']);
    expect(parseGenreList('R&B, Soul')).toEqual(['R&B', 'Soul']);
    expect(parseGenreList('Noise & Industrial / Ambient')).toEqual(['Noise & Industrial', 'Ambient']);
  });

  it('deduplicates case-insensitively while preserving first spelling/casing', () => {
    expect(parseGenreList('Rock, rock, ROCK; Pop')).toEqual(['Rock', 'Pop']);
    expect(parseGenreList(['rock', 'Rock', 'ROCK'])).toEqual(['rock']);
    expect(parseGenreList(['Alternative Rock', 'alternative rock'])).toEqual(['Alternative Rock']);
  });

  it('handles array inputs with mixed strings and delimiters', () => {
    expect(parseGenreList(['Rock,pop', 'Jazz; Blues', 'Hip-Hop/Rap'])).toEqual([
      'Rock',
      'pop',
      'Jazz',
      'Blues',
      'Hip-Hop/Rap'
    ]);
  });

  it('handles newlines and null bytes', () => {
    expect(parseGenreList('Rock\nPop\rJazz\0Blues')).toEqual(['Rock', 'Pop', 'Jazz', 'Blues']);
  });

  it('returns empty array for empty, null, or undefined inputs', () => {
    expect(parseGenreList(undefined)).toEqual([]);
    expect(parseGenreList(null)).toEqual([]);
    expect(parseGenreList('')).toEqual([]);
    expect(parseGenreList('   ')).toEqual([]);
    expect(parseGenreList([])).toEqual([]);
    expect(parseGenreList(['', '   '])).toEqual([]);
  });
});
