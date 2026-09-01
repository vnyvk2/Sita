import { fireEvent, render } from '@testing-library/react';
// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, AppUpdateContextType } from '../../contexts/AppUpdateContext';
import { Album } from './Album';

// Mock router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

// Mock NavLink to avoid RouterProvider dependency in tests
vi.mock('../NavLink', () => ({
  default: ({ children, className, title, onContextMenu }: any) => (
    <span className={className} title={title} onContextMenu={onContextMenu}>
      {children}
    </span>
  )
}));

// Mock react-i18next preserving initReactI18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key
    })
  };
});

describe('Album Context Menu Auto Tag', () => {
  const mockOpenAutoTagDialog = vi.fn();
  let mockUpdateContextMenuData: ReturnType<typeof vi.fn>;

  const defaultProps = {
    albumId: 42,
    title: 'Test Album',
    artists: [{ artistId: 1, name: 'Test Artist' }],
    artworkPaths: {
      artworkPath: 'path/to/artwork',
      optimizedArtworkPath: 'path/to/optimized'
    },
    songCount: 2,
    index: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateContextMenuData = vi.fn();

    // Mock window.api.albumsData.getAlbumData returning PaginatedResult
    window.api = {
      ...window.api,
      albumsData: {
        ...window.api?.albumsData,
        getAlbumData: vi.fn().mockResolvedValue({
          data: [
            {
              albumId: 42,
              title: 'Test Album',
              artists: [{ artistId: 1, name: 'Test Artist' }],
              songs: [
                { songId: 101, title: 'Track 1' },
                { songId: 102, title: 'Track 2' }
              ]
            }
          ],
          total: 1
        }),
        getAlbumSongIds: vi.fn().mockResolvedValue([101, 102]),
        toggleLikeAlbums: vi.fn().mockResolvedValue(undefined),
        getAlbumInfoFromLastFM: vi.fn().mockResolvedValue(undefined)
      }
    } as any;
  });

  const renderAlbum = (extraProps = {}) => {
    const contextValue = {
      openAutoTagDialog: mockOpenAutoTagDialog,
      updateContextMenuData: mockUpdateContextMenuData,
      createQueue: vi.fn(),
      addNewNotifications: vi.fn(),
      updateMultipleSelections: vi.fn(),
      toggleMultipleSelections: vi.fn()
    } as unknown as AppUpdateContextType;

    return render(
      <AppUpdateContext.Provider value={contextValue}>
        <Album {...defaultProps} {...extraProps} />
      </AppUpdateContext.Provider>
    );
  };

  it('triggers openAutoTagDialog when Auto Tag Album is clicked from context menu (without props.songs)', async () => {
    const { container } = renderAlbum();

    // Right-click the album container to open context menu
    const albumElem = container.querySelector('.album');
    expect(albumElem).toBeTruthy();
    fireEvent.contextMenu(albumElem!);

    expect(mockUpdateContextMenuData).toHaveBeenCalledTimes(1);

    // Get context menu items passed to updateContextMenuData
    const contextMenuItems = mockUpdateContextMenuData.mock.calls[0][1];
    const autoTagItem = contextMenuItems.find((item: any) => item.label === 'Auto Tag Album');
    expect(autoTagItem).toBeDefined();

    // Execute the handler
    autoTagItem.handlerFunction();

    // Wait for async resolveSongTitles to finish and verify openAutoTagDialog was called
    await vi.waitFor(() => {
      expect(mockOpenAutoTagDialog).toHaveBeenCalledTimes(1);
      expect(mockOpenAutoTagDialog).toHaveBeenCalledWith(
        [
          { songId: 101, title: 'Track 1' },
          { songId: 102, title: 'Track 2' }
        ],
        'Test Album',
        'Test Artist'
      );
    });
  });

  it('uses props.songs directly when provided', async () => {
    const customSongs = [
      { songId: 201, title: 'Custom Track 1' },
      { songId: 202, title: 'Custom Track 2' }
    ];
    const { container } = renderAlbum({ songs: customSongs });

    const albumElem = container.querySelector('.album');
    fireEvent.contextMenu(albumElem!);

    const contextMenuItems = mockUpdateContextMenuData.mock.calls[0][1];
    const autoTagItem = contextMenuItems.find((item: any) => item.label === 'Auto Tag Album');
    expect(autoTagItem).toBeDefined();

    autoTagItem.handlerFunction();

    await vi.waitFor(() => {
      expect(mockOpenAutoTagDialog).toHaveBeenCalledTimes(1);
      expect(mockOpenAutoTagDialog).toHaveBeenCalledWith(customSongs, 'Test Album', 'Test Artist');
    });

    // getAlbumData should NOT have been called since songs were provided in props
    expect(window.api.albumsData.getAlbumData).not.toHaveBeenCalled();
  });
});
