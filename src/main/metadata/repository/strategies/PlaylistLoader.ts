import { db } from '@db/db';
import { playlists } from '@db/schema';
import { eq, inArray } from 'drizzle-orm';

import type { PlaylistPersistenceDTO } from '../../models/dtos';
import type { IEntityLoader } from './IEntityLoader';

import { MetadataKinds } from '../../models/MetadataKind';

export class PlaylistLoader implements IEntityLoader<PlaylistPersistenceDTO> {
  public readonly kind = MetadataKinds.Playlist;

  public async load(
    id: string | number,
    trx: DB | DBTransaction = db
  ): Promise<PlaylistPersistenceDTO | null> {
    const playlistId = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(playlistId)) return null;

    const row = await trx.query.playlists.findFirst({
      where: eq(playlists.id, playlistId)
    });

    return row ?? null;
  }

  public async loadMany(
    ids: (string | number)[],
    trx: DB | DBTransaction = db
  ): Promise<PlaylistPersistenceDTO[]> {
    if (ids.length === 0) return [];
    const playlistIds = ids
      .map((id) => (typeof id === 'number' ? id : parseInt(id, 10)))
      .filter((id) => !isNaN(id));

    if (playlistIds.length === 0) return [];

    const rows = await trx.query.playlists.findMany({
      where: inArray(playlists.id, playlistIds)
    });

    return rows;
  }
}
