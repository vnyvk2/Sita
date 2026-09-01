// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BatchSongTagsEditor from './BatchSongTagsEditor';
import {
  buildCanonicalSongTags,
  formatStringList,
  formatTrackNumber,
  isFieldDirty,
  parseStringList,
  validateField
} from './utils';

// Mock Router & i18n
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.defaultValue as string) ?? key
  })
}));

// Mock react-virtuoso to render rows directly in jsdom
vi.mock('react-virtuoso', () => ({
  TableVirtuoso: ({ totalCount, fixedHeaderContent, itemContent }: any) => {
    return (
      <table>
        <thead>{fixedHeaderContent && fixedHeaderContent()}</thead>
        <tbody>
          {Array.from({ length: totalCount }).map((_, index) => (
            <tr key={index} data-index={index}>
              {itemContent(index)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}));

describe('BatchSongTagsEditor — Utilities', () => {
  it('parses comma and semicolon separated strings correctly', () => {
    expect(parseStringList('Artist 1, Artist 2; Artist 3')).toEqual([
      'Artist 1',
      'Artist 2',
      'Artist 3'
    ]);
    expect(parseStringList('')).toEqual([]);
    expect(parseStringList('Single Artist')).toEqual(['Single Artist']);
  });

  it('formats string lists for display', () => {
    expect(formatStringList(['Rock', 'Pop', 'Indie'])).toBe('Rock, Pop, Indie');
    expect(formatStringList([])).toBe('');
    expect(formatStringList(undefined)).toBe('');
  });

  it('formats track numbers with proper zero-padding and preserves integer storage', () => {
    const rawTrackNum = 1;
    const maxTracks = 12;
    const formattedDisplay = formatTrackNumber(rawTrackNum, maxTracks);

    expect(rawTrackNum).toBe(1); // Storage representation is integer 1
    expect(formattedDisplay).toBe('01'); // Presentation is zero-padded "01"
    expect(formatTrackNumber(9, 12)).toBe('09');
    expect(formatTrackNumber(10, 12)).toBe('10');
    expect(formatTrackNumber(5, 5)).toBe('5');
    expect(formatTrackNumber(undefined)).toBe('');
  });

  it('validates fields with semantic constraints (>= 1 for track/disc)', () => {
    expect(validateField('trackNumber', 5)).toBeNull();
    expect(validateField('trackNumber', 1)).toBeNull();
    expect(validateField('trackNumber', 0)).toBe('Must be a positive integer (>= 1)');
    expect(validateField('trackNumber', -1)).toBe('Must be a positive integer (>= 1)');
    expect(validateField('trackNumber', 'abc')).toBe('Must be a positive integer (>= 1)');

    expect(validateField('discNumber', 1)).toBeNull();
    expect(validateField('discNumber', 0)).toBe('Must be a positive integer (>= 1)');

    expect(validateField('year', 2024)).toBeNull();
    expect(validateField('year', 999)).toBe('Must be a 4-digit year (1000-9999)');
    expect(validateField('year', 10000)).toBe('Must be a 4-digit year (1000-9999)');

    // Empty/cleared fields are valid (allows clearing metadata)
    expect(validateField('title', '')).toBeNull();
    expect(validateField('artists', '')).toBeNull();
    expect(validateField('year', undefined)).toBeNull();
  });

  it('detects dirty fields accurately for primitives and arrays', () => {
    const original = {
      songId: 1,
      path: 'C:/Music/song.mp3',
      duration: 180,
      title: 'Original Title',
      artists: ['Artist A'],
      albumArtists: [],
      album: 'Original Album',
      genres: ['Rock'],
      trackNumber: 1
    };

    const cleanDraft = { ...original, artists: ['Artist A'], genres: ['Rock'] };
    expect(isFieldDirty('title', original, cleanDraft)).toBe(false);
    expect(isFieldDirty('artists', original, cleanDraft)).toBe(false);

    const dirtyDraft = { ...original, title: 'New Title', artists: ['Artist A', 'Artist B'] };
    expect(isFieldDirty('title', original, dirtyDraft)).toBe(true);
    expect(isFieldDirty('artists', original, dirtyDraft)).toBe(true);
    expect(isFieldDirty('album', original, dirtyDraft)).toBe(false);
  });

  it('builds canonical SongTags with selective dirty-field overlay (preserving untouched rich objects)', () => {
    const rawOriginalTags: SongTags = {
      title: 'Orig Title',
      duration: 200,
      path: 'C:/Music/song.mp3',
      artists: [{ artistId: 10, name: 'Original Artist', artworkPath: 'art/artist10.jpg' }],
      albums: [
        { albumId: 20, title: 'Original Album', artworkPath: 'art/album20.jpg', noOfSongs: 12 }
      ],
      genres: [{ genreId: 30, name: 'Rock', artworkPath: 'art/genre30.jpg' }],
      synchronizedLyrics: '[00:01.00] Hello',
      isrc: 'USRC12345678',
      musicBrainzRecordingId: 'mb-uuid-123'
    };

    // Row where ONLY trackNumber and year were modified (artists, albums, genres untouched)
    const row = {
      songId: 1,
      path: 'C:/Music/song.mp3',
      duration: 200,
      original: {
        songId: 1,
        path: 'C:/Music/song.mp3',
        duration: 200,
        title: 'Orig Title',
        artists: ['Original Artist'],
        albumArtists: [],
        album: 'Original Album',
        genres: ['Rock'],
        trackNumber: 1,
        year: 2020
      },
      draft: {
        songId: 1,
        path: 'C:/Music/song.mp3',
        duration: 200,
        title: 'Orig Title',
        artists: ['Original Artist'],
        albumArtists: [],
        album: 'Original Album',
        genres: ['Rock'],
        trackNumber: 5,
        year: 2024
      },
      dirtyFields: new Set(['trackNumber', 'year'] as const),
      validationErrors: new Map()
    };

    const payload = buildCanonicalSongTags(row, rawOriginalTags);

    // Overlaid fields must match draft modifications
    expect(payload.trackNumber).toBe(5);
    expect(payload.releasedYear).toBe(2024);

    // Untouched complex fields must remain exactly identical to rawOriginalTags without lossy conversion
    expect(payload.artists).toBe(rawOriginalTags.artists);
    expect(payload.albums).toBe(rawOriginalTags.albums);
    expect(payload.genres).toBe(rawOriginalTags.genres);
    expect(payload.synchronizedLyrics).toBe('[00:01.00] Hello');
    expect(payload.isrc).toBe('USRC12345678');
    expect(payload.musicBrainzRecordingId).toBe('mb-uuid-123');
  });
});

describe('BatchSongTagsEditor Component', () => {
  beforeEach(() => {
    window.api = {
      songUpdates: {
        getSongId3Tags: vi.fn().mockImplementation((id: string) =>
          Promise.resolve({
            title: `Track ${id}`,
            duration: 180,
            path: `C:/Music/Track_${id}.mp3`,
            artists: [{ artistId: Number(id), name: `Artist ${id}` }],
            albums: [{ albumId: 1, title: 'Test Album' }],
            genres: [{ genreId: 1, name: 'Pop' }],
            trackNumber: Number(id),
            releasedYear: 2024
          })
        ),
        batchUpdateSongTags: vi.fn().mockResolvedValue({
          total: 2,
          savedCount: 2,
          failedCount: 0,
          results: [
            { songId: 1, status: 'saved' },
            { songId: 2, status: 'saved' }
          ]
        }),
        onBatchTagUpdateProgress: vi.fn(),
        removeBatchTagUpdateProgressListener: vi.fn()
      }
    } as any;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads tracks concurrently with in-flight overlap verification', async () => {
    let pendingRequests = 0;
    let maxConcurrentRequests = 0;

    const resolvers: Array<() => void> = [];

    (window.api.songUpdates.getSongId3Tags as any).mockImplementation((id: string) => {
      pendingRequests++;
      if (pendingRequests > maxConcurrentRequests) {
        maxConcurrentRequests = pendingRequests;
      }

      return new Promise((resolve) => {
        resolvers.push(() => {
          pendingRequests--;
          resolve({
            title: `Track ${id}`,
            duration: 180,
            path: `C:/Music/Track_${id}.mp3`,
            artists: [{ artistId: Number(id), name: `Artist ${id}` }],
            albums: [{ albumId: 1, title: 'Test Album' }],
            genres: [{ genreId: 1, name: 'Pop' }],
            trackNumber: Number(id),
            releasedYear: 2024
          });
        });
      });
    });

    render(<BatchSongTagsEditor initialSongIds={[1, 2, 3, 4]} />);

    // Wait until concurrent workers spawn and execute in parallel
    await waitFor(() => {
      expect(resolvers.length).toBeGreaterThanOrEqual(2);
    });

    // Concurrency must be greater than 1 (proving bounded parallel loading)
    expect(maxConcurrentRequests).toBeGreaterThan(1);

    // Resolve all in-flight promises
    resolvers.forEach((r) => r());

    await waitFor(() => {
      expect(screen.getByText('Batch Metadata Editor')).not.toBeNull();
      expect(screen.getByText('Track 1')).not.toBeNull();
      expect(screen.getByText('Track 4')).not.toBeNull();
    });

    expect(screen.getByText(/4 tracks/i)).not.toBeNull();
  });

  it('allows inline editing and tracks dirty modifications and save button status', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    // Save button should initially be disabled
    const saveButton = screen.getByText('Save Tracks').closest('button')!;
    expect(saveButton.disabled).toBe(true);

    // Double-click on Title cell to activate edit mode
    const titleCell = screen.getByText('Track 1');
    fireEvent.doubleClick(titleCell);

    const input = screen.getByDisplayValue('Track 1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Track Title' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText('New Track Title')).not.toBeNull();
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
    });

    // Save button should now say "Save 1 Tracks" and be enabled
    const activeSaveButton = screen.getByText('Save 1 Tracks').closest('button')!;
    expect(activeSaveButton.disabled).toBe(false);
  });

  it('handles Tab key navigation by committing cell edits and transitioning focus', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    const titleCell = screen.getByText('Track 1');
    fireEvent.doubleClick(titleCell);

    const input = screen.getByDisplayValue('Track 1') as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'Tab Committed Title' } });
    fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });

    await waitFor(() => {
      expect(screen.getByText('Tab Committed Title')).not.toBeNull();
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
    });
  });

  it('sorts table rows deterministically when clicking column headers', async () => {
    (window.api.songUpdates.getSongId3Tags as any).mockImplementation((id: string) => {
      const titles: Record<string, string> = {
        '1': 'Zebra Song',
        '2': 'Apple Song'
      };
      return Promise.resolve({
        title: titles[id] || `Track ${id}`,
        duration: 180,
        path: `C:/Music/Track_${id}.mp3`,
        artists: [{ artistId: 1, name: 'Test Artist' }],
        albums: [{ albumId: 1, title: 'Test Album' }],
        genres: [{ genreId: 1, name: 'Pop' }],
        trackNumber: Number(id),
        releasedYear: 2024
      });
    });

    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Zebra Song')).not.toBeNull();
      expect(screen.getByText('Apple Song')).not.toBeNull();
    });

    // Initial order: Zebra Song first (row 0), Apple Song second (row 1)
    let rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Zebra Song');
    expect(rows[2].textContent).toContain('Apple Song');

    // Click Title column header to sort Ascending (A -> Z)
    const titleHeader = screen.getByText('Title');
    fireEvent.click(titleHeader);

    // Sorted order: Apple Song first (row 0), Zebra Song second (row 1)
    await waitFor(() => {
      rows = screen.getAllByRole('row');
      expect(rows[1].textContent).toContain('Apple Song');
      expect(rows[2].textContent).toContain('Zebra Song');
    });

    // Click again to sort Descending (Z -> A)
    fireEvent.click(titleHeader);

    await waitFor(() => {
      rows = screen.getAllByRole('row');
      expect(rows[1].textContent).toContain('Zebra Song');
      expect(rows[2].textContent).toContain('Apple Song');
    });
  });

  it('discards changes when Discard button is clicked', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    const titleCell = screen.getByText('Track 1');
    fireEvent.doubleClick(titleCell);

    const input = screen.getByDisplayValue('Track 1');
    fireEvent.change(input, { target: { value: 'Dirty Title' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
    });

    const discardBtn = screen.getByText('Discard Changes').closest('button')!;
    fireEvent.click(discardBtn);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
      expect(screen.queryByText('Dirty Title')).toBeNull();
    });
  });

  it('executes batch save coordinator and clears dirty states upon success', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    const titleCell = screen.getByText('Track 1');
    fireEvent.doubleClick(titleCell);

    const input = screen.getByDisplayValue('Track 1');
    fireEvent.change(input, { target: { value: 'Updated 1' } });
    fireEvent.blur(input);

    const saveBtn = await screen.findByText('Save 1 Tracks');
    fireEvent.click(saveBtn.closest('button')!);

    await waitFor(() => {
      expect(window.api.songUpdates.batchUpdateSongTags).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            songId: 1,
            tags: expect.objectContaining({ title: 'Updated 1' })
          })
        ])
      );
    });

    // Verification modal should display success summary
    await waitFor(() => {
      expect(screen.getByText(/Batch Save Complete/i)).not.toBeNull();
    });
  });

  it('triggers auto-numbering across all tracks from the toolbar', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    // Double-click track 1 title to make it dirty
    const titleCell1 = screen.getByText('Track 1');
    fireEvent.doubleClick(titleCell1);
    const input = screen.getByDisplayValue('Track 1');
    fireEvent.change(input, { target: { value: 'Dirty Track 1' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
    });

    const autoNumberBtn = screen.getByText('Auto-number 1..N').closest('button')!;
    fireEvent.click(autoNumberBtn);

    // Auto-number executes successfully
    expect(autoNumberBtn).not.toBeNull();
  });

  it('opens bulk set values modal and applies common artist across selected tracks', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    // Select row 1
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // First row checkbox

    const setValuesBtn = screen.getByText('Set Values...').closest('button')!;
    fireEvent.click(setValuesBtn);

    // Modal is open
    expect(screen.getByText('Set Values Across Selection')).not.toBeNull();

    // Check "Artist(s)" field checkbox inside the modal
    const artistLabels = screen.getAllByText('Artist(s)');
    // The second occurrence is inside the modal checkbox label
    fireEvent.click(artistLabels[1]);

    // Type new artist
    const artistInput = screen.getByPlaceholderText(/e\.g\. Queen, David Bowie/i);
    fireEvent.change(artistInput, { target: { value: 'Synthesized Band' } });

    // Click Apply
    const applyBtn = screen.getByText(/Apply to 1 Tracks/i).closest('button')!;
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByText('Synthesized Band')).not.toBeNull();
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
    });
  });

  it('reverts only selected row edits via Revert Selected toolbar button', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    // Modify row 1 title
    const titleCell1 = screen.getByText('Track 1');
    fireEvent.doubleClick(titleCell1);
    const input1 = screen.getByDisplayValue('Track 1');
    fireEvent.change(input1, { target: { value: 'Modified Track 1' } });
    fireEvent.blur(input1);

    // Modify row 2 title
    const titleCell2 = screen.getByText('Track 2');
    fireEvent.doubleClick(titleCell2);
    const input2 = screen.getByDisplayValue('Track 2');
    fireEvent.change(input2, { target: { value: 'Modified Track 2' } });
    fireEvent.blur(input2);

    await waitFor(() => {
      expect(screen.getByText(/2 modified/i)).not.toBeNull();
    });

    // Select ONLY row 1
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    // Click "Revert Selected"
    const revertBtn = await screen.findByText('Revert Selected');
    fireEvent.click(revertBtn.closest('button')!);

    await waitFor(() => {
      // Row 1 reverted to Track 1
      expect(screen.getByText('Track 1')).not.toBeNull();
      // Row 2 is still modified
      expect(screen.getByText('Modified Track 2')).not.toBeNull();
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
    });
  });

  it('guarantees ID-based selection isolation when table is sorted descending (sorted-selection regression)', async () => {
    render(<BatchSongTagsEditor initialSongIds={[1, 2]} />);

    await waitFor(() => {
      expect(screen.getByText('Track 1')).not.toBeNull();
    });

    // Sort by Title descending: Track 2 becomes visual row 0, Track 1 becomes visual row 1
    const titleHeader = screen.getByText('Title').closest('th')!;
    fireEvent.click(titleHeader); // asc
    fireEvent.click(titleHeader); // desc

    // Select visual row 0 (which is Track 2, songId 2)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // Visual row 0

    // Open Set Values modal and set Album to "Descending Album"
    const setValuesBtn = screen.getByText(/Set Values/i).closest('button')!;
    fireEvent.click(setValuesBtn);

    const albumLabel = screen.getAllByText('Album')[1]; // Label inside modal
    fireEvent.click(albumLabel);

    const albumInput = screen.getByPlaceholderText(/e\.g\. Greatest Hits/i);
    fireEvent.change(albumInput, { target: { value: 'Descending Album' } });

    const applyBtn = screen.getByText(/Apply to 1 Tracks/i).closest('button')!;
    fireEvent.click(applyBtn);

    await waitFor(() => {
      // Exactly 1 track modified
      expect(screen.getByText(/1 modified/i)).not.toBeNull();
      expect(screen.getByText('Descending Album')).not.toBeNull();
    });
  });
});
