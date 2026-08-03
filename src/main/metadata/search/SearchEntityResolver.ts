import type { SearchMatchReference } from '@main/search/models/SearchMatchReference';
import { MetadataIdentity } from '../models/MetadataIdentity';
import { MetadataKinds } from '../models/MetadataKind';

export class SearchEntityResolver {
  public static toMetadataIdentity(kindName: string, id: string | number): MetadataIdentity {
    const normalizedKind = kindName.trim().toLowerCase();
    switch (normalizedKind) {
      case 'song':
      case 'songs':
        return new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: id });
      case 'artist':
      case 'artists':
        return new MetadataIdentity({ entityKind: MetadataKinds.Artist, entityId: id });
      case 'album':
      case 'albums':
        return new MetadataIdentity({ entityKind: MetadataKinds.Album, entityId: id });
      case 'genre':
      case 'genres':
        return new MetadataIdentity({ entityKind: MetadataKinds.Genre, entityId: id });
      case 'playlist':
      case 'playlists':
        return new MetadataIdentity({ entityKind: MetadataKinds.Playlist, entityId: id });
      default:
        return new MetadataIdentity({ entityKind: kindName as any, entityId: id });
    }
  }

  public static toMetadataIdentities(items: SearchMatchReference[]): MetadataIdentity[] {
    return items.map((item) => this.toMetadataIdentity(item.kind, item.id));
  }
}
