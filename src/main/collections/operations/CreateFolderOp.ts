import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { db } from '../../db/db';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';

export interface CreateFolderInput {
  name: string;
  parentId?: number | null;
}

export class CreateFolderOp implements CollectionOperation<CreateFolderInput, number> {
  private repository: PlaylistRepository;

  constructor(repository: PlaylistRepository = new PlaylistRepository()) {
    this.repository = repository;
  }

  public async execute(
    input: CreateFolderInput,
    ctx: OperationContext
  ): Promise<OperationResult<number>> {
    const inserted = await this.repository.createPlaylist({
      name: input.name,
      parentId: input.parentId ?? null,
      playlistType: 'folder'
    }, ctx.trx);

    return {
      data: inserted.id,
      collectionId: createCollectionId('local', 'playlist', inserted.id),
      operationType: 'playlist.createFolder',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.delete',
        input: { playlistId: inserted.id }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
