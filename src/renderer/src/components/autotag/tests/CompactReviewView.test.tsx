// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TrackMatchPreview } from '../../../../common/metadata/types';
import { CompactReviewView } from '../CompactReviewView';

describe('CompactReviewView Component', () => {
  afterEach(() => {
    cleanup();
  });
  const mockMatches: TrackMatchPreview[] = [
    {
      localSongId: 1,
      songPath: '/path/01-brutal.mp3',
      oldTitle: 'brutal (audio)',
      oldArtist: 'Olivia',
      oldTrackNumber: 1,
      confidence: 0.98,
      confidenceLevel: 'High',
      why: 'Strong match',
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
        },
        {
          fieldId: 'artist',
          fieldName: 'Artist',
          oldValue: 'Olivia',
          suggestedValue: 'Olivia Rodrigo',
          status: 'changed',
          applyField: true,
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz'
        },
        {
          fieldId: 'genre',
          fieldName: 'Genre',
          oldValue: undefined,
          suggestedValue: 'Pop, Alternative Rock',
          status: 'new',
          applyField: true,
          providerId: 'discogs',
          providerName: 'Discogs'
        },
        {
          fieldId: 'album',
          fieldName: 'Album',
          oldValue: 'SOUR',
          suggestedValue: 'SOUR',
          status: 'unchanged',
          applyField: false
        }
      ]
    },
    {
      localSongId: 2,
      songPath: '/path/02-traitor.mp3',
      oldTitle: 'traitor',
      oldArtist: 'Olivia Rodrigo',
      oldTrackNumber: 2,
      confidence: 0.99,
      confidenceLevel: 'High',
      why: 'Exact match',
      reasons: [],
      applyTrack: true,
      hasWarnings: false,
      warningCount: 0,
      fieldDiffs: [
        {
          fieldId: 'title',
          fieldName: 'Title',
          oldValue: 'traitor',
          suggestedValue: 'traitor',
          status: 'unchanged',
          applyField: false
        }
      ]
    }
  ];

  it('renders track summary rows with change counts and confidence badges', () => {
    const onToggleTrack = vi.fn();
    const onToggleExpand = vi.fn();
    const onOpenDetailed = vi.fn();

    render(
      <CompactReviewView
        matches={mockMatches}
        selectedTrackIds={new Set([1, 2])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={null}
        onToggleTrack={onToggleTrack}
        onToggleExpand={onToggleExpand}
        onOpenDetailed={onOpenDetailed}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    // Track 1 should show new title 'brutal' and was: brutal (audio)
    expect(screen.getByText('brutal')).toBeDefined();
    expect(screen.getByText('(was: brutal (audio))')).toBeDefined();
    // Track 1 has 3 changed/new fields (title, artist, genre)
    expect(screen.getByText('3 changes')).toBeDefined();

    // Track 2 has 0 changes
    expect(screen.getByText('traitor')).toBeDefined();
    expect(screen.getByText('No changes')).toBeDefined();
  });

  it('renders only changed/new fields in expanded drawer and hides unchanged fields', () => {
    const onToggleTrack = vi.fn();
    const onToggleExpand = vi.fn();
    const onOpenDetailed = vi.fn();

    render(
      <CompactReviewView
        matches={mockMatches}
        selectedTrackIds={new Set([1, 2])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={1} // Track 1 expanded
        onToggleTrack={onToggleTrack}
        onToggleExpand={onToggleExpand}
        onOpenDetailed={onOpenDetailed}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    // Changed/new fields are rendered
    expect(screen.getByText('Modified Fields for:')).toBeDefined();
    expect(screen.getByText('Pop, Alternative Rock')).toBeDefined();
    expect(screen.getByText('Discogs')).toBeDefined();
    expect(screen.getAllByText('MusicBrainz').length).toBeGreaterThanOrEqual(1);

    // Unchanged field 'Album' should NOT be rendered in compact accordion
    expect(screen.queryByText('Album')).toBeNull();
  });

  it('preserves user edited values in expanded drawer', () => {
    const userEditedValues = new Map<string, string | number>([
      ['1::title', 'brutal (custom edit)']
    ]);

    render(
      <CompactReviewView
        matches={mockMatches}
        selectedTrackIds={new Set([1])}
        selectedFieldMap={new Map()}
        userEditedValues={userEditedValues}
        expandedTrackId={1}
        onToggleTrack={vi.fn()}
        onToggleExpand={vi.fn()}
        onOpenDetailed={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    expect(screen.getByText('brutal (custom edit)')).toBeDefined();
  });

  it('isolates checkbox click from row expansion', () => {
    const onToggleTrack = vi.fn();
    const onToggleExpand = vi.fn();

    render(
      <CompactReviewView
        matches={mockMatches}
        selectedTrackIds={new Set([1])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={null}
        onToggleTrack={onToggleTrack}
        onToggleExpand={onToggleExpand}
        onOpenDetailed={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onToggleTrack).toHaveBeenCalledWith(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('triggers onOpenDetailed with track ID and prevents event bubbling', () => {
    const onToggleExpand = vi.fn();
    const onOpenDetailed = vi.fn();

    render(
      <CompactReviewView
        matches={mockMatches}
        selectedTrackIds={new Set([1])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={1}
        onToggleTrack={vi.fn()}
        onToggleExpand={onToggleExpand}
        onOpenDetailed={onOpenDetailed}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    const openDetailedBtn = screen.getByRole('button', { name: /Open in Detailed Mode/i });
    fireEvent.click(openDetailedBtn);

    expect(onOpenDetailed).toHaveBeenCalledWith(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});
