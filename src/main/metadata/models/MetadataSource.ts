export const MetadataSourceTypes = {
  LocalTags: 'LOCAL_TAGS',
  MusicBrainz: 'MUSICBRAINZ',
  Discogs: 'DISCOGS',
  Spotify: 'SPOTIFY',
  LastFm: 'LASTFM',
  UserEdit: 'USER_EDIT',
  Plugin: 'PLUGIN',
  AI: 'AI'
} as const;

export type MetadataSourceType = (typeof MetadataSourceTypes)[keyof typeof MetadataSourceTypes];

export interface MetadataSourceOptions {
  type: MetadataSourceType;
  providerId?: string;
  priority?: number;
}

export class MetadataSource {
  public readonly type: MetadataSourceType;
  public readonly providerId?: string;
  public readonly priority: number;

  constructor(options: MetadataSourceOptions) {
    this.type = options.type;
    this.providerId = options.providerId;
    this.priority = options.priority ?? 50;
  }
}
