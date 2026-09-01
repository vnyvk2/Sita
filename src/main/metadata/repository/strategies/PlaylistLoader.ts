import { db } from '@db/db';
import { playlists, playlistEntries } from '@db/schema';
import { eq, inArray, asc } from 'drizzle-orm';

import type { PlaylistPersistenceDTO } from '../../models/dtos';
import { MetadataKinds } from '../../models/MetadataKind';
import type { IEntityLoader } from './IEntityLoader';

const PLAYLIST_RELATIONS = {
  entries: {
    with: { song: { columns: { id: true } } },
    orderBy: asc(playlistEntries.position)
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

export class PlaylistLoader implements IEntityLoader<PlaylistPersistenceDTO> {
  public readonly kind = MetadataKinds.Playlist;

  public async load(
    id: string | number,
    trx: DB | DBTransaction = db
  ): Promise<PlaylistPersistenceDTO | null> {
    const playlistId = typeof id === 'number' ? id : parseInt(id, 10);
    if (isNaN(playlistId)) return null;

    const row = await trx.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
      with: PLAYLIST_RELATIONS
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
      where: inArray(playlists.id, playlistIds),
      with: PLAYLIST_RELATIONS
    });

    return rows;
  }
}
