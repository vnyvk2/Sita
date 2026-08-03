import { db } from '@db/db';
import { genres } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';

import type { GenrePersistenceDTO } from '../../models/dtos';
import type { IEntityLoader } from './IEntityLoader';

import { MetadataKinds } from '../../models/MetadataKind';

const GENRE_RELATIONS = {
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

export class GenreLoader implements IEntityLoader<GenrePersistenceDTO> {
  public readonly kind = MetadataKinds.Genre;

  public async load(
    id: string | number,
    trx: DB | DBTransaction = db
  ): Promise<GenrePersistenceDTO | null> {
    const genreId = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(genreId)) return null;

    const row = await trx.query.genres.findFirst({
      where: eq(genres.id, genreId),
      with: GENRE_RELATIONS
    });

    return row ?? null;
  }

  public async loadMany(
    ids: (string | number)[],
    trx: DB | DBTransaction = db
  ): Promise<GenrePersistenceDTO[]> {
    if (ids.length === 0) return [];
    const genreIds = ids
      .map((id) => (typeof id === 'number' ? id : parseInt(id, 10)))
      .filter((id) => !isNaN(id));

    if (genreIds.length === 0) return [];

    const rows = await trx.query.genres.findMany({
      where: inArray(genres.id, genreIds),
      with: GENRE_RELATIONS
    });

    return rows;
  }
}
