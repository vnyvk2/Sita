// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { MetadataDiffViewer } from '../../../../../../src/renderer/src/components/autotag/MetadataDiffViewer';
import type { TrackMatchPreview } from '../../../../../../src/common/metadata/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'common.addedToGenres': 'Added to Genres'
      };
      return translations[key] || fallback || key;
    }
  })
}));

describe('MetadataDiffViewer Component', () => {
  afterEach(() => {
    cleanup();
  });

  const mockTrack: TrackMatchPreview = {
    localSongId: 101,
    oldTitle: 'Original Song Title',
    newTitle: 'Suggested Song Title',
    suggestedMetadata: {
      title: 'Suggested Song Title',
      artist: 'Suggested Artist',
      album: 'Suggested Album',
      genre: 'Rock',
      style: 'Post-Punk, Shoegaze'
    },
    confidenceScore: 0.9,
    fieldDiffs: [
      {
        fieldId: 'title',
        fieldName: 'Title',
        oldValue: 'Original Song Title',
        suggestedValue: 'Suggested Song Title',
        status: 'changed',
        applyField: true
      },
      {
        fieldId: 'style',
        fieldName: 'Style',
        oldValue: undefined,
        suggestedValue: 'Post-Punk, Shoegaze',
        status: 'new',
        applyField: true
      }
    ]
  };

  it('renders track differences and displays localized "Added to Genres" subtext for Style field', () => {
    const { container } = render(
      <MetadataDiffViewer
        track={mockTrack}
        selectedFieldMap={new Map()}
        userEditedValues={new Map()}
        onFieldChanged={vi.fn()}
        onToggleField={vi.fn()}
        onResetField={vi.fn()}
      />
    );

    expect(screen.getByText('Title')).toBeDefined();
    expect(screen.getByText('Style')).toBeDefined();
    expect(container.textContent).toContain('Added to Genres');
  });
});
