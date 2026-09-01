import { MetadataNormalizer } from '@main/metadata/matching/MetadataNormalizer';
import { describe, expect, it } from 'vitest';

describe('MetadataNormalizer', () => {
  describe('normalizeTitle', () => {
    it('preserves CJK characters in titles', () => {
      expect(MetadataNormalizer.normalizeTitle('夜に駆ける')).toBe('夜に駆ける');
      expect(MetadataNormalizer.normalizeTitle('前前前世')).toBe('前前前世');
      expect(MetadataNormalizer.normalizeTitle('Lemon - 米津玄師')).toBe('lemon 米津玄師');
    });

    it('preserves Cyrillic characters in titles', () => {
      expect(MetadataNormalizer.normalizeTitle('Группа крови')).toBe('группа крови');
      expect(MetadataNormalizer.normalizeTitle('Звезда по имени Солнце')).toBe(
        'звезда по имени солнце'
      );
    });

    it('preserves Arabic characters in titles', () => {
      expect(MetadataNormalizer.normalizeTitle('أغنية جميلة')).toBe('أغنية جميلة');
    });

    it('strips Latin diacritics while preserving base letters', () => {
      expect(MetadataNormalizer.normalizeTitle('Café del Mar')).toBe('cafe del mar');
      expect(MetadataNormalizer.normalizeTitle('Déjà Vu')).toBe('deja vu');
    });

    it('strips cosmetic noise and variants while preserving Unicode content', () => {
      expect(MetadataNormalizer.normalizeTitle('YOASOBI - 夜に駆ける (Official Music Video)')).toBe(
        'yoasobi 夜に駆ける'
      );
      expect(MetadataNormalizer.normalizeTitle('Кино - Группа крови [Live]')).toBe(
        'кино группа крови'
      );
    });

    it('produces identical normalized output for composed and decomposed Unicode representations', () => {
      const composed = 'Café';
      const decomposed = 'Cafe\u0301';
      expect(MetadataNormalizer.normalizeTitle(composed)).toBe(
        MetadataNormalizer.normalizeTitle(decomposed)
      );
      expect(MetadataNormalizer.normalizeTitle(composed)).toBe('cafe');

      const cjkComposed = '夜に駆ける'.normalize('NFC');
      const cjkDecomposed = '夜に駆ける'.normalize('NFD');
      expect(MetadataNormalizer.normalizeTitle(cjkComposed)).toBe(
        MetadataNormalizer.normalizeTitle(cjkDecomposed)
      );
    });

    it('returns empty string for inputs without letters or digits (e.g. pure emojis or symbols)', () => {
      expect(MetadataNormalizer.normalizeTitle('🎵🔥✨')).toBe('');
      expect(MetadataNormalizer.normalizeTitle('---...---')).toBe('');
      expect(MetadataNormalizer.normalizeTitle('')).toBe('');
    });
  });

  describe('normalizeArtist', () => {
    it('preserves international artist names', () => {
      expect(MetadataNormalizer.normalizeArtist('YOASOBI')).toBe('yoasobi');
      expect(MetadataNormalizer.normalizeArtist('米津玄師')).toBe('米津玄師');
      expect(MetadataNormalizer.normalizeArtist('Кино')).toBe('кино');
      expect(MetadataNormalizer.normalizeArtist('فيروز')).toBe('فيروز');
    });

    it('normalizes collaborations while preserving international names', () => {
      expect(MetadataNormalizer.normalizeArtist('YOASOBI feat. 初音ミク')).toBe('yoasobi 初音ミク');
      expect(MetadataNormalizer.normalizeArtist('A.R. Rahman with Sid Sriram')).toBe(
        'ar rahman sid sriram'
      );
    });
  });

  describe('normalizeAlbum', () => {
    it('preserves international album names and strips cosmetic noise', () => {
      expect(MetadataNormalizer.normalizeAlbum('THE BOOK (Official Audio)')).toBe('the book');
      expect(MetadataNormalizer.normalizeAlbum('Звезда по имени Солнце (Music Video)')).toBe(
        'звезда по имени солнце'
      );
    });
  });
});
