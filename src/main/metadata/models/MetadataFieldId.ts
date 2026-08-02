export const MetadataFields = {
  Title: 'title',
  Artist: 'artist',
  Album: 'album',
  Genre: 'genre',
  Mood: 'mood',
  Tag: 'tag',
  BPM: 'bpm',
  Year: 'year'
} as const;

export type BuiltInMetadataFieldId =
  (typeof MetadataFields)[keyof typeof MetadataFields];

export type MetadataFieldId = BuiltInMetadataFieldId | string;
