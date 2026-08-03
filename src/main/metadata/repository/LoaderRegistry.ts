import type { MetadataKind } from '../models/MetadataKind';
import type { IEntityLoader } from './strategies/IEntityLoader';

import { MetadataKinds } from '../models/MetadataKind';
import { AlbumLoader } from './strategies/AlbumLoader';
import { ArtistLoader } from './strategies/ArtistLoader';
import { GenreLoader } from './strategies/GenreLoader';
import { PlaylistLoader } from './strategies/PlaylistLoader';
import { SongLoader } from './strategies/SongLoader';

export class LoaderRegistry {
  private readonly loaders: Map<MetadataKind, IEntityLoader<unknown>> = new Map();

  constructor(customLoaders?: IEntityLoader<unknown>[]) {
    if (customLoaders) {
      for (const loader of customLoaders) {
        this.loaders.set(loader.kind, loader);
      }
    } else {
      this.registerDefaults();
    }
  }

  public register<T>(loader: IEntityLoader<T>): void {
    this.loaders.set(loader.kind, loader as IEntityLoader<unknown>);
  }

  public get<T>(kind: MetadataKind): IEntityLoader<T> | undefined {
    return this.loaders.get(kind) as IEntityLoader<T> | undefined;
  }

  public has(kind: MetadataKind): boolean {
    return this.loaders.has(kind);
  }

  private registerDefaults(): void {
    this.loaders.set(MetadataKinds.Song, new SongLoader() as IEntityLoader<unknown>);
    this.loaders.set(MetadataKinds.Artist, new ArtistLoader() as IEntityLoader<unknown>);
    this.loaders.set(MetadataKinds.Album, new AlbumLoader() as IEntityLoader<unknown>);
    this.loaders.set(MetadataKinds.Genre, new GenreLoader() as IEntityLoader<unknown>);
    this.loaders.set(MetadataKinds.Playlist, new PlaylistLoader() as IEntityLoader<unknown>);
  }
}
