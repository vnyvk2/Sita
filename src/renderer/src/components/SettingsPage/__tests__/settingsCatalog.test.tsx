// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../assets/locales/en/en.json';
import { settingsQuery } from '../../../queries/settings';
import { SETTINGS_SECTION_KEYS } from '../Settings/SettingsCollapseContext';
import { settingsCatalog } from '../settingsCatalog';
import SettingsPage from '../SettingsPage';

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string } | string) => {
        if (typeof options === 'string') return options;
        const parts = key.split('.');
        let current: unknown = en;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return options?.defaultValue ?? key;
          }
        }
        return typeof current === 'string' ? current : options?.defaultValue ?? key;
      }
    })
  };
});

const defaultUserSettings = {
  language: 'en',
  isDarkMode: true,
  useSystemTheme: false,
  autoLaunchApp: false,
  openWindowMaximizedOnStart: false,
  openWindowAsHiddenOnSystemStart: false,
  isMiniPlayerAlwaysOnTop: false,
  isMiniPlayerTaskbarHidden: false,
  isMusixmatchLyricsEnabled: true,
  hideWindowOnClose: false,
  traySingleClickTogglesWindow: false,
  sendSongScrobblingDataToLastFM: false,
  sendSongFavoritesDataToLastFM: false,
  sendNowPlayingSongDataToLastFM: false,
  sendSongScrobblingDataToListenBrainz: false,
  sendSongFavoritesDataToListenBrainz: false,
  sendNowPlayingSongDataToListenBrainz: false,
  saveLyricsInLrcFilesForSupportedSongs: false,
  enableDiscordRPC: false,
  saveVerboseLogs: false,
  mainWindowX: null,
  mainWindowY: null,
  miniPlayerX: null,
  miniPlayerY: null,
  mainWindowWidth: 1200,
  mainWindowHeight: 800,
  miniPlayerWidth: 300,
  miniPlayerHeight: 200,
  zoomFactor: 1,
  windowState: 'normal',
  recentSearches: [],
  miniPlayerPinnedControls: [],
  miniPlayerMode: 'standard',
  customLrcFilesSaveLocation: null,
  onlineDownloadsFolder: 'C:/Downloads',
  downloadsDuplicatePolicy: 'SKIP',
  addDownloadsToLibrary: true,
  lastFmSessionName: null,
  lastFmSessionKey: null,
  listenBrainzUsername: null,
  listenBrainzUserToken: null,
  libraryScanMode: 'automatic',
  lastScanTime: null
};

const defaultStorageMetrics = {
  rootSizes: { freeSpace: 50000000000, size: 100000000000 },
  remainingSize: 50000000000,
  appFolderSize: 100000000,
  appDataSizes: {
    appDataSize: 200000000,
    artworkCacheSize: 50000000,
    tempArtworkCacheSize: 10000000,
    totalArtworkCacheSize: 60000000,
    logSize: 5000000,
    databaseSize: 20000000,
    totalKnownItemsSize: 85000000,
    otherSize: 15000000
  },
  totalSize: 300000000,
  generatedDate: new Date().toISOString()
};

const mockApi = {
  properties: { isInDevelopment: false, platform: 'win32' },
  theme: { changeAppTheme: vi.fn() },
  settings: {
    getUserSettings: vi.fn().mockResolvedValue(defaultUserSettings),
    updateSaveLyricsInLrcFilesForSupportedSongs: vi.fn(),
    updateSaveVerboseLogs: vi.fn(),
    updateCustomLrcFilesSaveLocation: vi.fn(),
    updateDiscordRpcState: vi.fn(),
    updateDownloadsDuplicatePolicy: vi.fn(),
    updateHideMiniPlayerFromTaskbar: vi.fn(),
    updateHideWindowOnCloseState: vi.fn(),
    updateNowPlayingSongDataToLastFMState: vi.fn(),
    updateNowPlayingSongDataToListenBrainzState: vi.fn(),
    updateOnlineDownloadsFolder: vi.fn(),
    updateOpenWindowAsHiddenOnSystemStart: vi.fn(),
    updateSongFavoritesToLastFMState: vi.fn(),
    updateSongFavoritesToListenBrainzState: vi.fn(),
    updateSongScrobblingToLastFMState: vi.fn(),
    updateSongScrobblingToListenBrainzState: vi.fn(),
    updateTraySingleClickBehavior: vi.fn(),
    updateAddDownloadsToLibrary: vi.fn(),
    updateLibraryScanMode: vi.fn()
  },
  settingsHelpers: {
    toggleAutoLaunch: vi.fn(),
    openDevtools: vi.fn(),
    openInBrowser: vi.fn(),
    disconnectLastFm: vi.fn(),
    loginToLastFmInBrowser: vi.fn()
  },
  audioLibraryControls: {
    resyncSongsLibrary: vi.fn(),
    generatePalettes: vi.fn(),
    clearSongHistory: vi.fn().mockResolvedValue({ success: true })
  },
  library: {
    getScanStatus: vi.fn().mockResolvedValue('IDLE'),
    onScanProgress: vi.fn().mockReturnValue(() => {})
  },
  downloads: {
    ensureFolderRegistered: vi.fn()
  },
  storageData: {
    getStorageUsage: vi.fn().mockResolvedValue(defaultStorageMetrics),
    clearAppCache: vi.fn().mockResolvedValue(true)
  },
  spotify: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    executeImportPlan: vi.fn()
  },
  listenBrainz: {
    validateAndSaveToken: vi.fn(),
    disconnect: vi.fn()
  },
  appControls: {
    restartRenderer: vi.fn()
  },
  userData: {
    saveUserData: vi.fn()
  },
  metadataAutoTag: {
    getMetadataPreferences: vi.fn().mockResolvedValue({
      enabledSearchProviders: ['musicbrainz'],
      searchProviderPriority: ['musicbrainz'],
      searchRankingWeights: {
        artistMatch: 50,
        titleMatch: 50,
        officialStatus: 20,
        bootlegPenalty: -30,
        primaryTypeAlbum: 10,
        primaryTypeEP: 5,
        compilationPenalty: -15,
        livePenalty: -10,
        countryMatchBonus: 5,
        barcodeMatchBonus: 40,
        fuzzyTitleThreshold: 75,
        yearProximityBonus: 10,
        trackCountMatchBonus: 20,
        formatMatchBonus: 5
      }
    }),
    getAvailableSearchProviders: vi.fn().mockResolvedValue([
      { id: 'musicbrainz', displayName: 'MusicBrainz', isOnline: true }
    ]),
    saveMetadataPreferences: vi.fn()
  },
  log: {
    openLogFile: vi.fn()
  }
};

vi.stubGlobal('api', mockApi);
window.api = mockApi as unknown as typeof window.api;

const createTestQueryClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity
      }
    }
  });
  client.setQueryData(settingsQuery.all.queryKey, defaultUserSettings);
  client.setQueryData(settingsQuery.storageMetrics.queryKey, defaultStorageMetrics);
  return client;
};

describe('settingsCatalog integrity test', () => {
  it('has valid structure for all catalog entries', () => {
    expect(settingsCatalog.length).toBeGreaterThan(20);

    const ids = new Set<string>();

    for (const entry of settingsCatalog) {
      // Must have unique ID
      expect(entry.id).toBeTruthy();
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);

      // Section key must be recognized in SETTINGS_SECTION_KEYS
      expect(SETTINGS_SECTION_KEYS).toContain(entry.sectionKey);

      // Title key and defaultTitle must be non-empty strings
      expect(typeof entry.titleKey).toBe('string');
      expect(entry.titleKey.length).toBeGreaterThan(0);
      expect(typeof entry.defaultTitle).toBe('string');
      expect(entry.defaultTitle.length).toBeGreaterThan(0);

      // Keywords must be non-empty array of strings
      expect(Array.isArray(entry.keywords)).toBe(true);
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it('renders all catalog target IDs in the DOM when SettingsPage is mounted', async () => {
    const testQueryClient = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={testQueryClient}>
        <SettingsPage />
      </QueryClientProvider>
    );

    // Wait for async sections (e.g. metadata preferences) to finish loading
    await vi.waitFor(() => {
      const missingIds: string[] = [];

      for (const entry of settingsCatalog) {
        const el = container.querySelector(`#${entry.id}`);
        if (!el) {
          missingIds.push(`${entry.id} (section: ${entry.sectionKey})`);
        }
      }

      expect(
        missingIds,
        `Expected all catalog IDs to exist in the rendered SettingsPage DOM, but found missing: ${missingIds.join(', ')}`
      ).toEqual([]);
    });
  });
});
