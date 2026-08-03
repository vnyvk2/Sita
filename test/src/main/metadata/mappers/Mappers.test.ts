import { describe, expect, it } from 'vitest';

import type {
  AlbumPersistenceDTO,
  ArtistPersistenceDTO,
  GenrePersistenceDTO,
  PlaylistPersistenceDTO,
  SongPersistenceDTO
} from '@main/metadata/models/dtos';

import { AlbumMapper } from '@main/metadata/mappers/AlbumMapper';
import { ArtistMapper } from '@main/metadata/mappers/ArtistMapper';
import { GenreMapper } from '@main/metadata/mappers/GenreMapper';
import { MapperRegistry } from '@main/metadata/mappers/MapperRegistry';
import { PlaylistMapper } from '@main/metadata/mappers/PlaylistMapper';
import { SongMapper } from '@main/metadata/mappers/SongMapper';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';

describe('Entity Mappers & MapperRegistry', () => {
  it('should map SongPersistenceDTO to MetadataEntity', () => {
    const mapper = new SongMapper();
    const dto: SongPersistenceDTO = {
      id: 42,
      title: 'Bohemian Rhapsody',
      artists: [{ artist: { id: 1, name: 'Queen' } }],
      albums: [{ album: { id: 2, title: 'A Night at the Opera' } }],
      genres: [{ genre: { id: 3, name: 'Rock' } }],
      year: 1975
    };

    const entity = mapper.map(dto);
    expect(entity.kind).toBe(MetadataKinds.Song);
    expect(entity.getField<string>('title')?.value).toBe('Bohemian Rhapsody');
    expect(entity.getField<string[]>('artist')?.value).toEqual(['Queen']);
    expect(entity.getField<string>('album')?.value).toBe('A Night at the Opera');
    expect(entity.getField<number>('year')?.value).toBe(1975);
  });

  it('should map ArtistPersistenceDTO, AlbumPersistenceDTO, GenrePersistenceDTO, PlaylistPersistenceDTO', () => {
    const artistMapper = new ArtistMapper();
    const artistEntity = artistMapper.map({ id: 1, name: 'Pink Floyd' });
    expect(artistEntity.getField<string>('artist')?.value).toBe('Pink Floyd');

    const albumMapper = new AlbumMapper();
    const albumEntity = albumMapper.map({ id: 2, title: 'The Dark Side of the Moon' });
    expect(albumEntity.getField<string>('album')?.value).toBe('The Dark Side of the Moon');

    const genreMapper = new GenreMapper();
    const genreEntity = genreMapper.map({ id: 3, name: 'Progressive Rock' });
    expect(genreEntity.getField<string>('genre')?.value).toBe('Progressive Rock');

    const playlistMapper = new PlaylistMapper();
    const playlistEntity = playlistMapper.map({ id: 4, name: 'Favorites' });
    expect(playlistEntity.getField<string>('title')?.value).toBe('Favorites');
  });

  it('should register and retrieve mappers in MapperRegistry', () => {
    const registry = new MapperRegistry();
    expect(registry.has(MetadataKinds.Song)).toBe(true);
    expect(registry.has(MetadataKinds.Artist)).toBe(true);
    expect(registry.get(MetadataKinds.Song)).toBeInstanceOf(SongMapper);
  });
});
