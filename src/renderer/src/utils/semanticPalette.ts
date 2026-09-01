import roundTo from '../../../common/roundTo';

export interface HslColor {
  h: number; // 0 - 360
  s: number; // 0 - 100 (%)
  l: number; // 0 - 100 (%)
}

export interface SemanticDynamicPalette {
  primaryAccent: HslColor;
  secondaryAccent: HslColor;
  accentContainer: HslColor;
  dark: {
    backgroundBase: HslColor;
    surfaceBase: HslColor;
    surfaceElevated: HslColor;
    sidebar: HslColor;
    textPrimary: HslColor;
    textMuted: HslColor;
    seekbarTrack: HslColor;
    border: HslColor;
  };
  light: {
    backgroundBase: HslColor;
    surfaceBase: HslColor;
    surfaceElevated: HslColor;
    sidebar: HslColor;
    textPrimary: HslColor;
    textMuted: HslColor;
    seekbarTrack: HslColor;
    border: HslColor;
  };
}

export const DEFAULT_NORA_BLUE: HslColor = { h: 212, s: 100, l: 63 };
export const DEFAULT_NORA_SECONDARY: HslColor = { h: 247, s: 74, l: 63 };

export function formatHsl(color: HslColor): string {
  const h = Math.round(color.h);
  const s = Math.round(color.s);
  const l = Math.round(color.l);
  return `${h} ${s}% ${l}%`;
}

export function parseHslString(hslStr: string): HslColor {
  const parts = hslStr.trim().split(/\s+/);
  if (parts.length >= 3) {
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1].replace('%', ''));
    const l = parseFloat(parts[2].replace('%', ''));
    return {
      h: isNaN(h) ? 0 : roundTo(h, 1),
      s: isNaN(s) ? 0 : roundTo(s, 1),
      l: isNaN(l) ? 0 : roundTo(l, 1)
    };
  }
  return { h: 0, s: 0, l: 0 };
}

/**
 * Calculates the shortest angular distance between two hues on the 360-degree color wheel. Example:
 * getHueDistance(355, 5) === 10
 */
export function getHueDistance(h1: number, h2: number): number {
  const diff = Math.abs((((h1 % 360) + 360) % 360) - (((h2 % 360) + 360) % 360)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function normalizeSwatchHsl(rawHsl?: [number, number, number]): HslColor | undefined {
  if (!rawHsl || !Array.isArray(rawHsl) || rawHsl.length < 3) return undefined;

  let [h, s, l] = rawHsl;
  if (typeof h !== 'number' || typeof s !== 'number' || typeof l !== 'number') return undefined;

  // If normalized 0..1 scale (standard node-vibrant output)
  if (h <= 1 && s <= 1 && l <= 1 && (h > 0 || s > 0 || l > 0)) {
    h = h * 360;
    s = s * 100;
    l = l * 100;
  } else if (s <= 1 && l <= 1 && (s > 0 || l > 0)) {
    s = s * 100;
    l = l * 100;
  }

  return {
    h: Math.round(((h % 360) + 360) % 360),
    s: Math.min(100, Math.max(0, Math.round(s))),
    l: Math.min(100, Math.max(0, Math.round(l)))
  };
}

export function resolveSemanticPalette(palette?: NodeVibrantPalette): SemanticDynamicPalette {
  // 1. Resilient Primary Accent Waterfall Fallback
  const candidateSwatches = [
    palette?.Vibrant,
    palette?.LightVibrant,
    palette?.DarkVibrant,
    palette?.Muted,
    palette?.LightMuted,
    palette?.DarkMuted
  ];

  let primarySwatch: HslColor | undefined;
  for (const swatch of candidateSwatches) {
    const normalized = normalizeSwatchHsl(swatch?.hsl);
    if (normalized && (normalized.s > 5 || normalized.l > 5)) {
      primarySwatch = normalized;
      break;
    }
  }

  // Fallback to first non-empty swatch or default Nora Blue
  if (!primarySwatch) {
    for (const swatch of candidateSwatches) {
      const normalized = normalizeSwatchHsl(swatch?.hsl);
      if (normalized) {
        primarySwatch = normalized;
        break;
      }
    }
  }

  const primary = primarySwatch ?? DEFAULT_NORA_BLUE;
  const h = primary.h;
  const s = primary.s;
  const l = primary.l;

  // 2. Secondary Accent Resolution with Circular Hue Distance
  const secondaryCandidates = [
    palette?.LightVibrant,
    palette?.Muted,
    palette?.LightMuted,
    palette?.DarkVibrant
  ];

  let secondarySwatch: HslColor | undefined;
  for (const swatch of secondaryCandidates) {
    const normalized = normalizeSwatchHsl(swatch?.hsl);
    if (normalized) {
      const hueDist = getHueDistance(normalized.h, h);
      // Swatch is considered a distinct secondary accent if angular distance is between 20° and 160°
      if (hueDist >= 20 && normalized.s >= 15) {
        secondarySwatch = normalized;
        break;
      }
    }
  }

  // Fallback: If no distinct swatch satisfies circular distance, synthesize Δ30° harmonic hue shift
  const secondaryH = secondarySwatch ? secondarySwatch.h : (h + 30) % 360;
  const secondaryS = secondarySwatch ? secondarySwatch.s : Math.max(30, s - 15);
  const secondaryL = secondarySwatch ? secondarySwatch.l : Math.min(Math.max(l, 45), 65);

  const primaryAccent: HslColor = {
    h,
    s: Math.max(s, 60),
    l: Math.min(Math.max(l, 45), 65)
  };

  const secondaryAccent: HslColor = {
    h: secondaryH,
    s: Math.min(Math.max(secondaryS, 35), 80),
    l: Math.min(Math.max(secondaryL, 45), 70)
  };

  const accentContainer: HslColor = {
    h,
    s: Math.min(Math.max(s * 0.6, 25), 60),
    l: 30
  };

  // 3. Controlled Surface Saturation & Luminance (Jewel-toned dark, crisp light)
  const isMonochrome = s <= 8;
  const darkSurfaceSaturation = isMonochrome ? 0 : Math.min(Math.max(s * 0.3, 14), 26);
  const lightSurfaceSaturation = isMonochrome ? 0 : Math.min(Math.max(s * 0.2, 8), 18);

  return {
    primaryAccent,
    secondaryAccent,
    accentContainer,
    dark: {
      backgroundBase: { h, s: darkSurfaceSaturation, l: 11 },
      surfaceBase: { h, s: Math.max(0, darkSurfaceSaturation - 2), l: 16 },
      surfaceElevated: { h, s: Math.max(0, darkSurfaceSaturation - 4), l: 22 },
      sidebar: { h, s: darkSurfaceSaturation, l: 14 },
      textPrimary: { h: 0, s: 0, l: 98 },
      textMuted: { h: isMonochrome ? 0 : h, s: isMonochrome ? 0 : 8, l: 72 },
      seekbarTrack: { h, s: Math.min(darkSurfaceSaturation, 15), l: 24 },
      border: { h, s: darkSurfaceSaturation, l: 20 }
    },
    light: {
      backgroundBase: { h, s: lightSurfaceSaturation, l: 98 },
      surfaceBase: { h, s: lightSurfaceSaturation + 4, l: 94 },
      surfaceElevated: { h: 0, s: 0, l: 100 },
      sidebar: { h, s: lightSurfaceSaturation + 2, l: 95 },
      textPrimary: { h: isMonochrome ? 0 : h, s: isMonochrome ? 0 : 15, l: 10 },
      textMuted: { h: isMonochrome ? 0 : h, s: isMonochrome ? 0 : 10, l: 42 },
      seekbarTrack: { h, s: lightSurfaceSaturation, l: 82 },
      border: { h, s: lightSurfaceSaturation, l: 88 }
    }
  };
}
