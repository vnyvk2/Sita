import type { MetadataFieldId } from './diff';
import type { MetadataProviderId } from './provider';

export const METADATA_FIELD_DISPLAY_NAMES: Record<MetadataFieldId, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  year: 'Year',
  trackNumber: 'Track Number',
  discNumber: 'Disc Number',
  genre: 'Genre',
  style: 'Style',
  artworkUrl: 'Cover Art',
  isrc: 'ISRC',
  musicBrainzRecordingId: 'MusicBrainz ID'
};

export function getMetadataFieldDisplayName(fieldId: MetadataFieldId, fallback?: string): string {
  return METADATA_FIELD_DISPLAY_NAMES[fieldId] ?? fallback ?? String(fieldId);
}

export const PROVIDER_DISPLAY_NAMES: Record<MetadataProviderId, string> = {
  musicbrainz: 'MusicBrainz',
  discogs: 'Discogs',
  coverartarchive: 'Cover Art Archive',
  spotify: 'Spotify',
  lastfm: 'Last.fm',
  local: 'Local File',
  user: 'User Override'
};

export function getProviderDisplayName(providerId?: string, fallback = 'MusicBrainz'): string {
  if (!providerId) return fallback;
  const key = providerId.toLowerCase() as MetadataProviderId;
  return PROVIDER_DISPLAY_NAMES[key] ?? providerId;
}
