import { db } from '@db/db';
import { songs } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';

import type { SongPersistenceDTO } from '../../models/dtos';
import type { IEntityLoader } from './IEntityLoader';

import { MetadataKinds } from '../../models/MetadataKind';

const SONG_RELATIONS = {
  artists: {
    with: {
      artist: {
        columns: { id: true, name: true }
      }
    }
  },
  albums: {
    with: {
      album: {
        columns: { id: true, title: true }
      }
    }
  },
  genres: {
    with: {
      genre: {
        columns: { id: true, name: true }
      }
    }
  }
} as const;

export class SongLoader implements IEntityLoader<SongPersistenceDTO> {
  public readonly kind = MetadataKinds.Song;

  public async load(
    id: string | number,
    trx: DB | DBTransaction = db
  ): Promise<SongPersistenceDTO | null> {
    const songId = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(songId)) return null;

    const row = await trx.query.songs.findFirst({
      where: eq(songs.id, songId),
      with: SONG_RELATIONS
    });

    return row ?? null;
  }

  public async loadMany(
    ids: (string | number)[],
    trx: DB | DBTransaction = db
  ): Promise<SongPersistenceDTO[]> {
    if (ids.length === 0) return [];
    const songIds = ids
      .map((id) => (typeof id === 'number' ? id : parseInt(id, 10)))
      .filter((id) => !isNaN(id));

    if (songIds.length === 0) return [];

    const rows = await trx.query.songs.findMany({
      where: inArray(songs.id, songIds),
      with: SONG_RELATIONS
    });

    return rows;
  }
}
