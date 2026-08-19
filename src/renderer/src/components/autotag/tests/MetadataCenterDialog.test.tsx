// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      step: 'review',
      preview: mockPreview,
      filteredMatches: mockPreview.matches,
      selectedTrackIds: new Set([101]),
      selectedFieldMap: new Map(),
      userEditedValues: new Map(),
      selectedGlobalFields: new Map(),
      globalFieldDiffs: [],
      selectedCandidateId: 'cand-1',
      searchCandidates: [],
      searchAlbum: 'SOUR',
      searchArtist: 'Olivia Rodrigo',
      searchTotalTracks: 1,
      searchExpanded: false,
      selectedSource: 'auto',
      availableProviders: [],
      artworkSource: 'musicbrainz',
      replaceArtwork: false,
      loading: false,
      loadingCandidates: false,
      error: null,
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('defaults to Compact mode and switches to Detailed mode on toggle click', () => {
    const onClose = vi.fn();

    render(
      <MetadataCenterDialog
        isOpen={true}
        localSongs={[{ id: 101, title: 'brutal (audio)' }]}
        onClose={onClose}
      />
    );

    // Should render the mode switcher buttons
    const compactBtn = screen.getByRole('button', { name: /Compact/i });
    const detailedBtn = screen.getByRole('button', { name: /Detailed/i });
    expect(compactBtn).toBeDefined();
    expect(detailedBtn).toBeDefined();

    // In Compact mode, the compact summary was: brutal (audio) is shown
    expect(screen.getByText('(was: brutal (audio))')).toBeDefined();

    // Click Detailed button to switch modes
    fireEvent.click(detailedBtn);

    // Detailed table headers should now be present
    expect(screen.getByText('CURRENT TITLE')).toBeDefined();
    expect(screen.getByText('NEW TITLE')).toBeDefined();
  }, 15000);

  it('switches viewMode via Ctrl+D keyboard shortcut', () => {
    render(
      <MetadataCenterDialog
        isOpen={true}
        localSongs={[{ id: 101, title: 'brutal (audio)' }]}
        onClose={vi.fn()}
      />
    );

    // Initially in Compact mode
    expect(screen.getByText('(was: brutal (audio))')).toBeDefined();

    // Press Ctrl+D
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });

    // Switched to Detailed mode
    expect(screen.getByText('CURRENT TITLE')).toBeDefined();

    // Press Ctrl+D again to return to Compact
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(screen.getByText('(was: brutal (audio))')).toBeDefined();
  });

  it('triggers apply on Enter key when focus is not in an active text input', () => {
    render(
      <MetadataCenterDialog
        isOpen={true}
        localSongs={[{ id: 101, title: 'brutal (audio)' }]}
        onClose={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(mockApplyPreview).toHaveBeenCalledTimes(1);
  });
});
