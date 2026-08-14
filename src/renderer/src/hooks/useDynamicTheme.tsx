import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect } from 'react';

import { useEffectiveAppearance } from './useEffectiveAppearance';
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
 * to reactively apply harmonic color tokens to the #root element while preserving
 * active preset surfaces in dynamic-accent mode.
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
      const root = document.getElementById('root');
      if (!root) return resetStyles;

      // Always reset previously applied custom properties to avoid stale overrides
      resetStyles();

      if (palette) {
        const mode = customMode ?? dynamicThemeMode;
        const intensity = customIntensity ?? dynamicThemeIntensity;
        const semanticPalette = resolveSemanticPalette(palette);
        const tokens = resolveTheme({
          preset: themePreset,
          palette: semanticPalette,
          mode,
          intensity
        });

        if (mode === 'full-dynamic') {
          for (const token of THEME_TOKEN_KEYS) {
            root.style.setProperty(token, tokens[token], 'important');
          }
        } else {
          // In dynamic-accent mode, only set the 12 accent tokens on #root
          for (const token of ACCENT_TOKEN_KEYS) {
            root.style.setProperty(token, tokens[token], 'important');
          }
        }
      }

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

  // Reactively apply dynamic theme when enabled and song palette data is available
  useEffect(() => {
    const isDynamicActive = isImageBasedDynamicThemesEnabled && Boolean(currentSongPaletteData);

    const cleanup = setDynamicThemesFromSongPalette(
      isDynamicActive ? currentSongPaletteData : undefined
    );

    return () => {
      cleanup();
    };
  }, [
    isImageBasedDynamicThemesEnabled,
    currentSongPaletteData,
    setDynamicThemesFromSongPalette
  ]);

  // Monitor dark mode setting and apply/remove 'dark' class on document.body
  const { isDark } = useEffectiveAppearance();

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
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
