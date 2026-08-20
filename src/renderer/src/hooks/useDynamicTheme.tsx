import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect } from 'react';

import { useEffectiveAppearance } from './useEffectiveAppearance';
import { type ThemePreset } from '../../../common/themeRegistry';
import { dispatch, store } from '../store/store';
import storage from '../utils/localStorage';
import { resolveSemanticPalette } from '../utils/semanticPalette';
import {
  ACCENT_TOKEN_KEYS,
  resolveTheme,
  THEME_TOKEN_KEYS,
  type DynamicThemeMode
} from '../utils/themeResolver';

const resetStyles = () => {
  const root = document.getElementById('root');
  if (root) {
    for (const token of THEME_TOKEN_KEYS) {
      root.style.removeProperty(token);
    }
    root.style.removeProperty('--slider-opacity');
    root.style.removeProperty('--dark-slider-opacity');
  }
};

/**
 * Efficiently applies resolved dynamic tokens to #root using diff-based writes.
 * Reads inline custom-property values on #root and writes only when that value differs,
 * while removing tokens that are no longer active.
 */
const applyThemeTokens = (
  palette?: NodeVibrantPalette,
  preset: ThemePreset = 'default',
  mode: DynamicThemeMode = 'dynamic-accent',
  intensity: number = 100
) => {
  const root = document.getElementById('root');
  if (!root) return;

  if (!palette) {
    resetStyles();
    return;
  }

  const semanticPalette = resolveSemanticPalette(palette);
  const resolvedTokens = resolveTheme({
    preset,
    palette: semanticPalette,
    mode,
    intensity
  });

  const activeKeys = mode === 'full-dynamic' ? THEME_TOKEN_KEYS : ACCENT_TOKEN_KEYS;
  const activeKeySet = new Set<string>(activeKeys);

  // 1. Write or update active tokens only if changed
  for (const token of activeKeys) {
    const nextVal = resolvedTokens[token];
    if (root.style.getPropertyValue(token) !== nextVal) {
      root.style.setProperty(token, nextVal, 'important');
    }
  }

  // 2. Clean up inactive tokens only if currently set
  for (const token of THEME_TOKEN_KEYS) {
    if (!activeKeySet.has(token) && root.style.getPropertyValue(token) !== '') {
      root.style.removeProperty(token);
    }
  }
};

export interface UseDynamicThemeReturn {
  setDynamicThemesFromSongPalette: (
    palette?: NodeVibrantPalette,
    customMode?: DynamicThemeMode,
    customIntensity?: number
  ) => () => void;
  updateBodyBackgroundImage: (isVisible: boolean, src?: string) => void;
}

/**
 * Hook for managing dynamic themes, background images, and dark mode.
 *
 * Integrates with Dynamic Theme v2 engine (semanticPalette & themeResolver)
 * with diff-based CSS variable writes to avoid redundant property updates
 * and eliminate unnecessary remove-and-reapply cycles.
 */
export function useDynamicTheme(): UseDynamicThemeReturn {
  const themePreset = useStore(
    store,
    (state) => state.localStorage.preferences?.themePreset ?? 'default'
  );

  const dynamicThemeMode = useStore(
    store,
    (state) => (state.localStorage.preferences?.dynamicThemeMode ?? 'dynamic-accent') as DynamicThemeMode
  );

  const dynamicThemeIntensity = useStore(
    store,
    (state) => state.localStorage.preferences?.dynamicThemeIntensity ?? 100
  );

  const isImageBasedDynamicThemesEnabled = useStore(
    store,
    (state) => state.localStorage.preferences?.enableImageBasedDynamicThemes ?? false
  );

  const currentSongPaletteData = useStore(store, (state) => state.currentSongData?.paletteData);

  const setDynamicThemesFromSongPalette = useCallback(
    (
      palette?: NodeVibrantPalette,
      customMode?: DynamicThemeMode,
      customIntensity?: number
    ) => {
      const mode = customMode ?? dynamicThemeMode;
      const intensity = customIntensity ?? dynamicThemeIntensity;
      applyThemeTokens(palette, themePreset, mode, intensity);
      return resetStyles;
    },
    [themePreset, dynamicThemeMode, dynamicThemeIntensity]
  );

  const updateBodyBackgroundImage = useCallback((isVisible: boolean, src?: string) => {
    let image: string | undefined;
    const disableBackgroundArtworks = storage.preferences.getPreferences(
      'disableBackgroundArtworks'
    );

    if (!disableBackgroundArtworks && isVisible && src) image = src;

    return dispatch({
      type: 'UPDATE_BODY_BACKGROUND_IMAGE',
      data: image
    });
  }, []);

  // Reactively apply dynamic theme with diff-based writes
  useEffect(() => {
    const isDynamicActive = isImageBasedDynamicThemesEnabled && Boolean(currentSongPaletteData);
    const targetPalette = isDynamicActive ? currentSongPaletteData : undefined;

    applyThemeTokens(targetPalette, themePreset, dynamicThemeMode, dynamicThemeIntensity);

    return () => {
      // If dynamic theming is disabled or unmounted, cleanup is handled by applyThemeTokens
    };
  }, [
    isImageBasedDynamicThemesEnabled,
    currentSongPaletteData,
    themePreset,
    dynamicThemeMode,
    dynamicThemeIntensity
  ]);

  // Monitor dark mode setting and apply/remove 'dark' class on document.body and documentElement
  const { isDark } = useEffectiveAppearance();

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
      document.documentElement.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Monitor theme preset preference and apply data-theme attribute on document.documentElement
  useEffect(() => {
    if (themePreset && themePreset !== 'default') {
      document.documentElement.setAttribute('data-theme', themePreset);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [themePreset]);

  return {
    setDynamicThemesFromSongPalette,
    updateBodyBackgroundImage
  };
}
