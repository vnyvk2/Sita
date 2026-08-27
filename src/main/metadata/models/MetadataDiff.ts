export type MetadataFieldId =
  | 'title'
  | 'artist'
  | 'albumArtist'
  | 'album'
  | 'year'
  | 'trackNumber'
  | 'discNumber'
  | 'genre'
  | 'style'
  | 'artworkUrl'
  | 'isrc'
  | 'musicBrainzRecordingId';

export type DiffStatus = 'changed' | 'unchanged' | 'missing' | 'new';

export interface MetadataFieldDiff {
  fieldId: MetadataFieldId;
  fieldName: string;
  oldValue?: string | number;
  suggestedValue?: string | number;
  userValue?: string | number; // Editable by user in preview UI
  status: DiffStatus;
  applyField: boolean; // Per-field apply toggle
}
