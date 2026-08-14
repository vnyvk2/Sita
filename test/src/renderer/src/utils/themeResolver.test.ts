import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { themeRegistry, type ThemePreset } from '../../../../../src/common/themeRegistry';
import {
  formatHsl,
  resolveSemanticPalette
} from '../../../../../src/renderer/src/utils/semanticPalette';
import {
  ACCENT_TOKEN_KEYS,
  interpolateHsl,
  PRESET_RAW_TOKENS,
  resolveTheme,
  THEME_TOKEN_KEYS,
  type ThemeTokenKey
} from '../../../../../src/renderer/src/utils/themeResolver';

describe('themeResolver', () => {
  const mockPalette = resolveSemanticPalette({
    Vibrant: { hex: '#e63946', hsl: [0.985, 0.78, 0.56], population: 100 },
    LightVibrant: { hex: '#f1faee', hsl: [0.49, 0.73, 0.96], population: 50 },
    DarkVibrant: { hex: '#1d3557', hsl: [0.597, 0.5, 0.23], population: 80 }
  });

  describe('interpolateHsl', () => {
    it('should return from color at intensity 0', () => {
      const from = { h: 220, s: 20, l: 15 };
      const to = { h: 350, s: 80, l: 55 };
      expect(interpolateHsl(from, to, 0)).toEqual(from);
    });

    it('should return to color at intensity 100', () => {
      const from = { h: 220, s: 20, l: 15 };
      const to = { h: 350, s: 80, l: 55 };
      expect(interpolateHsl(from, to, 100)).toEqual(to);
    });

    it('should blend colors proportionally at intensity 50', () => {
      const from = { h: 0, s: 0, l: 0 };
      const to = { h: 100, s: 100, l: 100 };
      const blended = interpolateHsl(from, to, 50);
      expect(blended.s).toBe(50);
      expect(blended.l).toBe(50);
    });

    it('should clamp out-of-range intensity below 0 and above 100', () => {
      const from = { h: 100, s: 20, l: 20 };
      const to = { h: 200, s: 80, l: 80 };
      expect(interpolateHsl(from, to, -50)).toEqual(from);
      expect(interpolateHsl(from, to, 150)).toEqual(to);
    });
  });

  describe('resolveTheme', () => {
    it('should return pure preset tokens for all 14 presets when intensity is 0 or palette is undefined', () => {
      const allPresets = Object.keys(themeRegistry) as ThemePreset[];
      expect(allPresets.length).toBe(14);

      for (const preset of allPresets) {
        const theme = resolveTheme({
          preset,
          palette: mockPalette,
          intensity: 0
        });

        for (const token of THEME_TOKEN_KEYS) {
          expect(theme[token]).toBeDefined();
          expect(theme[token]).toBe(PRESET_RAW_TOKENS[preset][token]);
        }
      }
    });

    it('should return preset tokens when palette is undefined or missing', () => {
      const theme = resolveTheme({
        preset: 'nord',
        palette: undefined,
        mode: 'dynamic-accent'
      });

      expect(theme['--dark-background-color-1']).toBe(
        PRESET_RAW_TOKENS.nord['--dark-background-color-1']
      );
      expect(theme['--text-color-highlight']).toBe(
        PRESET_RAW_TOKENS.nord['--text-color-highlight']
      );
    });

    it('should return preset tokens when intensity is 0', () => {
      const theme = resolveTheme({
        preset: 'catppuccin',
        palette: mockPalette,
        mode: 'full-dynamic',
        intensity: 0
      });

      for (const token of THEME_TOKEN_KEYS) {
        expect(theme[token]).toBe(PRESET_RAW_TOKENS.catppuccin[token]);
      }
    });

    it('should default to dynamic-accent mode when mode option is omitted', () => {
      const theme = resolveTheme({
        preset: 'dracula',
        palette: mockPalette,
        intensity: 100
      });

      const accentKeySet = new Set<string>(ACCENT_TOKEN_KEYS);
      for (const token of THEME_TOKEN_KEYS) {
        if (accentKeySet.has(token)) {
          expect(theme[token]).not.toBe(PRESET_RAW_TOKENS.dracula[token]);
        } else {
          expect(theme[token]).toBe(PRESET_RAW_TOKENS.dracula[token]);
        }
      }
    });

    it('should override exactly 12 accent tokens in dynamic-accent mode', () => {
      const theme = resolveTheme({
        preset: 'dracula',
        palette: mockPalette,
        mode: 'dynamic-accent',
        intensity: 100
      });

      const accentKeySet = new Set<string>(ACCENT_TOKEN_KEYS);
      expect(ACCENT_TOKEN_KEYS.length).toBe(12);

      let overriddenCount = 0;
      let preservedCount = 0;

      for (const token of THEME_TOKEN_KEYS) {
        if (accentKeySet.has(token)) {
          expect(theme[token]).not.toBe(PRESET_RAW_TOKENS.dracula[token]);
          overriddenCount += 1;
        } else {
          expect(theme[token]).toBe(PRESET_RAW_TOKENS.dracula[token]);
          preservedCount += 1;
        }
      }

      expect(overriddenCount).toBe(12);
      expect(preservedCount).toBe(16);
    });

    it('should map semantic roles 1:1 in full-dynamic mode at intensity 100', () => {
      const theme = resolveTheme({
        preset: 'default',
        palette: mockPalette,
        mode: 'full-dynamic',
        intensity: 100
      });

      // Dark Mode Semantic Role Assertions
      expect(theme['--dark-background-color-1']).toBe(formatHsl(mockPalette.dark.backgroundBase));
      expect(theme['--dark-background-color-2']).toBe(formatHsl(mockPalette.dark.surfaceBase));
      expect(theme['--dark-side-bar-background']).toBe(formatHsl(mockPalette.dark.sidebar));
      expect(theme['--dark-text-color']).toBe(formatHsl(mockPalette.dark.textPrimary));
      expect(theme['--dark-text-color-dimmed']).toBe(formatHsl(mockPalette.dark.textMuted));
      expect(theme['--dark-seekbar-background-color']).toBe(formatHsl(mockPalette.primaryAccent));
      expect(theme['--dark-seekbar-track-background-color']).toBe(
        formatHsl(mockPalette.dark.seekbarTrack)
      );
      expect(theme['--dark-text-color-highlight']).toBe(formatHsl(mockPalette.primaryAccent));
      expect(theme['--dark-text-color-highlight-2']).toBe(formatHsl(mockPalette.secondaryAccent));
      expect(theme['--dark-context-menu-background']).toBe(
        formatHsl(mockPalette.dark.surfaceElevated)
      );
      expect(theme['--dark-foreground-color-1']).toBe(formatHsl(mockPalette.primaryAccent));

      // Light Mode Semantic Role Assertions
      expect(theme['--background-color-1']).toBe(formatHsl(mockPalette.light.backgroundBase));
      expect(theme['--background-color-2']).toBe(formatHsl(mockPalette.light.surfaceBase));
      expect(theme['--background-color-3']).toBe(formatHsl(mockPalette.accentContainer));
      expect(theme['--side-bar-background']).toBe(formatHsl(mockPalette.light.sidebar));
      expect(theme['--text-color']).toBe(formatHsl(mockPalette.light.textPrimary));
      expect(theme['--text-color-dimmed']).toBe(formatHsl(mockPalette.light.textMuted));
      expect(theme['--text-color-highlight']).toBe(formatHsl(mockPalette.primaryAccent));
      expect(theme['--text-color-highlight-2']).toBe(formatHsl(mockPalette.secondaryAccent));
      expect(theme['--context-menu-background']).toBe(
        formatHsl(mockPalette.light.surfaceElevated)
      );
      expect(theme['--seekbar-background-color']).toBe(formatHsl(mockPalette.primaryAccent));
      expect(theme['--seekbar-track-background-color']).toBe(
        formatHsl(mockPalette.light.seekbarTrack)
      );
    });

    it('should correctly format all 28 output tokens as valid HSL channels', () => {
      const theme = resolveTheme({
        preset: 'tokyonight',
        palette: mockPalette,
        mode: 'full-dynamic',
        intensity: 80
      });

      const hslRegex = /^\d+\s+\d+%\s+\d+%$/;
      for (const token of THEME_TOKEN_KEYS) {
        expect(theme[token]).toMatch(hslRegex);
      }
    });
  });

  describe('Synchronization Contract Test (styles.css vs PRESET_RAW_TOKENS)', () => {
    it('should verify PRESET_RAW_TOKENS strictly matches styles.css with zero drift', () => {
      const stylesPath = path.resolve(
        __dirname,
        '../../../../../src/renderer/src/assets/styles/styles.css'
      );
      const stylesContent = fs.readFileSync(stylesPath, 'utf8');

      const allPresets = Object.keys(themeRegistry) as ThemePreset[];

      const requiredLightVars = [
        '--background-color-1',
        '--background-color-2',
        '--background-color-3',
        '--background-color-dimmed',
        '--side-bar-background',
        '--text-color',
        '--text-color-dimmed',
        '--text-color-highlight',
        '--text-color-highlight-2',
        '--seekbar-background-color',
        '--seekbar-track-background-color',
        '--foreground-color-1',
        '--context-menu-background',
        '--context-menu-list-hover'
      ];
      const requiredDarkVars = requiredLightVars.map((v) => v.replace('--', '--dark-'));

      for (const preset of allPresets) {
        let blockContent = '';

        if (preset === 'default') {
          // Extract :root block
          const rootMatch = /:root\s*\{([^}]+)\}/.exec(stylesContent);
          expect(rootMatch).toBeTruthy();
          blockContent = rootMatch![1];
        } else {
          // Extract [data-theme="preset"] block
          const selectorRegex = new RegExp(`\\[data-theme=["']${preset}["']\\][^{]*\\{([^}]+)\\}`, 'g');
          const match = selectorRegex.exec(stylesContent);
          expect(match).toBeTruthy();
          blockContent = match![1];
        }

        const mode = preset === 'default' ? 'adaptive' : themeRegistry[preset].mode;
        const expectedTokens: string[] = [];
        if (mode === 'adaptive' || mode === 'light') {
          expectedTokens.push(...requiredLightVars);
        }
        if (mode === 'adaptive' || mode === 'dark') {
          expectedTokens.push(...requiredDarkVars);
        }

        // Validate that every expected token exists in styles.css and exactly matches PRESET_RAW_TOKENS
        for (const token of expectedTokens) {
          const varRegex = new RegExp(`${token}:\\s*([^;\\n\\r]+)[;\\n]`);
          const varMatch = varRegex.exec(blockContent);

          // Strictly enforce that the variable exists in styles.css
          expect(varMatch, `Token ${token} should exist in styles.css for preset ${preset}`).toBeTruthy();

          // Clean inline comments like /* hsl(...) */
          const cssValue = varMatch![1].replace(/\/\*.*?\*\//g, '').trim();
          const resolverValue = PRESET_RAW_TOKENS[preset][token as ThemeTokenKey].trim();
          expect(resolverValue, `Token ${token} value in PRESET_RAW_TOKENS should match styles.css for preset ${preset}`).toBe(cssValue);
        }
      }
    });
  });
});
