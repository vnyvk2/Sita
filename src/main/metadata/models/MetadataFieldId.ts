export const MetadataFields = {
  Title: 'title',
  Artist: 'artist',
  Album: 'album',
  Genre: 'genre',
  Mood: 'mood',
  Tags: 'tags',
  BPM: 'bpm',
  Year: 'year',
  Language: 'language',
  Comment: 'comment',
  Rating: 'rating',
  Composer: 'composer',
  DiscNumber: 'discNumber',
  TrackNumber: 'trackNumber'
} as const;

export type BuiltInFieldId =
  (typeof MetadataFields)[keyof typeof MetadataFields];

export type FieldId = BuiltInFieldId | string;

export type MetadataFieldId = FieldId;
