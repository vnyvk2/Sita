// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumTagPreview } from '../../../../common/metadata/types';
import { useAlbumAutoTag } from '../useAlbumAutoTag';

const previewFixture: AlbumTagPreview = {
  album: { title: 'New LP', artist: 'Some Artist', year: 2024 } as any,
  overallConfidence: 0.95,
  confidenceLevel: 'Excellent',
  provider: 'musicbrainz',
  providerReleaseId: 'rel-1',
  warnings: [],
  matches: [
    {
      localSongId: 1,
      songPath: '/tmp/a.mp3',
      oldTitle: 'Old Title A',
      oldArtist: 'Some Artist',
      oldAlbum: 'Old LP',
      oldYear: 2024,
      confidence: 0.95,
      confidenceLevel: 'Excellent',
      why: 'Title Match',
      reasons: [],
      applyTrack: true,
      hasWarnings: false,
      warningCount: 0,
      fieldDiffs: [
        {
          fieldId: 'title',
          fieldName: 'Title',
          oldValue: 'Old Title A',
          suggestedValue: 'New Title A',
          userValue: 'New Title A',
          status: 'changed',
          applyField: true
        },
        {
          fieldId: 'album',
          fieldName: 'Album',
          oldValue: 'Old LP',
          suggestedValue: 'New LP',
          userValue: 'New LP',
          status: 'changed',
          applyField: true
        }
      ]
    },
    {
      localSongId: 2,
      songPath: '/tmp/b.mp3',
      oldTitle: 'Old Title B',
      oldArtist: 'Some Artist',
      oldAlbum: 'Old LP',
      oldYear: 2024,
      confidence: 0.96,
      confidenceLevel: 'Excellent',
      why: 'Title Match',
      reasons: [],
      applyTrack: true,
      hasWarnings: false,
      warningCount: 0,
      fieldDiffs: [
        {
          fieldId: 'title',
          fieldName: 'Title',
          oldValue: 'Old Title B',
          suggestedValue: 'New Title B',
          userValue: 'New Title B',
          status: 'changed',
          applyField: true
        },
        {
          fieldId: 'album',
          fieldName: 'Album',
          oldValue: 'Old LP',
          suggestedValue: 'New LP',
          userValue: 'New LP',
          status: 'changed',
          applyField: true
        }
      ]
    }
  ]
} as unknown as AlbumTagPreview;

const wrapper = () => {
  const client = new QueryClient();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('DEF-TAG-07: change count is independent of the table view filter', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      api: {
        metadataAutoTag: {
          searchAlbums: vi.fn().mockResolvedValue([]),
          buildPreview: vi.fn().mockResolvedValue(previewFixture),
          getAvailableSearchProviders: vi.fn().mockResolvedValue([]),
          getMetadataPreferences: vi.fn().mockResolvedValue(null)
        }
      }
    };
  });

  it('keeps totalChanges stable when switching to an empty filter tab', async () => {
    const { result } = renderHook(() => useAlbumAutoTag('op-filter-1', []), {
      wrapper: wrapper()
    });

    await act(async () => {
      await result.current.actions.buildPreview(
        [
          { songId: 1, path: '/tmp/a.mp3' },
          { songId: 2, path: '/tmp/b.mp3' }
        ],
        'rel-1',
        'musicbrainz'
      );
    });

    const before = result.current.state.totalChanges;
    expect(before).toBeGreaterThan(0);

    act(() => {
      result.current.actions.setFilter('warnings');
    });

    // No match has warnings, so the table is empty - the count must not collapse.
    expect(result.current.state.filteredMatches).toHaveLength(0);
    expect(result.current.state.totalChanges).toBe(before);
  });
});
