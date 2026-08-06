export type MetadataFieldId =
  | 'title'
  | 'artist'
  | 'album'
  | 'year'
  | 'trackNumber'
  | 'discNumber'
  | 'genre'
  | 'isrc'
  | 'musicBrainzRecordingId';

export type DiffStatus = 'changed' | 'unchanged' | 'missing' | 'new';

export interface MetadataFieldDiffAlternative {
  providerId: string;
  providerName: string;
  value: string | number;
  confidenceScore?: number;
}

export interface MetadataFieldDiff {
  fieldId: MetadataFieldId;
  fieldName: string;
  oldValue?: string | number;
  suggestedValue?: string | number;
  userValue?: string | number;
  status: DiffStatus;
  applyField: boolean;
  providerId?: string;
  providerName?: string;
  alternatives?: MetadataFieldDiffAlternative[];
}
