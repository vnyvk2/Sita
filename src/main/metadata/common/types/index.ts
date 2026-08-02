export const MetadataCapabilities = {
  Genre: 'Genre',
  Mood: 'Mood',
  Lyrics: 'Lyrics',
  Images: 'Images',
  Biography: 'Biography',
  Rating: 'Rating',
  ReplayGain: 'ReplayGain',
  AudioFeatures: 'AudioFeatures',
  Tags: 'Tags',
  BPM: 'BPM',
  Key: 'Key'
} as const;

export type MetadataCapability =
  (typeof MetadataCapabilities)[keyof typeof MetadataCapabilities];

export const ValueStatuses = {
  Verified: 'Verified',
  Pending: 'Pending',
  Conflict: 'Conflict',
  Rejected: 'Rejected',
  Imported: 'Imported'
} as const;

export type ValueStatus = (typeof ValueStatuses)[keyof typeof ValueStatuses];

export type FieldValueType = 'string' | 'number' | 'boolean' | 'string[]' | 'object';
