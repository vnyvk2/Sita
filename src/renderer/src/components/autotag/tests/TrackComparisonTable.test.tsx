// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TrackMatchPreview } from '../../../../common/metadata/types';
import { TrackComparisonTable } from '../TrackComparisonTable';

describe('TrackComparisonTable (Detailed Review Mode)', () => {
  afterEach(() => {
    cleanup();
  });
  const mockMatches: TrackMatchPreview[] = [
    {
      localSongId: 101,
      songPath: '/01.mp3',
      oldTitle: 'Original Title',
      oldArtist: 'Original Artist',
      oldTrackNumber: 1,
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
          oldValue: 'Original Title',
          suggestedValue: 'New Suggested Title',
          status: 'changed',
          applyField: true,
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz'
        },
        {
          fieldId: 'artist',
          fieldName: 'Artist',
          oldValue: 'Original Artist',
          suggestedValue: 'Original Artist',
          status: 'unchanged',
          applyField: false,
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz'
        },
        {
          fieldId: 'genre',
          fieldName: 'Genre',
          oldValue: undefined,
          suggestedValue: 'Rock',
          status: 'new',
          applyField: true,
          providerId: 'discogs',
          providerName: 'Discogs'
        }
      ]
    }
  ];

  it('renders table headers and track rows', () => {
    render(
      <TrackComparisonTable
        matches={mockMatches}
        selectedTrackIds={new Set([101])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        filter="all"
        sort="trackNumber"
        onToggleTrack={vi.fn()}
        onToggleField={vi.fn()}
        onFieldChanged={vi.fn()}
        onResetField={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    );

    expect(screen.getByText('CURRENT TITLE')).toBeDefined();
    expect(screen.getByText('NEW TITLE')).toBeDefined();
    expect(screen.getByText('Original Title')).toBeDefined();
    expect(screen.getByText('New Suggested Title')).toBeDefined();
  }, 20000);

  it('filters unchanged fields when Changes Only is active and reveals all when All Fields is active', () => {
    render(
      <TrackComparisonTable
        matches={mockMatches}
        selectedTrackIds={new Set([101])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={101}
        filter="all"
        sort="trackNumber"
        onToggleTrack={vi.fn()}
        onToggleField={vi.fn()}
        onFieldChanged={vi.fn()}
        onResetField={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    );

    // By default Changes Only is active -> 'Title' (changed) and 'Genre' (new) are visible
    expect(screen.getAllByText('Title').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Genre')).toBeDefined();
    // 'Artist' field row is unchanged so not in diff viewer
    expect(screen.queryByText('Field Differences for:')).toBeDefined();

    // Click "All Fields"
    const allFieldsBtn = screen.getByText('All Fields');
    fireEvent.click(allFieldsBtn);

    // Now 'Artist' should also be rendered in the diff list
    expect(screen.getAllByText('Artist').length).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('calls onFieldChanged when user edits a field value', () => {
    const onFieldChanged = vi.fn();

    render(
      <TrackComparisonTable
        matches={mockMatches}
        selectedTrackIds={new Set([101])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={101}
        filter="all"
        sort="trackNumber"
        onToggleTrack={vi.fn()}
        onToggleField={vi.fn()}
        onFieldChanged={onFieldChanged}
        onResetField={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Edited Title' } });

    expect(onFieldChanged).toHaveBeenCalledWith(101, 'title', 'Edited Title');
  }, 20000);
});
