import type { MetadataProviderId } from './provider';

export interface SearchRankingWeights {
  artistMatch: number;
  titleMatch: number;
  officialStatus: number;
  bootlegPenalty: number;
  primaryTypeAlbum: number;
  primaryTypeEP: number;
  compilationPenalty: number;
  livePenalty: number;
  trackCountMatch: number;
  editionBoost: number;
  remasterBoost: number;
}

export const DEFAULT_SEARCH_RANKING_WEIGHTS: SearchRankingWeights = {
  artistMatch: 30,
  titleMatch: 30,
  officialStatus: 20,
  bootlegPenalty: -25,
  primaryTypeAlbum: 15,
  primaryTypeEP: 10,
  compilationPenalty: -15,
  livePenalty: -15,
  trackCountMatch: 10,
  editionBoost: 12,
  remasterBoost: 10
};

export const RANKING_WEIGHT_MIN = -100;
export const RANKING_WEIGHT_MAX = 200;

export type EnrichmentFieldKind = 'artwork' | 'genre' | 'lyrics';

export const ENRICHMENT_FIELD_CAPABILITIES: Record<
  EnrichmentFieldKind,
  readonly MetadataProviderId[]
> = {
  artwork: ['coverartarchive'],
  genre: ['discogs', 'musicbrainz'],
  lyrics: ['lrclib']
};

export interface MetadataProviderPreferences {
  enabledSearchProviders: MetadataProviderId[];
  searchProviderPriority: MetadataProviderId[];
  defaultArtworkProvider: MetadataProviderId;
  defaultGenreProvider: MetadataProviderId;
  defaultLyricsProvider: MetadataProviderId;
  searchRankingWeights?: SearchRankingWeights;
}

export const DEFAULT_METADATA_PREFERENCES: MetadataProviderPreferences = {
  enabledSearchProviders: ['musicbrainz'],
  searchProviderPriority: ['musicbrainz'],
  defaultArtworkProvider: 'coverartarchive',
  defaultGenreProvider: 'discogs',
  defaultLyricsProvider: 'lrclib'
};
