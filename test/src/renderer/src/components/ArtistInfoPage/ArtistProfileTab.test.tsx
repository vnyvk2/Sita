// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ArtistProfileTab from '@renderer/components/ArtistInfoPage/ArtistProfileTab';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import storage from '@renderer/utils/localStorage';
import type { ArtistBiographyEntry, ArtistOnlineProfilePayload } from '../../../../types/artist_discography';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: any) => {
        if (typeof opts === 'string') return opts;
        if (opts?.defaultValue) return opts.defaultValue;
        return key;
      }
    })
  };
});

// Mock preview audio hook
vi.mock('@renderer/hooks/usePreviewAudio', () => ({
  usePreviewAudio: () => ({
    playPreview: vi.fn(),
    isCurrentTrackPlaying: () => false
  })
}));

// Mock Img component
vi.mock('@renderer/components/Img', () => ({
  default: (props: any) => <img alt={props.alt} src={props.src} />
}));

// Mock SimilarArtistsContainer
vi.mock('@renderer/components/ArtistInfoPage/SimilarArtistsContainer', () => ({
  default: () => <div data-testid="similar-artists" />
}));

const mockBiographies: ArtistBiographyEntry[] = [
  {
    source: 'Last.fm',
    summary: 'Daft Punk were a French electronic music duo on Last.fm.',
    fullText: 'Full Last.fm text...',
    paragraphs: ['Last.fm paragraph 1', 'Last.fm paragraph 2'],
    url: 'https://www.last.fm/music/Daft+Punk/+wiki'
  },
  {
    source: 'Wikipedia',
    summary: 'Daft Punk was a legendary electronic music duo on Wikipedia.',
    fullText: 'Full Wikipedia article text...',
    paragraphs: ['Wikipedia paragraph 1', 'Wikipedia paragraph 2', 'Wikipedia paragraph 3'],
    url: 'https://en.wikipedia.org/wiki/Daft_Punk'
  }
];

const mockProfile: ArtistOnlineProfilePayload = {
  artistId: 1,
  artistName: 'Daft Punk',
  fetchedAt: Date.now(),
  bioSummary: mockBiographies[0].summary,
  bioFull: mockBiographies[0].fullText,
  bioParagraphs: mockBiographies[0].paragraphs,
  bioSource: 'Last.fm',
  bioUrl: mockBiographies[0].url,
  availableBiographies: mockBiographies,
  tags: [{ name: 'electronic', url: 'https://last.fm/tag/electronic' }],
  topTracks: [],
  similarArtists: { availableArtists: [], unAvailableArtists: [] },
  externalLinks: []
};

// Mock useQuery for artistQuery.onlineProfile
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({
      data: mockProfile,
      isLoading: false,
      isError: false,
      refetch: vi.fn()
    })
  };
});

describe('ArtistProfileTab Multi-Source Biography Selector', () => {
  const mockChangePromptMenuData = vi.fn();
  const mockArtistData: any = {
    artistId: 1,
    name: 'Daft Punk',
    songs: [],
    artworks: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage.preferences.setPreferences('preferredArtistBioSource', undefined as any);
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithContext = (ui: React.ReactElement) => {
    return render(
      <AppUpdateContext.Provider
        value={{
          changePromptMenuData: mockChangePromptMenuData,
          createQueue: vi.fn(),
          updateQueueData: vi.fn()
        } as any}
      >
        {ui}
      </AppUpdateContext.Provider>
    );
  };

  it('renders interactive pill switcher when multiple biographies exist', () => {
    renderWithContext(
      <ArtistProfileTab
        artistId={1}
        artistName="Daft Punk"
        artistData={mockArtistData}
      />
    );

    // Both source buttons are rendered
    expect(screen.getByRole('button', { name: /Last\.fm/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Wikipedia/i })).toBeDefined();

    // Summary matches initial active bio (Last.fm)
    expect(
      screen.getByText('Daft Punk were a French electronic music duo on Last.fm.')
    ).toBeDefined();
  });

  it('switches bio summary and persists to preferences when user clicks Wikipedia pill', () => {
    const setPreferencesSpy = vi.spyOn(storage.preferences, 'setPreferences');

    renderWithContext(
      <ArtistProfileTab
        artistId={1}
        artistName="Daft Punk"
        artistData={mockArtistData}
      />
    );

    const wikiPill = screen.getByRole('button', { name: /Wikipedia/i });
    fireEvent.click(wikiPill);

    // Summary updates in place
    expect(
      screen.getByText('Daft Punk was a legendary electronic music duo on Wikipedia.')
    ).toBeDefined();

    // Persisted to preferences
    expect(setPreferencesSpy).toHaveBeenCalledWith('preferredArtistBioSource', 'Wikipedia');
  });

  it('opens ArtistBioModal with active bio and available biographies when Read Full Biography is clicked', () => {
    renderWithContext(
      <ArtistProfileTab
        artistId={1}
        artistName="Daft Punk"
        artistData={mockArtistData}
      />
    );

    const readMoreBtn = screen.getByRole('button', { name: /Read Full Biography/i });
    fireEvent.click(readMoreBtn);

    expect(mockChangePromptMenuData).toHaveBeenCalledTimes(1);
    expect(mockChangePromptMenuData).toHaveBeenCalledWith(
      true,
      expect.anything(),
      'artist-bio-modal'
    );
  });
});
