import { MetadataNormalizer } from '@main/metadata/matching/MetadataNormalizer';
import { describe, expect, it } from 'vitest';

describe('MetadataNormalizer (Adversarial Normalization & Noise Stripping)', () => {
  describe('normalizeTitle', () => {
    it('should strip cosmetic video/audio tags without destroying core words', () => {
      expect(MetadataNormalizer.normalizeTitle('Bohemian Rhapsody (Official Video)')).toBe(
        'bohemian rhapsody'
      );
      expect(MetadataNormalizer.normalizeTitle('Starboy [Official Lyric Video]')).toBe('starboy');
      expect(MetadataNormalizer.normalizeTitle('Blinding Lights (Visualizer HD)')).toBe(
        'blinding lights'
      );
    });

    it('should strip remaster and deluxe edition qualifiers cleanly', () => {
      expect(MetadataNormalizer.normalizeTitle('Hotel California (2013 Remaster)')).toBe(
        'hotel california'
      );
      expect(MetadataNormalizer.normalizeTitle('Stayin Alive - Remastered Version')).toBe(
        'stayin alive'
      );
      expect(MetadataNormalizer.normalizeTitle('In the End (Deluxe Edition)')).toBe('in the end');
    });

    it('should normalize smart quotes, punctuation and parts', () => {
      expect(MetadataNormalizer.normalizeTitle("Don't Stop Believin'")).toBe('dont stop believin');
      expect(MetadataNormalizer.normalizeTitle('Shine On You Crazy Diamond (Pt. 1)')).toBe(
        'shine on you crazy diamond part 1'
      );
    });
  });

  describe('normalizeAlbum', () => {
    it('should normalize album titles cleanly without destroying distinct numbered volumes', () => {
      expect(MetadataNormalizer.normalizeAlbum('The Deluxe Edition')).toBe('the');
      expect(MetadataNormalizer.normalizeAlbum('Deluxe Edition Vol. 2')).toBe('vol 2');
      expect(MetadataNormalizer.normalizeAlbum('Thriller (25th Anniversary Deluxe Edition)')).toBe(
        'thriller 25th anniversary'
      );
    });
  });

  describe('extractVariants', () => {
    it('should accurately detect recording variants', () => {
      expect(MetadataNormalizer.extractVariants('Comfortably Numb (Live at Pompeii)')).toContain(
        'live'
      );
      expect(MetadataNormalizer.extractVariants('Layla - Acoustic')).toContain('acoustic');
      expect(MetadataNormalizer.extractVariants('Get Lucky [Daft Punk Remix]')).toContain('remix');
      expect(MetadataNormalizer.extractVariants('Smells Like Teen Spirit (Demo 1991)')).toContain(
        'demo'
      );
      expect(MetadataNormalizer.extractVariants('Yesterday (Instrumental Version)')).toContain(
        'instrumental'
      );
    });

    it('should not confuse normal titles with variants', () => {
      expect(MetadataNormalizer.extractVariants('Alive')).toEqual(new Set());
      expect(MetadataNormalizer.extractVariants('Live and Let Die')).toContain('live');
    });
  });
});
