import { themeRegistry, type ThemePreset } from '../../../common/themeRegistry';

interface ResolveEffectiveAppearanceParams {
  themePreset: ThemePreset | string;
  userAppearance: boolean; // true = dark, false = light
}

interface EffectiveAppearance {
  isDark: boolean;
  mode: 'light' | 'dark';
  isThemeControlled: boolean;
}

export function resolveEffectiveAppearance({
  themePreset,
  userAppearance
}: ResolveEffectiveAppearanceParams): EffectiveAppearance {
  const themeDef = themeRegistry[themePreset as ThemePreset] ?? themeRegistry.default;

  if (themeDef.mode === 'dark') {
    return {
      isDark: true,
      mode: 'dark',
      isThemeControlled: true
    };
  }

  if (themeDef.mode === 'light') {
    return {
      isDark: false,
      mode: 'light',
      isThemeControlled: true
    };
  }

  // Adaptive mode
  return {
    isDark: userAppearance,
    mode: userAppearance ? 'dark' : 'light',
    isThemeControlled: false
  };
}
