// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, act, cleanup } from '@testing-library/react';
import React, { useMemo, useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import QueueRow from '../../../../../../src/renderer/src/components/SongsPage/QueueRow';
import { AppUpdateContext } from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { queryClient } from '../../../../../../src/renderer/src/queryClient';
import { store, dispatch } from '../../../../../../src/renderer/src/store/store';

// Track render counts for each QueueRow
const queueRowRenderCounts: Record<number, number> = {};

vi.mock('@hello-pangea/dnd', () => ({
  Draggable: ({ children, draggableId }: any) =>
    children({
      innerRef: vi.fn(),
      draggableProps: { 'data-testid': `draggable-${draggableId}` },
      dragHandleProps: {}
    }),
  Droppable: ({ children }: any) => children({ innerRef: vi.fn(), droppableProps: {} }),
  DragDropContext: ({ children }: any) => <div>{children}</div>
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: string) => defaultVal || key
    })
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

vi.mock('../../../../../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, title, className, ...rest }: any) => (
    <span data-testid="nav-link" title={title} className={className} {...rest}>
      {children}
    </span>
  )
}));

const mockSongs: Record<number, SongData> = {
  101: {
    songId: 101,
    title: 'Track 101',
    artists: [{ artistId: 1, name: 'Artist 1' }],
    album: { albumId: 1, name: 'Album 1' },
    duration: 180,
    path: '/path/101.mp3',
    artworkPaths: { artworkPath: '/art/101.webp' },
    isAFavorite: false
  },
  102: {
    songId: 102,
    title: 'Track 102',
    artists: [{ artistId: 2, name: 'Artist 2' }],
    album: { albumId: 1, name: 'Album 1' },
    duration: 200,
    path: '/path/102.mp3',
    artworkPaths: { artworkPath: '/art/102.webp' },
    isAFavorite: false
  },
  103: {
    songId: 103,
    title: 'Track 103',
    artists: [{ artistId: 3, name: 'Artist 3' }],
    album: { albumId: 1, name: 'Album 1' },
    duration: 220,
    path: '/path/103.mp3',
    artworkPaths: { artworkPath: '/art/103.webp' },
    isAFavorite: false
  }
};

// Instrumented QueueRow wrapper to count renders
const InstrumentedQueueRow = React.memo((props: any) => {
  queueRowRenderCounts[props.songId] = (queueRowRenderCounts[props.songId] || 0) + 1;
  return <QueueRow {...props} />;
});

// Test Harness simulating CurrentQueuePage state subscription & structural cache
function QueueTestHarness({
  externalQueueState,
  onPlaySong,
  onRemoveSong
}: {
  externalQueueState: { queues: { songIds: number[]; position: number }[]; currentQueueIndex: number };
  onPlaySong: (index: number, songId: number) => void;
  onRemoveSong: (songId: number) => void;
}) {
  const songIdsRef = useRef<number[]>([]);
  const currentQueue = useMemo(() => {
    const nextIds = externalQueueState.queues[externalQueueState.currentQueueIndex]?.songIds;
    if (!nextIds || nextIds.length === 0) {
      if (songIdsRef.current.length === 0) return songIdsRef.current;
      songIdsRef.current = [];
      return songIdsRef.current;
    }
    const prevIds = songIdsRef.current;
    if (prevIds.length === nextIds.length) {
      let isSame = true;
      for (let i = 0; i < nextIds.length; i++) {
        if (prevIds[i] !== nextIds[i]) {
          isSame = false;
          break;
        }
      }
      if (isSame) {
        return prevIds;
      }
    }
    songIdsRef.current = nextIds;
    return nextIds;
  }, [externalQueueState]);

  return (
    <div data-testid="queue-container">
      {currentQueue.map((songId, index) => (
        <InstrumentedQueueRow
          key={`${songId}-${index}`}
          index={index}
          songId={songId}
          song={mockSongs[songId]}
          isIndexingSongs={true}
          onPlaySong={onPlaySong}
          onRemoveSong={onRemoveSong}
        />
      ))}
    </div>
  );
}

describe('QueueRow & Structural Cache Instrumentation Tests', () => {
  const mockAppContext = {
    playSong: vi.fn(),
    toggleIsFavorite: vi.fn(),
    toggleMultipleSelections: vi.fn(),
    updateContextMenuData: vi.fn(),
    changePromptMenuData: vi.fn(),
    addNewNotifications: vi.fn(),
    updateMultipleSelections: vi.fn(),
    createQueue: vi.fn(),
    openAutoTagDialog: vi.fn()
  };

  beforeEach(() => {
    cleanup();
    Object.keys(queueRowRenderCounts).forEach((k) => delete queueRowRenderCounts[Number(k)]);
    store.setState((state) => ({
      ...state,
      currentSongData: {
        songId: 101,
        title: 'Track 101',
        isAFavorite: false,
        duration: 180,
        artists: [{ artistId: 1, name: 'Artist 1' }],
        album: { albumId: 1, name: 'Album 1' }
      } as any,
      player: {
        ...state.player,
        isCurrentSongPlaying: true
      }
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Initial Mount: renders each visible row exactly once', () => {
    const queueState = {
      queues: [{ songIds: [101, 102, 103], position: 0 }],
      currentQueueIndex: 0
    };
    const onPlay = vi.fn();
    const onRemove = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockAppContext as any}>
          <QueueTestHarness
            externalQueueState={queueState}
            onPlaySong={onPlay}
            onRemoveSong={onRemove}
          />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    expect(queueRowRenderCounts[101]).toBe(1);
    expect(queueRowRenderCounts[102]).toBe(1);
    expect(queueRowRenderCounts[103]).toBe(1);
  });

  it('2. Position Change with new array reference (simulating q.toJSON()): structural cache preserves array reference, preventing QueueRow re-renders', () => {
    const onPlay = vi.fn();
    const onRemove = vi.fn();

    // Initial state: position 0
    const queueState1 = {
      queues: [{ songIds: [101, 102, 103], position: 0 }],
      currentQueueIndex: 0
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockAppContext as any}>
          <QueueTestHarness
            externalQueueState={queueState1}
            onPlaySong={onPlay}
            onRemoveSong={onRemove}
          />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    expect(queueRowRenderCounts[101]).toBe(1);
    expect(queueRowRenderCounts[102]).toBe(1);
    expect(queueRowRenderCounts[103]).toBe(1);

    // Simulate track advance in store: PlayerQueue.position changed to 1,
    // triggerStoreSync created brand-new songIds array [...[101, 102, 103]]
    const queueState2 = {
      queues: [{ songIds: [101, 102, 103].slice(), position: 1 }],
      currentQueueIndex: 0
    };

    // Also advance currentSongData in store from 101 to 102
    act(() => {
      store.setState((state) => ({
        ...state,
        currentSongData: {
          ...state.currentSongData,
          songId: 102,
          title: 'Track 102'
        } as any
      }));
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockAppContext as any}>
          <QueueTestHarness
            externalQueueState={queueState2}
            onPlaySong={onPlay}
            onRemoveSong={onRemove}
          />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // With structural cache and stable callbacks, React.memo(QueueRow) skips all rows whose props did not change:
    // QueueRow 101, 102, and 103 did NOT re-render at the QueueRow wrapper level!
    expect(queueRowRenderCounts[101]).toBe(1);
    expect(queueRowRenderCounts[102]).toBe(1);
    expect(queueRowRenderCounts[103]).toBe(1);
  });

  it('3. Reordering / Mutation: structural cache detects changed songIds and triggers QueueRow updates', () => {
    const onPlay = vi.fn();
    const onRemove = vi.fn();

    const queueState1 = {
      queues: [{ songIds: [101, 102, 103], position: 0 }],
      currentQueueIndex: 0
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockAppContext as any}>
          <QueueTestHarness
            externalQueueState={queueState1}
            onPlaySong={onPlay}
            onRemoveSong={onRemove}
          />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // Drag-reorder: 102 moved to position 0 -> [102, 101, 103]
    const queueState2 = {
      queues: [{ songIds: [102, 101, 103], position: 0 }],
      currentQueueIndex: 0
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockAppContext as any}>
          <QueueTestHarness
            externalQueueState={queueState2}
            onPlaySong={onPlay}
            onRemoveSong={onRemove}
          />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // Affected rows (101 and 102 changed index) re-render
    expect(queueRowRenderCounts[102]).toBe(2);
    expect(queueRowRenderCounts[101]).toBe(2);
  });
});
