// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LyricsAmbientBackground from '../../../../../../src/renderer/src/components/LyricsPage/LyricsAmbientBackground';
import { store } from '../../../../../../src/renderer/src/store/store';

describe('LyricsAmbientBackground', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']
    });
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          lyricsBackground: 'artwork',
          lyricsArtworkBlur: 40,
          lyricsArtworkDarkness: 50,
          lyricsArtworkAnimation: true,
          isReducedMotion: false,
          removeAnimationsOnBatteryPower: false
        }
      },
      isOnBatteryPower: false,
      player: {
        ...prev.player,
        isCurrentSongPlaying: true
      }
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render the ambient background container with blurred artwork layer', () => {
    const { container } = render(
      <LyricsAmbientBackground artworkPath="nora://localfiles/artwork.jpg" />
    );

    const backgroundContainer = container.querySelector('.lyrics-ambient-background');
    expect(backgroundContainer).not.toBeNull();

    const blurredLayer = backgroundContainer?.querySelector(
      '.animate-ambient-drift'
    ) as HTMLElement;
    expect(blurredLayer).not.toBeNull();
    expect(blurredLayer.style.filter).toContain('blur(40px)');
  });

  it('should perform double-buffered crossfade on artwork change and clear previous artwork after transition', () => {
    const { rerender, container } = render(
      <LyricsAmbientBackground artworkPath="nora://localfiles/trackA.jpg" />
    );

    // Initial render: 1 artwork image
    let images = container.querySelectorAll('img');
    expect(images.length).toBe(1);

    // Change artwork to trackB
    act(() => {
      rerender(<LyricsAmbientBackground artworkPath="nora://localfiles/trackB.jpg" />);
    });

    // During crossfade transition: previous layer and active layer both exist in DOM
    images = container.querySelectorAll('img');
    expect(images.length).toBe(2);

    // Advance timers past transition duration (850ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Previous layer is unmounted, only trackB remains
    images = container.querySelectorAll('img');
    expect(images.length).toBe(1);
  });

  it('should apply custom blur from store preferences', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          lyricsArtworkBlur: 65
        }
      }
    }));

    const { container } = render(
      <LyricsAmbientBackground artworkPath="nora://localfiles/artwork.jpg" />
    );

    const backgroundContainer = container.querySelector('.lyrics-ambient-background');
    const blurredLayer = backgroundContainer?.firstElementChild as HTMLElement;
    expect(blurredLayer.style.filter).toContain('blur(65px)');
  });

  it('should pause animation when isReducedMotion is true', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          isReducedMotion: true
        }
      }
    }));

    const { container } = render(
      <LyricsAmbientBackground artworkPath="nora://localfiles/artwork.jpg" />
    );

    const blurredLayer = container.querySelector('.animate-ambient-drift');
    expect(blurredLayer).toBeNull();
  });

  it('should compute adaptive overlay darkness based on palette luminance', () => {
    const brightPalette: NodeVibrantPalette = {
      Vibrant: { hex: '#ffffff', hsl: [0, 0, 0.95], population: 100 }
    };

    const { container } = render(
      <LyricsAmbientBackground
        artworkPath="nora://localfiles/bright.jpg"
        paletteData={brightPalette as PaletteData}
      />
    );

    const overlay = container.querySelector('.transition-colors') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.backgroundColor).toContain('rgba(0, 0, 0,');
  });
});
