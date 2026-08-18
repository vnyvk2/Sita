import { describe, expect, it } from 'vitest';
import { MetadataQueryNormalizer } from '@main/metadata/search/MetadataQueryNormalizer';

describe('MetadataQueryNormalizer', () => {
  describe('compareStringSimilarity with Unicode', () => {
    it('compares identical CJK strings with 1.0 similarity', () => {
      const score = MetadataQueryNormalizer.compareStringSimilarity('夜に駆ける', '夜に駆ける');
      expect(score).toBe(1.0);
    });

    it('compares identical Cyrillic strings with 1.0 similarity', () => {
      const score = MetadataQueryNormalizer.compareStringSimilarity('Группа крови', 'Группа крови');
      expect(score).toBe(1.0);
    });

    it('correctly compares strings with minor punctuation variations', () => {
      const score = MetadataQueryNormalizer.compareStringSimilarity('Rock & Roll', 'Rock - Roll');
      expect(score).toBeGreaterThan(0.85);
    });

    it('returns 0 for completely empty or non-matching inputs', () => {
      expect(MetadataQueryNormalizer.compareStringSimilarity('', '夜に駆ける')).toBe(0);
      expect(MetadataQueryNormalizer.compareStringSimilarity('🎵🔥', '夜に駆ける')).toBe(0);
    });
  });
});
