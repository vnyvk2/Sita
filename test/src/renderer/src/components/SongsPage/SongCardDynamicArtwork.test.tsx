// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getSongCardBackground } from '../../../../../../src/renderer/src/components/SongsPage/songCardBackground';
import { store } from '../../../../../../src/renderer/src/store/store';
import storage from '../../../../../../src/renderer/src/utils/localStorage';

describe('SongCard Background & Dynamic Artwork Tint', () => {
  const samplePalette: NodeVibrantPalette = {
    DarkVibrant: { hex: '#1a2b3c', hsl: [200, 0.4, 0.2], population: 100 },
    Vibrant: { hex: '#4d88ff', hsl: [220, 0.8, 0.6], population: 200 },
    DarkMuted: { hex: '#223344', hsl: [210, 0.3, 0.2], population: 50 }
  };

  beforeEach(() => {
    // Reset preferences to default
    storage.preferences.setPreferences('isSongCardDynamicArtworkBackgroundEnabled', false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates clean readability gradient when dynamic tint is disabled (default)', () => {
    const bgDisabled = getSongCardBackground(samplePalette, false);
    expect(bgDisabled).toBe(
      'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.15) 50%, rgba(0, 0, 0, 0.25) 100%)'
    );

    const bgUndefined = getSongCardBackground(samplePalette, undefined);
    expect(bgUndefined).toBe(
      'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.15) 50%, rgba(0, 0, 0, 0.25) 100%)'
    );
  });

  it('generates subtle palette tint with 20%-40% alpha when dynamic tint is enabled', () => {
    const bgEnabled = getSongCardBackground(samplePalette, true);

    // Expect palette hexes with subtle alpha suffixes: 66 (~40%), 4D (~30%), 33 (~20%)
    expect(bgEnabled).toContain('#1a2b3c66');
    expect(bgEnabled).toContain('#4d88ff4D');
    expect(bgEnabled).toContain('#22334433');
    expect(bgEnabled).toContain('linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%');
  });

  it('generates safe fallback background when palette is undefined but tint is enabled', () => {
    const bgFallback = getSongCardBackground(undefined, true);

    expect(bgFallback).toContain('#00000066');
    expect(bgFallback).toContain('#0000004D');
    expect(bgFallback).toContain('#00000033');
    expect(bgFallback).toContain('linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%');
  });

  it('persists dynamic artwork tint preference across storage updates', () => {
    // Initial state is false
    expect(store.state.localStorage.preferences.isSongCardDynamicArtworkBackgroundEnabled).toBe(
      false
    );

    // Toggle ON
    storage.preferences.setPreferences('isSongCardDynamicArtworkBackgroundEnabled', true);
    expect(store.state.localStorage.preferences.isSongCardDynamicArtworkBackgroundEnabled).toBe(
      true
    );

    // Toggle OFF
    storage.preferences.setPreferences('isSongCardDynamicArtworkBackgroundEnabled', false);
    expect(store.state.localStorage.preferences.isSongCardDynamicArtworkBackgroundEnabled).toBe(
      false
    );
  });
});
