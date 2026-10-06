import { store } from '@renderer/store/store';
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import FullScreenAudioBadge from '../components/FullScreenAudioBadge';

describe('FullScreenAudioBadge', () => {
  const initialSongData = store.state.currentSongData;

  afterEach(() => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: initialSongData
    }));
  });

  it('renders null when no song data is present', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 0,
        title: '',
        duration: 0,
        isAFavorite: false,
        isArtworkAvailable: false,
        path: '',
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '',
          optimizedArtworkPath: '',
          isDefaultArtwork: true
        }
      }
    }));

    const { container } = render(<FullScreenAudioBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Lossless pill and sample rate for FLAC audio', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 101,
        title: 'Lossless Track',
        duration: 240,
        isAFavorite: false,
        isArtworkAvailable: true,
        path: '/music/track.flac',
        sampleRate: 44100,
        bitrate: 1411200,
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '/art.jpg',
          optimizedArtworkPath: '/art.jpg',
          isDefaultArtwork: false
        }
      }
    }));

    render(<FullScreenAudioBadge />);
    expect(screen.getByTestId('fullscreen-audio-badge')).toBeDefined();
    expect(screen.getByText('Lossless')).toBeDefined();
    expect(screen.getByText('FLAC')).toBeDefined();
    expect(screen.getByText('44.1 kHz')).toBeDefined();
  });

  it('renders Hi-Res Lossless badge for sample rate > 48kHz', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 102,
        title: 'Hi-Res Master',
        duration: 300,
        isAFavorite: false,
        isArtworkAvailable: true,
        path: '/music/master.flac',
        sampleRate: 96000,
        bitrate: 2800000,
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '/art.jpg',
          optimizedArtworkPath: '/art.jpg',
          isDefaultArtwork: false
        }
      }
    }));

    render(<FullScreenAudioBadge />);
    expect(screen.getByText('Hi-Res Lossless')).toBeDefined();
    expect(screen.getByText('96 kHz')).toBeDefined();
  });

  it('renders MP3 format and kbps bitrate for lossy files', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 103,
        title: 'MP3 Song',
        duration: 180,
        isAFavorite: false,
        isArtworkAvailable: true,
        path: '/music/song.mp3',
        sampleRate: 44100,
        bitrate: 320000,
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '/art.jpg',
          optimizedArtworkPath: '/art.jpg',
          isDefaultArtwork: false
        }
      }
    }));

    render(<FullScreenAudioBadge />);
    expect(screen.getByText('MP3')).toBeDefined();
    expect(screen.getByText('320 kbps')).toBeDefined();
    expect(screen.queryByText('Lossless')).toBeNull();
  });

  it('does not treat dotted directories as extensions', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 104,
        title: 'Extensionless',
        duration: 180,
        isAFavorite: false,
        isArtworkAvailable: false,
        path: '/music.v2/song',
        sampleRate: 44100,
        bitrate: 320000,
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '',
          optimizedArtworkPath: '',
          isDefaultArtwork: true
        }
      }
    }));

    render(<FullScreenAudioBadge />);
    // Must not render a garbage "V2/SONG" pill
    expect(screen.queryByText('V2/SONG')).toBeNull();
  });

  it('strips query strings from stream URLs before parsing extension', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 105,
        title: 'Stream',
        duration: 180,
        isAFavorite: false,
        isArtworkAvailable: false,
        path: 'http://stream/song.mp3?token=123',
        addedDate: 0,
        isBlacklisted: false,
        artworkPaths: {
          artworkPath: '',
          optimizedArtworkPath: '',
          isDefaultArtwork: true
        }
      }
    }));

    render(<FullScreenAudioBadge />);
    expect(screen.getByText('MP3')).toBeDefined();
    expect(screen.queryByText('MP3?TOKEN=123')).toBeNull();
  });
});
