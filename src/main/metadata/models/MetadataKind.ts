export const MetadataKinds = {
  Song: 'song',
  Album: 'album',
  Artist: 'artist',
  Genre: 'genre',
  Playlist: 'playlist',
  Tag: 'tag',
  Provider: 'provider'
} as const;

export type MetadataKind = (typeof MetadataKinds)[keyof typeof MetadataKinds];
