// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ArtistBioModal from '@renderer/components/ArtistInfoPage/ArtistBioModal';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import type { ArtistBiographyEntry } from '../../../../types/artist_discography';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: any) => {
        if (typeof opts === 'string') return opts;
        if (opts?.defaultValue) return opts.defaultValue;
        if (key === 'biography.readFullArticleOnSource') return `Read on ${opts?.source}`;
        return key;
      }
    })
  };
});

describe('ArtistBioModal Multi-Source Switching', () => {
  const mockChangePromptMenuData = vi.fn();
  const mockOpenInBrowser = vi.fn();

  const mockBiographies: ArtistBiographyEntry[] = [
    {
      source: 'Last.fm',
      summary: 'Daft Punk were a French electronic music duo.',
      fullText: 'Full Last.fm text...',
      paragraphs: [
        'Daft Punk were a French electronic music duo formed in 1993 in Paris.',
        'They achieved significant success following their debut album Homework.'
      ],
      url: 'https://www.last.fm/music/Daft+Punk/+wiki'
    },
    {
      source: 'Wikipedia',
      summary: 'Daft Punk were a French electronic music duo formed by Guy-Manuel and Thomas.',
      fullText: 'Full Wikipedia article text...',
      paragraphs: [
        'Daft Punk was a French electronic music duo formed in 1993.',
        'Regarded as one of the most influential acts in dance music history.',
        'In February 2021, the duo announced their disbandment.'
      ],
      url: 'https://en.wikipedia.org/wiki/Daft_Punk'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).api = {
      settingsHelpers: {
        openInBrowser: mockOpenInBrowser
      }
    };
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithContext = (ui: React.ReactElement) => {
    return render(
      <AppUpdateContext.Provider
        value={{ changePromptMenuData: mockChangePromptMenuData } as any}
      >
        {ui}
      </AppUpdateContext.Provider>
    );
  };

  it('renders multi-source tabs with paragraph counts when multiple sources are available', () => {
    renderWithContext(
      <ArtistBioModal
        artistName="Daft Punk"
        bioParagraphs={mockBiographies[0].paragraphs}
        bioSource="Last.fm"
        bioUrl={mockBiographies[0].url}
        availableBiographies={mockBiographies}
        initialSource="Last.fm"
      />
    );

    expect(screen.getByText('Last.fm')).toBeDefined();
    expect(screen.getByText('(2)')).toBeDefined();
    expect(screen.getByText('Wikipedia')).toBeDefined();
    expect(screen.getByText('(3)')).toBeDefined();

    // Initially displays Last.fm paragraphs
    expect(
      screen.getByText('Daft Punk were a French electronic music duo formed in 1993 in Paris.')
    ).toBeDefined();

    // Source link points to Last.fm
    const link = screen.getByText('Read on Last.fm');
    expect(link).toBeDefined();
  });

  it('switches displayed paragraphs and external link when user clicks Wikipedia tab', () => {
    const handleSourceChange = vi.fn();

    renderWithContext(
      <ArtistBioModal
        artistName="Daft Punk"
        bioParagraphs={mockBiographies[0].paragraphs}
        bioSource="Last.fm"
        bioUrl={mockBiographies[0].url}
        availableBiographies={mockBiographies}
        initialSource="Last.fm"
        onSourceChange={handleSourceChange}
      />
    );

    // Click Wikipedia tab
    const wikiBtn = screen.getByRole('button', { name: /Wikipedia/i });
    fireEvent.click(wikiBtn);

    expect(handleSourceChange).toHaveBeenCalledWith('Wikipedia');

    // Should now display Wikipedia paragraphs
    expect(
      screen.getByText('Regarded as one of the most influential acts in dance music history.')
    ).toBeDefined();
    expect(
      screen.getByText('In February 2021, the duo announced their disbandment.')
    ).toBeDefined();

    // Link updates to Wikipedia
    expect(screen.getByText('Read on Wikipedia')).toBeDefined();
  });

  it('opens external link in browser via window.api when clicked', () => {
    renderWithContext(
      <ArtistBioModal
        artistName="Daft Punk"
        bioParagraphs={mockBiographies[0].paragraphs}
        bioSource="Last.fm"
        bioUrl={mockBiographies[0].url}
        availableBiographies={mockBiographies}
        initialSource="Last.fm"
      />
    );

    const linkBtn = screen.getByText('Read on Last.fm');
    fireEvent.click(linkBtn);

    expect(mockOpenInBrowser).toHaveBeenCalledWith('https://www.last.fm/music/Daft+Punk/+wiki');
  });

  it('renders single badge without tabs when only one source exists', () => {
    const singleBio = [mockBiographies[1]]; // Wikipedia only

    renderWithContext(
      <ArtistBioModal
        artistName="Daft Punk"
        bioParagraphs={singleBio[0].paragraphs}
        bioSource="Wikipedia"
        bioUrl={singleBio[0].url}
        availableBiographies={singleBio}
      />
    );

    // Wikipedia badge is present
    expect(screen.getByText('Wikipedia')).toBeDefined();
    // Count indicator not rendered for single badge
    expect(screen.queryByText('(3)')).toBeNull();

    expect(
      screen.getByText('Daft Punk was a French electronic music duo formed in 1993.')
    ).toBeDefined();
    expect(screen.getByText('Read on Wikipedia')).toBeDefined();
  });
});
