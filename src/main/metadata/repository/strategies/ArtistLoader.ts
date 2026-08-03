import { db } from '@db/db';
import { artists } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';

import type { ArtistPersistenceDTO } from '../../models/dtos';
import type { IEntityLoader } from './IEntityLoader';

import { MetadataKinds } from '../../models/MetadataKind';

const ARTIST_RELATIONS = {
  albums: {
    with: {
      album: {
        columns: { id: true, title: true }
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

export class ArtistLoader implements IEntityLoader<ArtistPersistenceDTO> {
  public readonly kind = MetadataKinds.Artist;

  public async load(
    id: string | number,
    trx: DB | DBTransaction = db
  ): Promise<ArtistPersistenceDTO | null> {
    const artistId = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(artistId)) return null;

    const row = await trx.query.artists.findFirst({
      where: eq(artists.id, artistId),
      with: ARTIST_RELATIONS
    });

    return row ?? null;
  }

  public async loadMany(
    ids: (string | number)[],
    trx: DB | DBTransaction = db
  ): Promise<ArtistPersistenceDTO[]> {
    if (ids.length === 0) return [];
    const artistIds = ids
      .map((id) => (typeof id === 'number' ? id : parseInt(id, 10)))
      .filter((id) => !isNaN(id));

    if (artistIds.length === 0) return [];

    const rows = await trx.query.artists.findMany({
      where: inArray(artists.id, artistIds),
      with: ARTIST_RELATIONS
    });

    return rows;
  }
}
