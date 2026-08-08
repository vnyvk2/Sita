import type { MetadataFieldId } from './diff';

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
