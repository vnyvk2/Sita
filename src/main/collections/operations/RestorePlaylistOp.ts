import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';
import { RestoreSongsInput } from './RestoreSongsOp';

export interface RestorePlaylistInput {
  playlist: {
    id: number;
    name: string;
    description?: string | null;
    parentId?: number | null;
    playlistType: string;
    itemCount: number;
    totalDuration: string;
    sidebarPosition?: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  entries: RestoreSongsInput['entries'];
}

export class RestorePlaylistOp implements CollectionOperation<RestorePlaylistInput, void> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: RestorePlaylistInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlist, entries } = input;

    const playlistToInsert = {
      ...playlist,
      createdAt: typeof playlist.createdAt === 'string' ? new Date(playlist.createdAt) : playlist.createdAt,
      updatedAt: typeof playlist.updatedAt === 'string' ? new Date(playlist.updatedAt) : playlist.updatedAt,
    };

    await this.repository.restorePlaylistWithId(playlistToInsert as any, ctx.trx);

    if (entries.length > 0) {
      const entriesToInsert = entries.map(e => {
        return {
          ...e,
          addedAt: typeof e.addedAt === 'string' ? new Date(e.addedAt) : e.addedAt,
          createdAt: typeof e.createdAt === 'string' ? new Date(e.createdAt) : e.createdAt,
          updatedAt: typeof e.updatedAt === 'string' ? new Date(e.updatedAt) : e.updatedAt,
        };
      });
      await this.repository.insertEntries(entriesToInsert as any, ctx.trx);
    }

    const affectedSongIds = Array.from(new Set(entries.map(e => e.songId)));

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlist.id),
      operationType: 'playlist.restore',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.delete',
        input: { playlistId: playlist.id }
      },
      version: 1,
      affectedSongIds
    };
  }
}
