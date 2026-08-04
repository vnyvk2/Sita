export const MetadataFields = {
  Title: 'title',
  Artist: 'artist',
  Album: 'album',
  Genre: 'genre',
  Mood: 'mood',
  Tag: 'tag',
  Tags: 'tags',
  BPM: 'bpm',
  Year: 'year',
  Language: 'language',
  Comment: 'comment',
  Rating: 'rating',
  Composer: 'composer'
} as const;

export type BuiltInFieldId =
  (typeof MetadataFields)[keyof typeof MetadataFields];

export type FieldId = BuiltInFieldId | string;

export type MetadataFieldId = FieldId;
