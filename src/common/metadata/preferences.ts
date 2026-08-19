import type { MetadataProviderId } from './provider';

export interface MetadataProviderPreferences {
  enabledSearchProviders: MetadataProviderId[];
  searchProviderPriority: MetadataProviderId[];
  defaultArtworkProvider: MetadataProviderId;
  defaultGenreProvider: MetadataProviderId;
  defaultLyricsProvider: MetadataProviderId;
}

export const DEFAULT_METADATA_PREFERENCES: MetadataProviderPreferences = {
  enabledSearchProviders: ['musicbrainz'],
  searchProviderPriority: ['musicbrainz'],
  defaultArtworkProvider: 'coverartarchive',
  defaultGenreProvider: 'discogs',
  defaultLyricsProvider: 'lrclib'
};
