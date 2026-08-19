import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MetadataPreferencesService } from '../MetadataPreferencesService';
import { DEFAULT_METADATA_PREFERENCES } from '../../../../common/metadata/preferences';

vi.mock('../../../db/queries/settings', () => ({
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn()
}));

import { getUserSettings, saveUserSettings } from '../../../db/queries/settings';

describe('MetadataPreferencesService', () => {
  let service: MetadataPreferencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MetadataPreferencesService();
  });

  it('returns default preferences when database settings are missing or throw', async () => {
    vi.mocked(getUserSettings).mockRejectedValueOnce(new Error('DB not found'));
    const prefs = await service.getPreferences();
    expect(prefs).toEqual(DEFAULT_METADATA_PREFERENCES);
  });

  it('returns stored preferences when valid settings exist', async () => {
    vi.mocked(getUserSettings).mockResolvedValueOnce({
      metadataPreferences: {
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['discogs', 'musicbrainz'],
        defaultArtworkProvider: 'coverartarchive',
        defaultGenreProvider: 'discogs',
        defaultLyricsProvider: 'lrclib'
      }
    } as any);

    const prefs = await service.getPreferences();
    expect(prefs.enabledSearchProviders).toEqual(['musicbrainz', 'discogs']);
    expect(prefs.searchProviderPriority).toEqual(['discogs', 'musicbrainz']);
  });

  it('validates and saves valid preferences', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);
    vi.mocked(saveUserSettings).mockResolvedValueOnce(undefined as any);

    const saved = await service.savePreferences(
      {
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['musicbrainz', 'discogs']
      },
      ['musicbrainz', 'discogs', 'spotify']
    );

    expect(saved.enabledSearchProviders).toEqual(['musicbrainz', 'discogs']);
    expect(saved.searchProviderPriority).toEqual(['musicbrainz', 'discogs']);
    expect(saveUserSettings).toHaveBeenCalledWith({
      metadataPreferences: expect.objectContaining({
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['musicbrainz', 'discogs']
      })
    });
  });

  it('throws error when enabled search providers array is empty', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({ enabledSearchProviders: [] })
    ).rejects.toThrow(/at least one valid provider/);
  });

  it('throws error when priority contains duplicates', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['musicbrainz', 'musicbrainz'] as any
      })
    ).rejects.toThrow(/without duplicates/);
  });

  it('throws error when priority item is not in enabled search providers', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        enabledSearchProviders: ['musicbrainz'],
        searchProviderPriority: ['discogs']
      })
    ).rejects.toThrow(/must be one of the enabled search providers/);
  });

  it('throws error when enabled provider is not registered with search capability', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences(
        {
          enabledSearchProviders: ['unknown_provider' as any],
          searchProviderPriority: ['unknown_provider' as any]
        },
        ['musicbrainz', 'discogs']
      )
    ).rejects.toThrow(/not registered with search capability/);
  });
});
