import { describe, expect, it } from 'vitest';

import { compareTitles, normalizeTitle } from '../../../../../src/main/core/duplicates/normalizeTitle';

describe('normalizeTitle', () => {
  describe('generic title guard', () => {
    it.each([
      'Track 01',
      'track 3',
      'Track01',
      'Song 2', // deliberate trade-off: Blur's "Song 2" is sacrificed (safe direction)
      'Audio 1',
      'Video 2',
      'Untitled',
      'unknown',
      'No Title',
      'Unknown Title',
      'Title 4',
      '',
      ' '
    ])('excludes placeholder title "%s" from deduplication', (title) => {
      expect(normalizeTitle(title).isGeneric).toBe(true);
    });

    it('keeps meaningful titles eligible', () => {
      expect(normalizeTitle('Track 03 - Real Song').isGeneric).toBe(false);
      expect(normalizeTitle('1984').isGeneric).toBe(false);
      expect(normalizeTitle('21 Guns').isGeneric).toBe(false);
    });

    it('a title made purely of noise is generic', () => {
      expect(normalizeTitle('Official Video').isGeneric).toBe(true);
    });
  });

  describe('prefix stripping', () => {
    it.each([
      ['1-songName', 'songname'],
      ['0-songName', 'songname'],
      ['1 - songName', 'songname'],
      ['01 - SongName', 'songname'],
      ['1. SongName', 'songname'],
      ['01_SongName', 'songname'],
      ['Track 03 - SongName', 'songname'],
      ['01 SongName', 'songname'], // Tier B: zero-padded
      ['Track 03 SongName', 'songname'], // Tier B with keyword
      ['007 Goldeneye', 'goldeneye'] // Tier B
    ])('strips track-index noise: "%s" → base "%s"', (title, expectedBase) => {
      expect(normalizeTitle(title).base).toBe(expectedBase);
    });

    it.each([
      ['21 Guns', '21guns'],
      ['7 Years', '7years'],
      ['1984', '1984'],
      ['1-800-273-8255', '18002738255'],
      ['9 Crimes', '9crimes'],
      ['0 to 100', '0to100'],
      ['24K Magic', '24kmagic'],
      ['99 Luftballons', '99luftballons'],
      ['3.14', '314']
    ])('preserves legitimate number titles: "%s" → base "%s"', (title, expectedBase) => {
      expect(normalizeTitle(title).base).toBe(expectedBase);
    });

    it('Tier C: bare numbers strip only for filename titles matching the track tag', () => {
      expect(normalizeTitle('7 Years', { titleSource: 'filename', trackNo: 7 }).base).toBe('years');
      expect(normalizeTitle('7 Years', { titleSource: 'filename', trackNo: 3 }).base).toBe('7years');
      expect(normalizeTitle('7 Years', { titleSource: 'tag', trackNo: 7 }).base).toBe('7years');
      expect(normalizeTitle('7 Years').base).toBe('7years');
    });
  });

  describe('part / sequel guard', () => {
    it.each([
      ['okok part 1', { type: 'part', index: '1' }],
      ['okok pt. 2', { type: 'part', index: '2' }],
      ['Suite (Part 1)', { type: 'part', index: '1' }],
      ['Anthology Vol. 1', { type: 'volume', index: '1' }],
      ['Anthology Volume 2', { type: 'volume', index: '2' }],
      ['Musique Vol. I', { type: 'volume', index: '1' }], // roman canonicalization
      ['Intro Act II', { type: 'act', index: '2' }],
      ['Theme Side A', { type: 'side', index: '1' }],
      ['Hits CD 1', { type: 'disc', index: '1' }],
      ['Story part 1/2', { type: 'part', index: '1' }] // "N of M" fraction
    ])('extracts the part token from "%s"', (title, expectedPart) => {
      expect(normalizeTitle(title).part).toEqual(expectedPart);
    });

    it.each([
      'CD Mix', // "mix" is shape-valid roman (M+IX = 1009) but out of range
      'Dim Lights',
      'Partner 2', // no word boundary inside "Partner"
      'Apart 2',
      'Song Part One' // spelled-out numbers never match — safe fallback
    ])('does not hallucinate a part token from "%s"', (title) => {
      expect(normalizeTitle(title).part).toBeNull();
    });

    it('removes the part token from the base', () => {
      expect(normalizeTitle('okok part 1').base).toBe('okok');
    });
  });

  describe('variant extraction', () => {
    it('extracts bracketed variants and drops the bracket', () => {
      const n = normalizeTitle('Coke Song (Acoustic Version)');
      expect(n.base).toBe('cokesong');
      expect(n.variants).toEqual(['acoustic']);
    });

    it('is bracket-type agnostic', () => {
      expect(normalizeTitle('Coke Song [Remix]').variants).toEqual(['remix']);
      expect(normalizeTitle('Coke Song {Live}').variants).toEqual(['live']);
    });

    it('bracket-first: title words are never mistaken for variants', () => {
      const n = normalizeTitle('Live and Let Die');
      expect(n.variants).toEqual([]);
      expect(n.base).toBe('liveandletdie');
    });

    it('extracts trailing variants without brackets ("Dhoom Machale Remix")', () => {
      const n = normalizeTitle('Dhoom Machale Remix');
      expect(n.base).toBe('dhoommachale');
      expect(n.variants).toEqual(['remix']);
    });

    it('extracts a pure-variant tail after a dash ("Nuvvu Nenu - Acoustic")', () => {
      const n = normalizeTitle('Nuvvu Nenu - Acoustic');
      expect(n.base).toBe('nuvvunenu');
      expect(n.variants).toEqual(['acoustic']);
    });

    it('keeps mixed bracket content verbatim ("Live at Wembley")', () => {
      const n = normalizeTitle('Song (Live at Wembley)');
      expect(n.variants).toEqual([]);
      expect(n.base).toBe('songliveatwembley');
    });
  });

  describe('featuring extraction', () => {
    it('drops feat segments from the base', () => {
      const n = normalizeTitle('Starboy (feat. Daft Punk)');
      expect(n.base).toBe('starboy');
      expect(n.featuring).toEqual(['Daft Punk']);
    });

    it('recognizes ft/featuring spellings', () => {
      expect(normalizeTitle('Song (ft. Artist)').featuring).toEqual(['Artist']);
      expect(normalizeTitle('Song (featuring Artist Two)').featuring).toEqual(['Artist Two']);
    });
  });

  describe('web / rip noise', () => {
    it.each([
      ['Song Name [Official Video]', 'songname'],
      ['Song Name (Official Music Video)', 'songname'],
      ['Song Name (Lyrics)', 'songname'],
      ['Beat [320kbps]', 'beat'],
      ['Beat (320 kbps)', 'beat'],
      ['song.mp3', 'song'],
      ['song.flac', 'song'],
      ['yt1s.com - Song Name', 'songname'],
      ['Song Name Lyrics', 'songname'],
      ['Daaku Video Song', 'daaku'],
      ['Song Name HD', 'songname']
    ])('strips rip noise: "%s" → base "%s"', (title, expectedBase) => {
      expect(normalizeTitle(title).base).toBe(expectedBase);
    });
  });

  describe('unicode safety', () => {
    it('preserves Telugu combining vowel marks (distinct words must not collapse)', () => {
      expect(normalizeTitle('దాక్కో దాక్కో').base).toBe('దాక్కోదాక్కో');
    });

    it('folds Latin diacritics', () => {
      expect(normalizeTitle('Bélo').base).toBe('belo');
      expect(normalizeTitle('BÉLO').base).toBe('belo');
    });
  });
});

describe('compareTitles — classification', () => {
  it.each([
    // the user's original cases
    ['1-songName', '0-songName', 'CANDIDATE'],
    ['1-songName', 'songName', 'CANDIDATE'],

    // THE rule: sequels are never duplicates
    ['okok part 1', 'okok part 2', 'DISTINCT'],
    ['Suite Part I', 'Suite Part II', 'DISTINCT'],
    ['Theme Side A', 'Theme Side B', 'DISTINCT'],
    ['Hits CD 1', 'Hits CD 2', 'DISTINCT'],

    // one-sided part → the human decides
    ['okok part 1', 'okok', 'MANUAL_REVIEW'],

    // canonicalized parts match
    ['Anthology Vol. 1', 'Anthology Vol. I', 'CANDIDATE'],

    // variant sets
    ['Coke Song (Remix)', 'Coke Song', 'ALTERNATIVE_VERSION'],
    ['Coke Song (Remix)', 'Coke Song (Remix)', 'CANDIDATE'],
    ['Coke Song (Remix)', 'Coke Song [Remix]', 'CANDIDATE'],
    ['Coke Song (Acoustic)', 'Coke Song (Live)', 'ALTERNATIVE_VERSION'],
    ['Coke Song (Male Version)', 'Coke Song (Female Version)', 'ALTERNATIVE_VERSION'],
    ['Live and Let Die', 'Live and Let Die (Live)', 'ALTERNATIVE_VERSION'],

    // feat segments do not block title-level candidacy (artist gate is Phase 2)
    ['Starboy (feat. Daft Punk)', 'Starboy', 'CANDIDATE'],

    // noise must not create or destroy candidates
    ['Song Name', 'Song Name (Official Video)', 'CANDIDATE'],
    ['Song Name', 'Song Name Lyrics', 'CANDIDATE'],

    // generic titles never deduplicate
    ['Track 01', 'Track 01', 'DISTINCT'],

    // plain different songs
    ['Hello', 'Rolling in the Deep', 'DISTINCT']
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(compareTitles(a, b)).toBe(expected);
  });

  it('Tier C is conservative: tag-derived titles never match stripped filename titles', () => {
    const relation = compareTitles('7 Years', '7 Years', { titleSource: 'tag' }, { titleSource: 'filename', trackNo: 7 });
    expect(relation).toBe('DISTINCT'); // false-negative direction — safe by design
  });
});
