// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DynamicThemeSettings from '../../../../../../../src/renderer/src/components/SettingsPage/Settings/DynamicThemeSettings';
import { store } from '../../../../../../../src/renderer/src/store/store';
import storage from '../../../../../../../src/renderer/src/utils/localStorage';

describe('DynamicThemeSettings component', () => {
  const mockPalette: NodeVibrantPalette = {
    Vibrant: { hex: '#e63946', hsl: [0.985, 0.78, 0.56], population: 100 },
    LightVibrant: { hex: '#f1faee', hsl: [0.49, 0.73, 0.96], population: 50 },
    DarkVibrant: { hex: '#1d3557', hsl: [0.597, 0.5, 0.23], population: 80 }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableImageBasedDynamicThemes: true,
          dynamicThemeMode: 'dynamic-accent',
          dynamicThemeIntensity: 100,
          themePreset: 'default'
        }
      }
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should render mode buttons and intensity slider with default values', () => {
    render(<DynamicThemeSettings palette={mockPalette} />);

    const accentButton = screen.getByText('Dynamic Accent');
    const fullButton = screen.getByText('Full Atmosphere');

    expect(accentButton).toBeDefined();
    expect(fullButton).toBeDefined();
    // Visual and accessibility selected state: accent is active by default
    expect(accentButton.className).toContain('bg-font-color-highlight');
    expect(fullButton.className).not.toContain('bg-font-color-highlight');
    expect(accentButton.getAttribute('aria-pressed')).toBe('true');
    expect(fullButton.getAttribute('aria-pressed')).toBe('false');

    expect(screen.getByLabelText('Dynamic Theme Intensity')).toBeDefined();
    expect(screen.getByText(/Dynamic Theme Intensity:\s*100%/)).toBeDefined();
    expect(screen.getByText('Derived Semantic Tones')).toBeDefined();
    expect(screen.getByText('Primary Accent')).toBeDefined();
    expect(screen.getByText('Secondary Accent')).toBeDefined();
    expect(screen.getByText('Dark Canvas')).toBeDefined();
    expect(screen.getByText('Light Canvas')).toBeDefined();
  });

  it('should handle undefined preferences gracefully with dynamic-accent and 100% defaults', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          dynamicThemeMode: undefined,
          dynamicThemeIntensity: undefined
        }
      }
    }));

    render(<DynamicThemeSettings />);

    const accentButton = screen.getByText('Dynamic Accent');
    expect(accentButton.className).toContain('bg-font-color-highlight');
    expect(screen.getByText(/Dynamic Theme Intensity:\s*100%/)).toBeDefined();
  });

  it('should reflect active class on Full Atmosphere button when dynamicThemeMode is full-dynamic', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          dynamicThemeMode: 'full-dynamic'
        }
      }
    }));

    render(<DynamicThemeSettings palette={mockPalette} />);

    const accentButton = screen.getByText('Dynamic Accent');
    const fullButton = screen.getByText('Full Atmosphere');

    expect(fullButton.className).toContain('bg-font-color-highlight');
    expect(accentButton.className).not.toContain('bg-font-color-highlight');
  });

  it('should trigger preference update when switching to Full Atmosphere', () => {
    const setPreferencesSpy = vi.spyOn(storage.preferences, 'setPreferences');

    render(<DynamicThemeSettings palette={mockPalette} />);

    const fullAtmosphereButton = screen.getByText('Full Atmosphere');
    fireEvent.click(fullAtmosphereButton);

    expect(setPreferencesSpy).toHaveBeenCalledWith('dynamicThemeMode', 'full-dynamic');
  });

  it('should trigger preference update when changing intensity slider', () => {
    const setPreferencesSpy = vi.spyOn(storage.preferences, 'setPreferences');

    render(<DynamicThemeSettings palette={mockPalette} />);

    const slider = screen.getByTitle('100%');
    fireEvent.change(slider, { target: { value: '60' } });

    expect(setPreferencesSpy).toHaveBeenCalledWith('dynamicThemeIntensity', 60);
  });

  it('should trigger reset to 100% when clicking reset button', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          dynamicThemeIntensity: 45
        }
      }
    }));

    const setPreferencesSpy = vi.spyOn(storage.preferences, 'setPreferences');

    render(<DynamicThemeSettings palette={mockPalette} />);

    const resetButton = screen.getByText('Reset to 100%');
    fireEvent.click(resetButton);

    expect(setPreferencesSpy).toHaveBeenCalledWith('dynamicThemeIntensity', 100);
  });

  it('should render controls without crashing when palette is undefined', () => {
    render(<DynamicThemeSettings palette={undefined} />);

    expect(screen.getByText('Dynamic Accent')).toBeDefined();
    expect(screen.getByText('Full Atmosphere')).toBeDefined();
    expect(screen.queryByText('Derived Semantic Tones')).toBeNull();
  });
});
