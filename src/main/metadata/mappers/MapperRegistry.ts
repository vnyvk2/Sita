import type { MetadataKind } from '../models/MetadataKind';
import { AlbumMapper } from './AlbumMapper';
import { ArtistMapper } from './ArtistMapper';
import { GenreMapper } from './GenreMapper';
import type { IMetadataMapper } from './IMetadataMapper';
import { PlaylistMapper } from './PlaylistMapper';
import { SongMapper } from './SongMapper';

export class MapperRegistry {
  private readonly mappers: Map<MetadataKind, IMetadataMapper<unknown>> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public register<T>(mapper: IMetadataMapper<T>): void {
    this.mappers.set(mapper.kind, mapper as IMetadataMapper<unknown>);
  }

  public get<T>(kind: MetadataKind): IMetadataMapper<T> | undefined {
    return this.mappers.get(kind) as IMetadataMapper<T> | undefined;
  }

  public has(kind: MetadataKind): boolean {
    return this.mappers.has(kind);
  }

  private registerDefaults(): void {
    this.register(new SongMapper());
    this.register(new ArtistMapper());
    this.register(new AlbumMapper());
    this.register(new GenreMapper());
    this.register(new PlaylistMapper());
  }
}
