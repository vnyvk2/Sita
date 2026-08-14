import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NORA_BLUE,
  formatHsl,
  getHueDistance,
  normalizeSwatchHsl,
  parseHslString,
  resolveSemanticPalette
} from '../../../../../src/renderer/src/utils/semanticPalette';

describe('semanticPalette', () => {
  describe('formatHsl and parseHslString', () => {
    it('should format HslColor into space-separated string', () => {
      expect(formatHsl({ h: 220, s: 22, l: 11 })).toBe('220 22% 11%');
      expect(formatHsl({ h: 0, s: 0, l: 100 })).toBe('0 0% 100%');
    });

    it('should parse space-separated HSL strings', () => {
      const parsed = parseHslString('220 22% 11%');
      expect(parsed).toEqual({ h: 220, s: 22, l: 11 });
    });

    it('should gracefully handle malformed HSL strings', () => {
      expect(parseHslString('')).toEqual({ h: 0, s: 0, l: 0 });
      expect(parseHslString('invalid')).toEqual({ h: 0, s: 0, l: 0 });
    });
  });

  describe('getHueDistance (Circular Angular Difference)', () => {
    it('should calculate shortest angular difference across 0/360 boundary', () => {
      expect(getHueDistance(355, 5)).toBe(10);
      expect(getHueDistance(5, 355)).toBe(10);
      expect(getHueDistance(0, 350)).toBe(10);
      expect(getHueDistance(10, 190)).toBe(180);
      expect(getHueDistance(40, 100)).toBe(60);
      expect(getHueDistance(720, 360)).toBe(0);
    });
  });

  describe('normalizeSwatchHsl', () => {
    it('should normalize 0..1 scale HSL from node-vibrant', () => {
      const normalized = normalizeSwatchHsl([0.589, 0.789, 0.576]);
      expect(normalized).toBeDefined();
      expect(normalized?.h).toBe(212);
      expect(normalized?.s).toBe(79);
      expect(normalized?.l).toBe(58);
    });

    it('should handle already-scaled 0..360 / 0..100 HSL', () => {
      const normalized = normalizeSwatchHsl([212, 79, 58]);
      expect(normalized).toBeDefined();
      expect(normalized?.h).toBe(212);
      expect(normalized?.s).toBe(79);
      expect(normalized?.l).toBe(58);
    });

    it('should return undefined for invalid or missing HSL', () => {
      expect(normalizeSwatchHsl(undefined)).toBeUndefined();
      expect(normalizeSwatchHsl([] as unknown as [number, number, number])).toBeUndefined();
    });
  });

  describe('resolveSemanticPalette', () => {
    it('should resolve a complete 6-swatch palette accurately', () => {
      const mockPalette: NodeVibrantPalette = {
        Vibrant: { hex: '#e63946', hsl: [0.985, 0.78, 0.56], population: 100 },
        LightVibrant: { hex: '#f1faee', hsl: [0.49, 0.73, 0.96], population: 50 },
        DarkVibrant: { hex: '#1d3557', hsl: [0.597, 0.5, 0.23], population: 80 },
        Muted: { hex: '#457b9d', hsl: [0.563, 0.39, 0.44], population: 60 },
        LightMuted: { hex: '#a8dadc', hsl: [0.505, 0.43, 0.76], population: 40 },
        DarkMuted: { hex: '#2b2d42', hsl: [0.655, 0.21, 0.21], population: 70 }
      };

      const result = resolveSemanticPalette(mockPalette);

      // Primary accent derived from Vibrant
      expect(result.primaryAccent.h).toBe(355);
      expect(result.primaryAccent.s).toBeGreaterThanOrEqual(60);

      // Dark canvas has restrained luminance and saturation
      expect(result.dark.backgroundBase.l).toBe(11);
      expect(result.dark.backgroundBase.s).toBeGreaterThanOrEqual(14);
      expect(result.dark.backgroundBase.s).toBeLessThanOrEqual(26);

      // High contrast text guarantees
      expect(result.dark.textPrimary.l).toBe(98);
      expect(result.light.textPrimary.l).toBe(10);
    });

    describe('Missing Swatch Permutations', () => {
      const fullPalette: Required<NodeVibrantPalette> = {
        Vibrant: { hex: '#e63946', hsl: [0.985, 0.78, 0.56], population: 100 },
        LightVibrant: { hex: '#88c0d0', hsl: [0.536, 0.46, 0.67], population: 50 },
        DarkVibrant: { hex: '#1d3557', hsl: [0.597, 0.5, 0.23], population: 80 },
        Muted: { hex: '#d08770', hsl: [0.038, 0.54, 0.63], population: 60 },
        LightMuted: { hex: '#a8dadc', hsl: [0.505, 0.43, 0.76], population: 40 },
        DarkMuted: { hex: '#2e3440', hsl: [0.611, 0.16, 0.22], population: 70 }
      };

      it('permutation 1: missing only Vibrant -> falls back to LightVibrant', () => {
        const { Vibrant: _, ...rest } = fullPalette;
        const result = resolveSemanticPalette(rest);
        expect(result.primaryAccent.h).toBe(193); // LightVibrant
      });

      it('permutation 2: missing only LightVibrant -> uses Vibrant and derives secondary', () => {
        const { LightVibrant: _, ...rest } = fullPalette;
        const result = resolveSemanticPalette(rest);
        expect(result.primaryAccent.h).toBe(355); // Vibrant
        expect(result.secondaryAccent).toBeDefined();
      });

      it('permutation 3: missing only DarkVibrant -> uses Vibrant and LightVibrant secondary', () => {
        const { DarkVibrant: _, ...rest } = fullPalette;
        const result = resolveSemanticPalette(rest);
        expect(result.primaryAccent.h).toBe(355);
        expect(result.secondaryAccent.h).toBe(193);
      });

      it('permutation 4: missing only Muted -> uses Vibrant', () => {
        const { Muted: _, ...rest } = fullPalette;
        const result = resolveSemanticPalette(rest);
        expect(result.primaryAccent.h).toBe(355);
      });

      it('permutation 5: missing only LightMuted -> uses Vibrant', () => {
        const { LightMuted: _, ...rest } = fullPalette;
        const result = resolveSemanticPalette(rest);
        expect(result.primaryAccent.h).toBe(355);
      });

      it('permutation 6: missing only DarkMuted -> uses Vibrant', () => {
        const { DarkMuted: _, ...rest } = fullPalette;
        const result = resolveSemanticPalette(rest);
        expect(result.primaryAccent.h).toBe(355);
      });

      it('permutation 7: missing all Vibrant swatches -> falls back to Muted', () => {
        const result = resolveSemanticPalette({
          Muted: fullPalette.Muted,
          LightMuted: fullPalette.LightMuted,
          DarkMuted: fullPalette.DarkMuted
        });
        expect(result.primaryAccent.h).toBe(14); // Muted
      });

      it('permutation 8: only DarkMuted present -> falls back to DarkMuted', () => {
        const result = resolveSemanticPalette({
          DarkMuted: fullPalette.DarkMuted
        });
        expect(result.primaryAccent.h).toBe(220); // DarkMuted
      });

      it('permutation 9: empty palette -> falls back cleanly to default Nora Blue', () => {
        const result = resolveSemanticPalette({});
        expect(result.primaryAccent.h).toBe(DEFAULT_NORA_BLUE.h);
        expect(result.primaryAccent.s).toBe(DEFAULT_NORA_BLUE.s);
      });

      it('permutation 10: undefined palette -> falls back cleanly to default Nora Blue', () => {
        const result = resolveSemanticPalette(undefined);
        expect(result.primaryAccent.h).toBe(DEFAULT_NORA_BLUE.h);
      });
    });

    it('should synthesize Δ30° secondary accent when candidate hues are within 20° circular distance', () => {
      // Primary is 355° and candidate is 5° (angular distance is 10°, which is < 20°)
      const mockClosePalette: NodeVibrantPalette = {
        Vibrant: { hex: '#e63946', hsl: [0.985, 0.8, 0.55], population: 100 }, // 355°
        LightVibrant: { hex: '#ff4d4d', hsl: [0.014, 0.8, 0.65], population: 50 } // 5°
      };

      const result = resolveSemanticPalette(mockClosePalette);
      expect(result.primaryAccent.h).toBe(355);
      // Because 5° is too close to 355° (10° diff), it synthesizes (355 + 30) % 360 = 25°
      expect(result.secondaryAccent.h).toBe(25);
    });

    it('should handle monochromatic / pure black-and-white artwork without crashing', () => {
      const mockMonochromePalette: NodeVibrantPalette = {
        DarkMuted: { hex: '#111111', hsl: [0, 0, 0.07], population: 100 }
      };

      const result = resolveSemanticPalette(mockMonochromePalette);
      expect(result.dark.backgroundBase.s).toBe(0);
      expect(result.dark.backgroundBase.l).toBe(11);
      expect(result.dark.textPrimary.l).toBe(98);
      expect(result.light.backgroundBase.s).toBe(0);
      expect(result.light.backgroundBase.l).toBe(98);
    });

    it('should clamp dark surface saturation between 14% and 26% for hyper-saturated neon artwork', () => {
      const mockNeonPalette: NodeVibrantPalette = {
        Vibrant: { hex: '#ff0000', hsl: [0, 1.0, 0.5], population: 100 }
      };

      const result = resolveSemanticPalette(mockNeonPalette);
      expect(result.dark.backgroundBase.s).toBeLessThanOrEqual(26);
      expect(result.dark.backgroundBase.s).toBeGreaterThanOrEqual(14);
      expect(result.dark.backgroundBase.l).toBe(11);
    });
  });
});
