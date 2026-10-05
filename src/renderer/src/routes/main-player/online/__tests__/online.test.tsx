// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OnlinePage from '../index';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createFileRoute: () => (config: unknown) => config
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string } | string) => {
      const translations: Record<string, string> = {
        'onlinePage.title': 'Online',
        'onlinePage.configureFolderWarning': 'Set a download folder before downloading songs.',
        'onlinePage.chooseFolder': 'Choose download folder',
        'onlinePage.openSettings': 'Open in Settings',
        'onlinePage.searchTab': 'Search',
        'onlinePage.playlistTab': 'Playlist URL',
        'onlinePage.searchPlaceholder': 'Search songs, artists, albums...',
        'onlinePage.search': 'Search',
        'onlinePage.searching': 'Searching...',
        'onlinePage.playlistPlaceholder': 'Paste a YouTube playlist URL',
        'onlinePage.loadPlaylist': 'Load',
        'onlinePage.download': 'Download',
        'onlinePage.downloadAll': 'Download all'
      };
      if (typeof options === 'string') return options;
      return translations[key] ?? options?.defaultValue ?? key;
    }
  })
}));

let mockSettings: { onlineDownloadsFolder: string | null } = {
  onlineDownloadsFolder: null
};

vi.mock('@renderer/queries/settings', () => ({
  settingsQuery: {
    all: {
      queryKey: ['settings'],
      queryFn: () => Promise.resolve(mockSettings)
    }
  }
}));

const mockDownloadStates = {
  jobs: [] as unknown[],
  summary: { activeCount: 0, completedCount: 0, failedCount: 0 }
};

vi.mock('@renderer/queries/downloads', () => ({
  downloadsQuery: {
    state: () => ({
      queryKey: ['downloads', 'state'],
      queryFn: () => Promise.resolve(mockDownloadStates)
    })
  }
}));

const mockGetFolderLocation = vi.fn();
const mockUpdateOnlineDownloadsFolder = vi.fn();
const mockEnsureFolderRegistered = vi.fn();
const mockEnqueue = vi.fn();
const mockEnqueueMany = vi.fn();
const mockSearch = vi.fn();
const mockResolvePlaylist = vi.fn();
const mockGetActiveDownloads = vi.fn();

const sampleTrack = {
  videoId: 'abc12345',
  title: 'Test Song Title',
  channel: 'Test Artist - Topic',
  duration: 180,
  thumbnails: ['https://example.com/thumb.jpg']
};

const samplePlaylist = {
  playlistId: 'pl123',
  title: 'Test Playlist Title',
  entries: [sampleTrack],
  excludedCount: 0
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSettings = { onlineDownloadsFolder: null };

  mockGetActiveDownloads.mockResolvedValue([]);
  mockSearch.mockResolvedValue([sampleTrack]);
  mockResolvePlaylist.mockResolvedValue(samplePlaylist);
  mockUpdateOnlineDownloadsFolder.mockResolvedValue(undefined);
  mockEnsureFolderRegistered.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue('job-1');
  mockEnqueueMany.mockResolvedValue(['job-1']);

  Object.defineProperty(window, 'api', {
    value: {
      settingsHelpers: {
        getFolderLocation: mockGetFolderLocation
      },
      settings: {
        updateOnlineDownloadsFolder: mockUpdateOnlineDownloadsFolder
      },
      downloads: {
        ensureFolderRegistered: mockEnsureFolderRegistered,
        enqueue: mockEnqueue,
        enqueueMany: mockEnqueueMany,
        search: mockSearch,
        resolvePlaylist: mockResolvePlaylist,
        getActiveDownloads: mockGetActiveDownloads,
        onJobEvent: vi.fn(() => () => {}),
        onUpdated: vi.fn(() => () => {})
      }
    },
    writable: true
  });
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('OnlinePage Download Folder Handling', () => {
  it('renders the warning banner with picker and settings link when no folder is configured', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    renderWithClient(<OnlinePage />);

    expect(
      await screen.findByText(/Set a download folder before downloading songs/i)
    ).toBeDefined();

    const chooseBtn = screen.getByRole('button', { name: /Choose download folder/i });
    expect(chooseBtn).toBeDefined();

    const openSettingsBtn = screen.getByRole('button', { name: /Open in Settings/i });
    expect(openSettingsBtn).toBeDefined();
  });

  it('hides the warning banner when a download folder is configured', async () => {
    mockSettings = { onlineDownloadsFolder: 'C:/Music/Downloads' };
    renderWithClient(<OnlinePage />);

    await waitFor(() => {
      expect(screen.queryByText(/Set a download folder before downloading songs/i)).toBeNull();
    });
  });

  it('navigates to settings downloads section when Open in Settings is clicked', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    renderWithClient(<OnlinePage />);

    const openSettingsBtn = await screen.findByRole('button', { name: /Open in Settings/i });
    fireEvent.click(openSettingsBtn);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/main-player/settings',
      search: { section: 'downloads', highlight: 'setting-downloads-folder' }
    });
  });

  it('sequentially registers folder when chosen from the banner', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    mockGetFolderLocation.mockResolvedValue('D:/Songs/Downloads');

    renderWithClient(<OnlinePage />);

    const chooseBtn = await screen.findByRole('button', { name: /Choose download folder/i });
    fireEvent.click(chooseBtn);

    await waitFor(() => {
      expect(mockGetFolderLocation).toHaveBeenCalledTimes(1);
      expect(mockUpdateOnlineDownloadsFolder).toHaveBeenCalledWith('D:/Songs/Downloads');
      expect(mockEnsureFolderRegistered).toHaveBeenCalledTimes(1);
    });
  });

  it('does nothing when the folder picker is cancelled from the banner', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    mockGetFolderLocation.mockResolvedValue(null);

    renderWithClient(<OnlinePage />);

    const chooseBtn = await screen.findByRole('button', { name: /Choose download folder/i });
    fireEvent.click(chooseBtn);

    await waitFor(() => {
      expect(mockGetFolderLocation).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateOnlineDownloadsFolder).not.toHaveBeenCalled();
    expect(mockEnsureFolderRegistered).not.toHaveBeenCalled();
  });

  it('smart-downloads track when folder is not set: prompts picker and enqueues upon selection', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    mockGetFolderLocation.mockResolvedValue('E:/MyMusic');

    renderWithClient(<OnlinePage />);

    // Perform a search to populate track rows
    const searchInput = screen.getByPlaceholderText(/Search songs, artists, albums.../i);
    fireEvent.change(searchInput, { target: { value: 'Test Song' } });
    fireEvent.submit(searchInput.closest('form')!);

    const downloadBtn = await screen.findByRole('button', { name: /^Download$/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockGetFolderLocation).toHaveBeenCalledTimes(1);
      expect(mockUpdateOnlineDownloadsFolder).toHaveBeenCalledWith('E:/MyMusic');
      expect(mockEnsureFolderRegistered).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledWith({
        videoId: 'abc12345',
        title: 'Test Song Title',
        artist: 'Test Artist',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        durationSecs: 180
      });
    });
  });

  it('smart-downloads track when folder is not set: silently cancels if picker is dismissed', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    mockGetFolderLocation.mockResolvedValue(null);

    renderWithClient(<OnlinePage />);

    const searchInput = screen.getByPlaceholderText(/Search songs, artists, albums.../i);
    fireEvent.change(searchInput, { target: { value: 'Test Song' } });
    fireEvent.submit(searchInput.closest('form')!);

    const downloadBtn = await screen.findByRole('button', { name: /^Download$/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockGetFolderLocation).toHaveBeenCalledTimes(1);
    });

    // Enqueue should NOT be called and no row error should be visible
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(screen.queryByText(/No download folder configured/i)).toBeNull();
  });

  it('downloads track directly without opening folder picker when folder is already set', async () => {
    mockSettings = { onlineDownloadsFolder: 'C:/Existing/Folder' };

    renderWithClient(<OnlinePage />);

    const searchInput = screen.getByPlaceholderText(/Search songs, artists, albums.../i);
    fireEvent.change(searchInput, { target: { value: 'Test Song' } });
    fireEvent.submit(searchInput.closest('form')!);

    const downloadBtn = await screen.findByRole('button', { name: /^Download$/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });

    expect(mockGetFolderLocation).not.toHaveBeenCalled();
  });

  it('smart-downloads playlist: prompts picker and calls enqueueMany upon selection', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    mockGetFolderLocation.mockResolvedValue('F:/Playlists');

    renderWithClient(<OnlinePage />);

    // Switch to Playlist tab
    const playlistTabBtn = screen.getByRole('button', { name: /Playlist URL/i });
    fireEvent.click(playlistTabBtn);

    const playlistInput = screen.getByPlaceholderText(/Paste a YouTube playlist URL/i);
    fireEvent.change(playlistInput, {
      target: { value: 'https://youtube.com/playlist?list=pl123' }
    });
    fireEvent.submit(playlistInput.closest('form')!);

    const downloadAllBtn = await screen.findByRole('button', { name: /Download all/i });
    fireEvent.click(downloadAllBtn);

    await waitFor(() => {
      expect(mockGetFolderLocation).toHaveBeenCalledTimes(1);
      expect(mockUpdateOnlineDownloadsFolder).toHaveBeenCalledWith('F:/Playlists');
      expect(mockEnsureFolderRegistered).toHaveBeenCalledTimes(1);
      expect(mockEnqueueMany).toHaveBeenCalledWith(
        [
          {
            videoId: 'abc12345',
            title: 'Test Song Title',
            artist: 'Test Artist',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            durationSecs: 180
          }
        ],
        'pl123',
        'Test Playlist Title'
      );
    });
  });

  it('smart-downloads playlist: silently cancels if picker is dismissed', async () => {
    mockSettings = { onlineDownloadsFolder: null };
    mockGetFolderLocation.mockResolvedValue(null);

    renderWithClient(<OnlinePage />);

    const playlistTabBtn = screen.getByRole('button', { name: /Playlist URL/i });
    fireEvent.click(playlistTabBtn);

    const playlistInput = screen.getByPlaceholderText(/Paste a YouTube playlist URL/i);
    fireEvent.change(playlistInput, {
      target: { value: 'https://youtube.com/playlist?list=pl123' }
    });
    fireEvent.submit(playlistInput.closest('form')!);

    const downloadAllBtn = await screen.findByRole('button', { name: /Download all/i });
    fireEvent.click(downloadAllBtn);

    await waitFor(() => {
      expect(mockGetFolderLocation).toHaveBeenCalledTimes(1);
    });

    expect(mockEnqueueMany).not.toHaveBeenCalled();
  });
});
