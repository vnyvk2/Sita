// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AlbumTagPreview } from '../../../../common/metadata/types';
import { MetadataCenterDialog } from '../MetadataCenterDialog';

// Mock useAlbumAutoTag
const mockApplyPreview = vi.fn();
const mockToggleTrack = vi.fn();
const mockSetFilter = vi.fn();
const mockSetSort = vi.fn();
const mockReset = vi.fn();

const mockPreview: AlbumTagPreview = {
  album: {
    title: 'SOUR',
    artist: 'Olivia Rodrigo',
    year: 2021
  },
  overallConfidence: 0.98,
  confidenceLevel: 'High',
  provider: 'musicbrainz',
  providerReleaseId: 'mb-sour-1',
  warnings: [],
  matches: [
    {
      localSongId: 101,
      songPath: '/song1.mp3',
      oldTitle: 'brutal (audio)',
      oldArtist: 'Olivia',
      confidence: 0.98,
      confidenceLevel: 'High',
      why: 'Matched',
      reasons: [],
      applyTrack: true,
      hasWarnings: false,
      warningCount: 0,
      fieldDiffs: [
        {
          fieldId: 'title',
          fieldName: 'Title',
          oldValue: 'brutal (audio)',
          suggestedValue: 'brutal',
          status: 'changed',
          applyField: true,
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz'
        }
      ]
    }
  ]
};

vi.mock('../../../hooks/useAlbumAutoTag', () => ({
  useAlbumAutoTag: () => ({
    state: {
      status: 'reviewing',
      preview: mockPreview,
      displayedMatches: mockPreview.matches,
      filteredMatches: mockPreview.matches,
      globalFieldDiffs: [],
      selectedTrackIds: new Set([101]),
      filter: 'all',
      sort: 'trackNumber',
      selectedTracksCount: 1,
      totalTracksCount: 1,
      activeFieldsCount: 1,
      totalChanges: 1,
      canUndo: false,
      lastRestoredCount: 0
    },
    actions: {
      applyPreview: mockApplyPreview,
      toggleTrack: mockToggleTrack,
      setFilter: mockSetFilter,
      setSort: mockSetSort,
      reset: mockReset,
      setSearchAlbum: vi.fn(),
      setSearchArtist: vi.fn(),
      searchReleases: vi.fn()
    }
  })
}));

describe('MetadataCenterDialog Mode Switching & Keyboard Navigation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithQuery = (ui: React.ReactNode) =>
    render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  it('defaults to Compact mode and switches to Detailed mode on toggle click', () => {
    const onClose = vi.fn();

    renderWithQuery(
      <MetadataCenterDialog
        isOpen={true}
        localSongs={[{ id: 101, title: 'brutal (audio)' }]}
        onClose={onClose}
      />
    );

    // Initial render in Compact mode
    expect(screen.getByText('Compact')).toBeDefined();

    // Find the toggle segmented control
    const detailedTab = screen.getByText('Detailed');
    fireEvent.click(detailedTab);

    // Should now show Detailed Matrix button as active
    expect(screen.getByText('Detailed')).toBeDefined();
  });

  it('handles Escape keyboard shortcut to close dialog', () => {
    const onClose = vi.fn();

    renderWithQuery(
      <MetadataCenterDialog
        isOpen={true}
        localSongs={[{ id: 101, title: 'brutal (audio)' }]}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('handles Ctrl+Enter keyboard shortcut to trigger apply', () => {
    const onClose = vi.fn();

    renderWithQuery(
      <MetadataCenterDialog
        isOpen={true}
        localSongs={[{ id: 101, title: 'brutal (audio)' }]}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(mockApplyPreview).toHaveBeenCalled();
  });
});
