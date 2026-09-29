/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import Song from '../../../../../../src/renderer/src/components/SongsPage/Song';
import CompactSongRow from '../../../../../../src/renderer/src/components/SongsPage/CompactSongRow';
import { CompactListHeader } from '../../../../../../src/renderer/src/components/SongsPage/CompactListHeader';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { queryClient } from '../../../../../../src/renderer/src/queryClient';
import { dispatch, store } from '../../../../../../src/renderer/src/store/store';

// Track Img component mounts
let imgRenderCount = 0;

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any) => {
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../../../../../src/renderer/src/components/Img', () => ({
  default: (props: any) => {
    imgRenderCount++;
    return <img alt="song cover" data-testid="song-img" {...props} />;
  }
}));

vi.mock('../../../../../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, title, className, ...rest }: any) => (
    <span data-testid="nav-link" title={title} className={className} {...rest}>
      {children}
    </span>
  )
}));

vi.mock('../../../../../../src/renderer/src/hooks/useQueueOperations', () => ({
  useQueueOperations: () => ({
    addToNext: vi.fn(),
    addToEnd: vi.fn(),
    removeSongs: vi.fn(),
    clearQueue: vi.fn(),
    playNext: vi.fn()
  })
}));

const mockContextValue: AppUpdateContextType = {
  updateCurrentSongData: vi.fn(),
  updateContextMenuData: vi.fn(),
  changePromptMenuData: vi.fn(),
  changeUpNextSongData: vi.fn(),
  updatePromptMenuHistoryIndex: vi.fn(),
  playSong: vi.fn(),
  addNewNotifications: vi.fn(),
  updateNotifications: vi.fn(),
  createQueue: vi.fn(),
  updateQueueData: vi.fn(),
  toggleIsFavorite: vi.fn(),
  toggleMultipleSelections: vi.fn(),
  updateMultipleSelections: vi.fn(),
  openAutoTagDialog: vi.fn(),
  openTrackIdentifyDialog: vi.fn(),
  openGenreStyleDialog: vi.fn()
};

const sampleSongData = {
  songId: 101,
  title: 'Midnight City',
  duration: 243,
  path: 'C:\\Music\\Midnight City.mp3',
  isAFavorite: false,
  artists: [{ artistId: 1, name: 'M83' }],
  album: { albumId: 5, name: 'Hurry Up, We\'re Dreaming' },
  genres: [{ genreId: 1, name: 'Synthwave' }],
  artworkPaths: {
    artworkPath: 'C:\\Covers\\101.jpg',
    optimizedArtworkPath: 'nora-artwork://101.webp'
  }
};

describe('CompactSongRow & CompactListHeader', () => {
  beforeEach(() => {
    imgRenderCount = 0;
    (window as any).api = {
      playerControls: {
        toggleLikeSongs: vi.fn().mockResolvedValue({ likes: [101], dislikes: [] })
      },
      audioLibraryControls: {},
      properties: { isInDevelopment: false }
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders CompactSongRow with ZERO <Img> elements or artwork requests', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <CompactSongRow {...sampleSongData} index={0} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // Assert zero <img> or data-testid="song-img" elements
    expect(screen.queryByTestId('song-img')).toBeNull();
    expect(imgRenderCount).toBe(0);

    // Verify row title and artists rendered
    expect(screen.getByText('Midnight City')).toBeDefined();
    expect(screen.getByText('M83')).toBeDefined();
    expect(screen.getByText('Hurry Up, We\'re Dreaming')).toBeDefined();
    expect(screen.getByText('4:03')).toBeDefined();
  });

  it('Song dispatcher routes to CompactSongRow when isCompact=true and StandardSongRow when false', () => {
    // 1. Render in standard mode
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <Song {...sampleSongData} index={0} isCompact={false} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.queryByTestId('song-img')).not.toBeNull();
    expect(imgRenderCount).toBeGreaterThan(0);
    unmount();

    // 2. Render in compact mode
    imgRenderCount = 0;
    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <Song {...sampleSongData} index={0} isCompact={true} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.queryByTestId('song-img')).toBeNull();
    expect(imgRenderCount).toBe(0);
  });

  it('renders MusicBee musical note indicator when active and playing', async () => {
    // Set song 101 as active playing track
    act(() => {
      dispatch({
        type: 'CURRENT_SONG_DATA_CHANGE',
        data: { songId: 101, title: 'Midnight City' } as any
      });
      dispatch({
        type: 'CURRENT_SONG_PLAYBACK_STATE',
        data: true
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <CompactSongRow {...sampleSongData} index={0} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // MusicBee note icon indicator
    const noteIcon = screen.getByText('music_note');
    expect(noteIcon).toBeDefined();
    expect(noteIcon.className).toContain('text-accent');
  });

  it('renders pause indicator when active and paused', async () => {
    // Set song 101 as active paused track
    act(() => {
      dispatch({
        type: 'CURRENT_SONG_DATA_CHANGE',
        data: { songId: 101, title: 'Midnight City' } as any
      });
      dispatch({
        type: 'CURRENT_SONG_PLAYBACK_STATE',
        data: false
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <CompactSongRow {...sampleSongData} index={0} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // MusicBee pause bars indicator
    const pauseIcon = screen.getByText('pause');
    expect(pauseIcon).toBeDefined();
    expect(pauseIcon.className).toContain('text-accent');
  });

  it('renders CompactListHeader with correct column labels and no track number metadata dependencies', () => {
    const { container } = render(<CompactListHeader />);

    // Column header labels
    expect(screen.getByText('#')).toBeDefined();
    expect(screen.getByText('Title')).toBeDefined();
    expect(screen.getByText('Artist')).toBeDefined();
    expect(screen.getByText('Album')).toBeDefined();
    expect(screen.getByText('Time')).toBeDefined();

    // Verify 28px height
    const header = container.querySelector('.compact-list-header');
    expect(header?.className).toContain('h-[28px]');
  });

  it('renders MultipleSelectionCheckbox when multiple selection is active', () => {
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: { isEnabled: true, selectionType: 'songs', multipleSelections: [] }
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <CompactSongRow {...sampleSongData} index={0} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // Verify checkbox is rendered in indicator slot
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDefined();
  });

  it('attaches dragHandleProps to root container div and NOT to indicator slot', () => {
    const mockProvided = {
      draggableProps: { 'data-testid': 'mock-draggable' } as any,
      dragHandleProps: { 'data-testid': 'mock-drag-handle' } as any,
      innerRef: vi.fn()
    };

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <CompactSongRow {...sampleSongData} index={0} provided={mockProvided} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    const rootRow = container.querySelector('.compact-song-row');
    expect(rootRow).toBeDefined();
    expect(rootRow?.getAttribute('data-testid')).toBe('mock-drag-handle');

    const indicatorSlot = container.querySelector('.compact-indicator-slot');
    expect(indicatorSlot).toBeDefined();
    expect(indicatorSlot?.getAttribute('data-testid')).toBeNull();
  });

  it('context menu supports full batch actions and multi-selection parity with StandardSongRow', async () => {
    // 1. Setup multi-selection state with 3 songs: [101, 102, 103]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [101, 102, 103]
        }
      });
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue}>
          <CompactSongRow {...sampleSongData} index={0} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    const rootRow = container.querySelector('.compact-song-row') as HTMLElement;
    expect(rootRow).toBeDefined();

    // Trigger right click
    await act(async () => {
      fireEvent.contextMenu(rootRow, { clientX: 100, clientY: 200, pageX: 100, pageY: 200 });
    });

    expect(mockContextValue.updateContextMenuData).toHaveBeenCalled();
    const lastCall = vi.mocked(mockContextValue.updateContextMenuData).mock.calls.at(-1);
    expect(lastCall).toBeDefined();

    const [isOpen, items, pageX, pageY, additionalData] = lastCall!;
    expect(isOpen).toBe(true);
    expect(pageX).toBe(100);
    expect(pageY).toBe(200);

    // Verify context menu header shows multi-selection count key
    expect(additionalData?.title).toBe('song.selectedSongCount');

    // Verify batch menu items exist
    const labels = (items as any[]).map((it) => it.label);
    expect(labels).toContain('common.createAQueue');
    expect(labels).toContain('common.playNextAll');
    expect(labels).toContain('common.addToQueue');
    expect(labels).toContain('song.toggleLikeSongs');
    expect(labels).toContain('song.delete');

    // Play button should be disabled when multi-selection is active
    const playItem = (items as any[]).find((it) => it.label === 'common.play');
    expect(playItem?.isDisabled).toBe(true);

    // Create Queue should be enabled
    const queueItem = (items as any[]).find((it) => it.label === 'common.createAQueue');
    expect(queueItem?.isDisabled).toBe(false);
  });
});

