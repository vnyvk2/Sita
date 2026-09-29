import { describe, expect, it } from 'vitest';

import type { SettingCatalogEntry } from '../../settingsCatalog';
import { matchSettings } from '../matchSettings';

describe('matchSettings engine', () => {
  const sampleCatalog: SettingCatalogEntry[] = [
    {
      id: 'setting-appearance-theme-mode',
      sectionKey: 'appearance',
      titleKey: 'settingsPage.theme',
      defaultTitle: 'Theme Mode',
      descriptionKey: 'settingsPage.themeDescription',
      defaultDescription: 'Toggle dark mode or light mode for the Nora interface.',
      keywords: ['theme', 'dark mode', 'light mode', 'night', 'day']
    },
    {
      id: 'setting-audio-crossfade',
      sectionKey: 'audioPlayback',
      titleKey: 'settingsPage.crossfade',
      defaultTitle: 'Crossfade',
      descriptionKey: 'settingsPage.crossfadeDescription',
      defaultDescription: 'Smoothly crossfade between songs.',
      keywords: ['crossfade', 'fade', 'transition', 'gapless']
    },
    {
      id: 'setting-lyrics-custom-location',
      sectionKey: 'lyrics',
      titleKey: 'settingsPage.customLyricsLocation',
      defaultTitle: 'Custom LRC Location',
      descriptionKey: 'settingsPage.customLyricsLocationDescription',
      defaultDescription: 'Specify an external folder containing synchronization LRC files.',
      keywords: ['lyrics', 'lrc', 'folder', 'subtitle']
    }
  ];

  const mockTranslate = (key: string, options?: { defaultValue?: string }): unknown => {
    if (key === 'settingsPage.searchAliases.setting-appearance-theme-mode') {
      return ['night owl', 'palette', 'colorway'];
    }
    return options?.defaultValue ?? key;
  };

  it('returns an empty array when query is empty or only whitespace', () => {
    expect(matchSettings('', sampleCatalog, mockTranslate)).toEqual([]);
    expect(matchSettings('   ', sampleCatalog, mockTranslate)).toEqual([]);
  });

  it('matches prefix of title and scores it with highest priority', () => {
    const results = matchSettings('cross', sampleCatalog, mockTranslate);
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('setting-audio-crossfade');
    expect(results[0].score).toBeGreaterThanOrEqual(90);
    expect(results[0].matchedField).toBe('title');
  });

  it('is case-insensitive', () => {
    const lower = matchSettings('theme', sampleCatalog, mockTranslate);
    const upper = matchSettings('THEME', sampleCatalog, mockTranslate);
    expect(lower.length).toBe(upper.length);
    expect(lower[0].entry.id).toBe(upper[0].entry.id);
  });

  it('handles accent and diacritic folding', () => {
    // User types "thème" or catalog contains diacritics
    const results = matchSettings('thèm', sampleCatalog, mockTranslate);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.id).toBe('setting-appearance-theme-mode');
  });

  it('matches localized search aliases', () => {
    // "night owl" is an alias provided by translation mock
    const results = matchSettings('night owl', sampleCatalog, mockTranslate);
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('setting-appearance-theme-mode');
    expect(results[0].matchedField).toBe('alias');
    expect(results[0].matchedAlias).toBe('night owl');
  });

  it('matches description when title does not match query', () => {
    const results = matchSettings('synchronization', sampleCatalog, mockTranslate);
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('setting-lyrics-custom-location');
    expect(results[0].matchedField).toBe('description');
  });

  it('ranks title exact matches ahead of keyword and description matches', () => {
    const results = matchSettings('fade', sampleCatalog, mockTranslate);
    expect(results.length).toBeGreaterThan(0);
    // Crossfade title contains fade
    expect(results[0].entry.id).toBe('setting-audio-crossfade');
  });

  it('matches multi-word queries across title and keywords', () => {
    // "dark night" matches Theme Mode (dark mode in keywords, night in keywords)
    const results = matchSettings('dark night', sampleCatalog, mockTranslate);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.id).toBe('setting-appearance-theme-mode');
  });

  it('normalizes punctuation like dots and hyphens', () => {
    // Catalog entry with dots or hyphens
    const testCatalog: SettingCatalogEntry[] = [
      {
        id: 'setting-accounts-lastfm',
        sectionKey: 'accounts',
        titleKey: 'settingsPage.lastFm',
        defaultTitle: 'Last.fm Scrobbler',
        keywords: ['last.fm', 'lastfm', 'scrobble']
      }
    ];
    // User types "last fm" with a space instead of dot
    const results = matchSettings('last fm', testCatalog, mockTranslate);
    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('setting-accounts-lastfm');
  });

  it('guards against single-character substring noise in descriptions', () => {
    // 'e' appears in almost every description ("Toggle dark mode...", "Smoothly...")
    const results = matchSettings('e', sampleCatalog, mockTranslate);
    // Should NOT match descriptions for single character queries; only title words starting with 'e'
    const matchedDescriptions = results.filter((r) => r.matchedField === 'description');
    expect(matchedDescriptions).toHaveLength(0);
  });
});
