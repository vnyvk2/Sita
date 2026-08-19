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
    expect(screen.getAllByText('Pop, Alternative Rock').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Discogs')).toBeDefined();
    expect(screen.getAllByText('MusicBrainz').length).toBeGreaterThanOrEqual(1);

    // Unchanged field 'Album' should NOT be rendered in compact accordion
    expect(screen.queryByText('Album')).toBeNull();
  });

  it('displays inline track number diff, title diff, artist diff, and secondary micro-chips on collapsed row', () => {
    const trackWithTrackDiff: TrackMatchPreview[] = [
      {
        localSongId: 10,
        songPath: '/path/10.mp3',
        oldTitle: 'The Next Episode [Explicit]',
        oldArtist: 'Dr. Dre, Snoop Dogg',
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
            oldValue: 'The Next Episode [Explicit]',
            suggestedValue: 'The Next Episode',
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'artist',
            fieldName: 'Artist',
            oldValue: 'Dr. Dre, Snoop Dogg',
            suggestedValue: 'Dr. Dre',
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'trackNumber',
            fieldName: 'Track Number',
            oldValue: 1,
            suggestedValue: 11,
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'genre',
            fieldName: 'Genre',
            oldValue: undefined,
            suggestedValue: 'Hip Hop',
            status: 'new',
            applyField: true
          }
        ]
      }
    ];

    render(
      <CompactReviewView
        matches={trackWithTrackDiff}
        selectedTrackIds={new Set([10])}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        expandedTrackId={null} // Collapsed
        onToggleTrack={vi.fn()}
        onToggleExpand={vi.fn()}
        onOpenDetailed={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    // Track number diff 01 → 11 is visible on collapsed row
    expect(screen.getByText('01')).toBeDefined();
    expect(screen.getByText('11')).toBeDefined();

    // New title is shown with (was: ...) subtext
    expect(screen.getByText('The Next Episode')).toBeDefined();
    expect(screen.getByText('(was: The Next Episode [Explicit])')).toBeDefined();

    // New artist is shown with (was: ...) subtext
    expect(screen.getByText('Dr. Dre')).toBeDefined();
    expect(screen.getByText('(was: Dr. Dre, Snoop Dogg)')).toBeDefined();

    // Secondary micro-chip for Genre is visible without expanding
    expect(screen.getByText('Hip Hop')).toBeDefined();
  });

  it('reactively reverts collapsed row display to original values and hides chips when fields are deselected, and never shows MBID chip', () => {
    const trackWithDiffs: TrackMatchPreview[] = [
      {
        localSongId: 10,
        songPath: '/path/10.mp3',
        oldTitle: 'The Next Episode [Explicit]',
        oldArtist: 'Dr. Dre, Snoop Dogg',
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
            oldValue: 'The Next Episode [Explicit]',
            suggestedValue: 'The Next Episode',
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'artist',
            fieldName: 'Artist',
            oldValue: 'Dr. Dre, Snoop Dogg',
            suggestedValue: 'Dr. Dre',
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'trackNumber',
            fieldName: 'Track Number',
            oldValue: 1,
            suggestedValue: 11,
            status: 'changed',
            applyField: true
          },
          {
            fieldId: 'genre',
            fieldName: 'Genre',
            oldValue: undefined,
            suggestedValue: 'Hip Hop',
            status: 'new',
            applyField: true
          },
          {
            fieldId: 'musicBrainzRecordingId',
            fieldName: 'MusicBrainz Recording ID',
            oldValue: undefined,
            suggestedValue: 'e9e419f3-a36d-46e0-83d0-b97bea8957eb',
            status: 'new',
            applyField: true
          }
        ]
      }
    ];

    // Artist and trackNumber are deselected
    const selectedFieldMap = new Map<string, boolean>([
      ['10::artist', false],
      ['10::trackNumber', false]
    ]);

    render(
      <CompactReviewView
        matches={trackWithDiffs}
        selectedTrackIds={new Set([10])}
        selectedFieldMap={selectedFieldMap}
        userEditedValues={new Map()}
        expandedTrackId={null} // Collapsed
        onToggleTrack={vi.fn()}
        onToggleExpand={vi.fn()}
        onOpenDetailed={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
      />
    );

    // Track number shows original '01' without arrow diff
    expect(screen.getByText('01')).toBeDefined();
    expect(screen.queryByText('11')).toBeNull();

    // Artist shows original 'Dr. Dre, Snoop Dogg' without '(was: ...)' subtext
    expect(screen.getByText('Dr. Dre, Snoop Dogg')).toBeDefined();
    expect(screen.queryByText('(was: Dr. Dre, Snoop Dogg)')).toBeNull();

    // Title (which is still selected) shows 'The Next Episode' and '(was: ...)' subtext
    expect(screen.getByText('The Next Episode')).toBeDefined();
    expect(screen.getByText('(was: The Next Episode [Explicit])')).toBeDefined();

    // Secondary micro-chip for Genre is visible
    expect(screen.getByText('Hip Hop')).toBeDefined();

    // MusicBrainz Recording ID hash is NEVER rendered on the top row
    expect(screen.queryByText(/e9e419f3-a36d/)).toBeNull();
  });

  it('allows selecting and deselecting individual fields in the expanded drawer', () => {
    const onToggleField = vi.fn();
    const selectedFieldMap = new Map<string, boolean>([
      ['1::artist', false] // Artist field deselected
    ]);

    render(
      <CompactReviewView
        matches={mockMatches}
        selectedTrackIds={new Set([1, 2])}
        selectedFieldMap={selectedFieldMap}
        userEditedValues={new Map()}
        expandedTrackId={1} // Track 1 expanded
        onToggleTrack={vi.fn()}
        onToggleExpand={vi.fn()}
        onOpenDetailed={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectChanged={vi.fn()}
        onClearSelections={vi.fn()}
        onToggleField={onToggleField}
      />
    );

    // Should render field checkboxes in the expanded drawer
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);

    // Clicking a field checkbox calls onToggleField with (localSongId, fieldId)
    fireEvent.click(checkboxes[2]);
    expect(onToggleField).toHaveBeenCalled();
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

  it('renders missing tracks with disabled checkbox, Missing badge, and Not in library subtext', () => {
    const onToggleTrack = vi.fn();
    const onToggleExpand = vi.fn();

    const matchesWithMissing: TrackMatchPreview[] = [
      {
        localSongId: -1,
        songPath: '',
        oldTitle: '',
        oldArtist: '',
        oldTrackNumber: 1,
        confidence: 0,
        confidenceLevel: 'Low',
        why: 'Not in local library',
        reasons: ['missing_locally'],
        applyTrack: false,
        hasWarnings: false,
        warningCount: 0,
        isMissingLocally: true,
        fieldDiffs: [
          {
            fieldId: 'title',
            fieldName: 'Title',
            suggestedValue: 'Lolo (Intro)',
            status: 'new',
            applyField: false
          },
          {
            fieldId: 'artist',
            fieldName: 'Artist',
            suggestedValue: 'Dr. Dre',
            status: 'new',
            applyField: false
          },
          {
            fieldId: 'trackNumber',
            fieldName: 'Track Number',
            suggestedValue: 1,
            status: 'new',
            applyField: false
          }
        ]
      },
      ...mockMatches
    ];

    render(
      <CompactReviewView
        matches={matchesWithMissing}
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

    expect(screen.getByText('Lolo (Intro)')).toBeDefined();
    expect(screen.getAllByText('Not in library').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Missing')).toBeDefined();

    // The missing track's checkbox should be disabled
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveProperty('disabled', true);

    // Clicking row of missing track should NOT toggle expand
    fireEvent.click(screen.getByText('Lolo (Intro)'));
    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});
