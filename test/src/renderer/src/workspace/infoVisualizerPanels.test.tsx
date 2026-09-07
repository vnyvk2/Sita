import { store } from '@renderer/store/store';
import { NowPlayingPanel } from '@renderer/workspace/panels/NowPlayingPanel/NowPlayingPanel';
import { TrackInfoPanel } from '@renderer/workspace/panels/TrackInfoPanel/TrackInfoPanel';
import { VisualizerPanel } from '@renderer/workspace/panels/VisualizerPanel/VisualizerPanel';
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: string) => defaultVal ?? key
    })
  };
});

// Mock tanstack router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

describe('Panels: NowPlayingPanel, TrackInfoPanel, VisualizerPanel', () => {
  const mockApi = {
    instanceId: 'p_test',
    type: 'now-playing' as const,
    setLocal: vi.fn(),
    getLocal: vi.fn((_key, defaultVal) => defaultVal),
    close: vi.fn(),
    maximize: vi.fn()
  };

  const mockInstance = {
    id: 'p_test',
    type: 'now-playing' as const,
    local: {}
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((s) => ({
      ...s,
      currentSongData: {
        songId: 101,
        title: 'Master of Puppets',
        duration: 515,
        artists: [{ name: 'Metallica', artistId: 1 }],
        album: { name: 'Ride the Lightning', albumId: 2 },
        path: 'C:/Music/Metallica - Master of Puppets.flac',
        isAFavorite: true,
        isKnownSource: true,
        isBlacklisted: false,
        replayGain: {
          trackGain: -8.5,
          trackPeak: 0.98,
          albumGain: -7.2,
          albumPeak: 1.0
        }
      },
      isCurrentSongPlaying: true
    }));
  });

  describe('NowPlayingPanel', () => {
    it('renders song title, artist, format badge, and playback controls', () => {
      render(<NowPlayingPanel instance={mockInstance} api={mockApi} />);

      expect(screen.getByText('Master of Puppets')).toBeDefined();
      expect(screen.getByText('Metallica')).toBeDefined();
      expect(screen.getByText('FLAC')).toBeDefined();
    });

    it('renders empty state when no song is loaded', () => {
      store.setState((s) => ({
        ...s,
        currentSongData: {
          songId: null as unknown as number,
          title: '',
          duration: 0,
          path: '',
          isAFavorite: false,
          isKnownSource: false,
          isBlacklisted: false
        }
      }));

      render(<NowPlayingPanel instance={mockInstance} api={mockApi} />);
      expect(screen.getByText('No track selected')).toBeDefined();
    });
  });

  describe('TrackInfoPanel', () => {
    it('renders technical stream properties and ReplayGain', () => {
      render(<TrackInfoPanel instance={mockInstance} api={mockApi} />);

      expect(screen.getByText('Audio Stream & File')).toBeDefined();
      expect(screen.getByText('FLAC')).toBeDefined();
      expect(screen.getByText('ReplayGain')).toBeDefined();
      expect(screen.getByText('-8.5 dB')).toBeDefined();
    });
  });

  describe('VisualizerPanel', () => {
    it('renders canvas and changes visualizer mode calling api.setLocal', () => {
      const visualizerApi = {
        ...mockApi,
        type: 'visualizer' as const
      };
      const visualizerInstance = {
        ...mockInstance,
        type: 'visualizer' as const
      };

      const { container } = render(
        <VisualizerPanel instance={visualizerInstance} api={visualizerApi} />
      );

      expect(container.querySelector('canvas')).toBeDefined();
      const waveBtn = screen.getByRole('button', { name: 'wave' });
      fireEvent.click(waveBtn);

      expect(visualizerApi.setLocal).toHaveBeenCalledWith('mode', 'wave');
    });
  });
});
