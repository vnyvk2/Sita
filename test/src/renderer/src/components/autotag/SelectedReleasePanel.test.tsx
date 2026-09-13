// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AlbumTagPreview } from '../../../../../../src/common/metadata/types';
import { SelectedReleasePanel } from '../../../../../../src/renderer/src/components/autotag/SelectedReleasePanel';

describe('SelectedReleasePanel Component (Step 5 Artwork UX)', () => {
  afterEach(() => {
    cleanup();
  });

  const basePreview: AlbumTagPreview = {
    album: {
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2024,
      artwork: {
        primaryPath: 'https://example.com/cover.jpg',
        onlineUrls: ['https://example.com/cover.jpg']
      }
    },
    matches: [],
    overallConfidence: 0.95,
    confidenceLevel: 'Excellent',
    provider: 'musicbrainz',
    providerReleaseId: 'mb-rel-123'
  };

  it('renders MusicBrainz and Cover Art Archive options when provider is musicbrainz', () => {
    const onArtworkSourceChange = vi.fn();
    const onToggleReplaceArtwork = vi.fn();

    render(
      <SelectedReleasePanel
        preview={{ ...basePreview, provider: 'musicbrainz' }}
        artworkSource="coverartarchive"
        replaceArtwork={true}
        onArtworkSourceChange={onArtworkSourceChange}
        onToggleReplaceArtwork={onToggleReplaceArtwork}
      />
    );

    expect(screen.getByLabelText('Cover Art Archive')).toBeDefined();
    expect(screen.getByLabelText('MusicBrainz')).toBeDefined();
    expect(screen.getByLabelText('Keep Existing')).toBeDefined();
    expect(screen.queryByLabelText('Discogs')).toBeNull();

    // Clicking MusicBrainz radio invokes onArtworkSourceChange
    fireEvent.click(screen.getByLabelText('MusicBrainz'));
    expect(onArtworkSourceChange).toHaveBeenCalledWith('musicbrainz');
  });

  it('renders Discogs radio option when provider is discogs', () => {
    const onArtworkSourceChange = vi.fn();
    const onToggleReplaceArtwork = vi.fn();

    render(
      <SelectedReleasePanel
        preview={{ ...basePreview, provider: 'discogs' }}
        artworkSource="discogs"
        replaceArtwork={true}
        onArtworkSourceChange={onArtworkSourceChange}
        onToggleReplaceArtwork={onToggleReplaceArtwork}
      />
    );

    expect(screen.getByLabelText('Discogs')).toBeDefined();
    expect(screen.getByLabelText('Keep Existing')).toBeDefined();
    expect(screen.queryByLabelText('MusicBrainz')).toBeNull();
    expect(screen.queryByLabelText('Cover Art Archive')).toBeNull();

    // Clicking Keep Existing radio invokes onArtworkSourceChange with local
    fireEvent.click(screen.getByLabelText('Keep Existing'));
    expect(onArtworkSourceChange).toHaveBeenCalledWith('local');
  });

  it('displays Keep Existing in artwork placeholder when replaceArtwork is unchecked or local is selected', () => {
    render(
      <SelectedReleasePanel
        preview={basePreview}
        artworkSource="local"
        replaceArtwork={true}
        onArtworkSourceChange={vi.fn()}
        onToggleReplaceArtwork={vi.fn()}
      />
    );
    const keepExistingElements = screen.getAllByText('Keep Existing');
    expect(keepExistingElements.length).toBeGreaterThanOrEqual(2);
  });
});
