// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDynamicTheme } from '../../../../../src/renderer/src/hooks/useDynamicTheme';
import { store } from '../../../../../src/renderer/src/store/store';
import {
  ACCENT_TOKEN_KEYS,
  THEME_TOKEN_KEYS
} from '../../../../../src/renderer/src/utils/themeResolver';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useDynamicTheme hook', () => {
  let rootElement: HTMLDivElement;

  const mockPalette: NodeVibrantPalette = {
    Vibrant: { hex: '#e63946', hsl: [0.985, 0.78, 0.56], population: 100 },
    LightVibrant: { hex: '#f1faee', hsl: [0.49, 0.73, 0.96], population: 50 },
    DarkVibrant: { hex: '#1d3557', hsl: [0.597, 0.5, 0.23], population: 80 }
  };

  beforeEach(() => {
    // Setup #root element in document.body
    rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);

    // Reset store to predictable state
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableImageBasedDynamicThemes: false,
          dynamicThemeMode: 'dynamic-accent',
          dynamicThemeIntensity: 100,
          themePreset: 'default'
        }
      },
      currentSongData: {
        ...prev.currentSongData,
        paletteData: undefined
      }
    }));
  });

  afterEach(() => {
    if (rootElement && rootElement.parentNode) {
      rootElement.parentNode.removeChild(rootElement);
    }
    document.body.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('should not apply dynamic tokens on #root when dynamic theming is disabled', () => {
    renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    for (const token of THEME_TOKEN_KEYS) {
      expect(rootElement.style.getPropertyValue(token)).toBe('');
    }
  });

  it('should apply exactly 12 accent tokens in dynamic-accent mode when enabled and palette is present', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableImageBasedDynamicThemes: true,
          dynamicThemeMode: 'dynamic-accent',
          themePreset: 'nord'
        }
      },
      currentSongData: {
        ...prev.currentSongData,
        paletteData: mockPalette
      }
    }));

    renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    const accentKeySet = new Set<string>(ACCENT_TOKEN_KEYS);

    for (const token of THEME_TOKEN_KEYS) {
      const val = rootElement.style.getPropertyValue(token);
      if (accentKeySet.has(token)) {
        expect(val).not.toBe('');
      } else {
        expect(val).toBe('');
      }
    }
  });

  it('should apply all 28 dynamic tokens in full-dynamic mode', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableImageBasedDynamicThemes: true,
          dynamicThemeMode: 'full-dynamic',
          themePreset: 'dracula'
        }
      },
      currentSongData: {
        ...prev.currentSongData,
        paletteData: mockPalette
      }
    }));

    renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    for (const token of THEME_TOKEN_KEYS) {
      expect(rootElement.style.getPropertyValue(token)).not.toBe('');
    }
  });

  it('should fall back to active preset with zero dynamic inline tokens when song has no palette', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableImageBasedDynamicThemes: true,
          dynamicThemeMode: 'full-dynamic',
          themePreset: 'nord'
        }
      },
      currentSongData: {
        ...prev.currentSongData,
        paletteData: undefined // No artwork / palette
      }
    }));

    renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    // Verified: No dynamic inline styles are set, allowing [data-theme="nord"] to rule 100%
    for (const token of THEME_TOKEN_KEYS) {
      expect(rootElement.style.getPropertyValue(token)).toBe('');
    }
  });

  it('should clean up surface tokens when switching from full-dynamic to dynamic-accent mode', () => {
    const { rerender } = renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    // 1. First in full-dynamic mode
    act(() => {
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            enableImageBasedDynamicThemes: true,
            dynamicThemeMode: 'full-dynamic',
            themePreset: 'default'
          }
        },
        currentSongData: {
          ...prev.currentSongData,
          paletteData: mockPalette
        }
      }));
    });

    rerender();

    expect(rootElement.style.getPropertyValue('--background-color-1')).not.toBe('');

    // 2. Switch to dynamic-accent mode
    act(() => {
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            dynamicThemeMode: 'dynamic-accent'
          }
        }
      }));
    });

    rerender();

    expect(rootElement.style.getPropertyValue('--background-color-1')).toBe('');
    expect(rootElement.style.getPropertyValue('--seekbar-background-color')).not.toBe('');
  });

  it('should remove all dynamic tokens when dynamic theming is disabled', () => {
    const { rerender } = renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    // Enable first
    act(() => {
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            enableImageBasedDynamicThemes: true,
            dynamicThemeMode: 'full-dynamic'
          }
        },
        currentSongData: {
          ...prev.currentSongData,
          paletteData: mockPalette
        }
      }));
    });

    rerender();
    expect(rootElement.style.getPropertyValue('--seekbar-background-color')).not.toBe('');

    // Disable
    act(() => {
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            enableImageBasedDynamicThemes: false
          }
        }
      }));
    });

    rerender();

    for (const token of THEME_TOKEN_KEYS) {
      expect(rootElement.style.getPropertyValue(token)).toBe('');
    }
  });

  it('should set data-theme attribute on documentElement when themePreset is not default', () => {
    act(() => {
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            themePreset: 'tokyonight'
          }
        }
      }));
    });

    renderHook(() => useDynamicTheme(), { wrapper: createWrapper() });

    expect(document.documentElement.getAttribute('data-theme')).toBe('tokyonight');

    act(() => {
      store.setState((prev) => ({
        ...prev,
        localStorage: {
          ...prev.localStorage,
          preferences: {
            ...prev.localStorage.preferences,
            themePreset: 'default'
          }
        }
      }));
    });

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
