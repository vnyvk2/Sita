import { db } from '@db/db';
import { albums } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';

import type { AlbumPersistenceDTO } from '../../models/dtos';
import { MetadataKinds } from '../../models/MetadataKind';
import type { IEntityLoader } from './IEntityLoader';

const ALBUM_RELATIONS = {
  artists: {
    with: {
      artist: {
        columns: { id: true, name: true }
      }
    }
  },
  songs: {
    with: {
      song: {
        columns: { id: true, title: true }
      }
    }
  },
  artworks: {
    with: {
      artwork: {
        with: {
          palette: {
            columns: { id: true },
            with: {
              swatches: {}
            }
          }
        }
      }
    }
  }
} as const;

export class AlbumLoader implements IEntityLoader<AlbumPersistenceDTO> {
  public readonly kind = MetadataKinds.Album;

  public async load(
    id: string | number,
    trx: DB | DBTransaction = db
  ): Promise<AlbumPersistenceDTO | null> {
    const albumId = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(albumId)) return null;

    const row = await trx.query.albums.findFirst({
      where: eq(albums.id, albumId),
      with: ALBUM_RELATIONS
    });

    return row ?? null;
  }

  public async loadMany(
    ids: (string | number)[],
    trx: DB | DBTransaction = db
  ): Promise<AlbumPersistenceDTO[]> {
    if (ids.length === 0) return [];
    const albumIds = ids
      .map((id) => (typeof id === 'number' ? id : parseInt(id, 10)))
      .filter((id) => !isNaN(id));

    if (albumIds.length === 0) return [];

    const rows = await trx.query.albums.findMany({
      where: inArray(albums.id, albumIds),
      with: ALBUM_RELATIONS
    });

    return rows;
  }
}
