import { describe, it, expect, vi } from 'vitest';

import { resolveEffectiveAppearance } from './resolveEffectiveAppearance';

vi.mock('../../../common/themeRegistry', () => ({
  themeRegistry: {
    default: { mode: 'adaptive' },
    nord: { mode: 'adaptive' },
    dracula: { mode: 'dark' },
    'test-fixture-light-theme': { mode: 'light' }
  }
}));

describe('resolveEffectiveAppearance', () => {
  it('should resolve adaptive theme + light appearance to light', () => {
    const result = resolveEffectiveAppearance({ themePreset: 'nord', userAppearance: false });
    expect(result).toEqual({ isDark: false, mode: 'light', isThemeControlled: false });
  });

  it('should resolve adaptive theme + dark appearance to dark', () => {
    const result = resolveEffectiveAppearance({ themePreset: 'nord', userAppearance: true });
    expect(result).toEqual({ isDark: true, mode: 'dark', isThemeControlled: false });
  });

  it('should coerce fixed-dark theme + light appearance to dark', () => {
    const result = resolveEffectiveAppearance({ themePreset: 'dracula', userAppearance: false });
    expect(result).toEqual({ isDark: true, mode: 'dark', isThemeControlled: true });
  });

  it('should coerce fixed-dark theme + dark appearance to dark', () => {
    const result = resolveEffectiveAppearance({ themePreset: 'dracula', userAppearance: true });
    expect(result).toEqual({ isDark: true, mode: 'dark', isThemeControlled: true });
  });

  it('should coerce fixed-light theme + light appearance to light', () => {
    const result = resolveEffectiveAppearance({
      themePreset: 'test-fixture-light-theme',
      userAppearance: false
    });
    expect(result).toEqual({ isDark: false, mode: 'light', isThemeControlled: true });
  });

  it('should coerce fixed-light theme + dark appearance to light', () => {
    // User prefers dark, but theme is fixed-light
    const result = resolveEffectiveAppearance({
      themePreset: 'test-fixture-light-theme',
      userAppearance: true
    });
    expect(result).toEqual({
      isDark: false,
      mode: 'light',
      isThemeControlled: true
    });
  });
});
