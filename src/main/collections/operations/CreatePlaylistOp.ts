import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';

import type { CreatePlaylistInput } from '../../../common/collections/operationInputs';

export class CreatePlaylistOp implements CollectionOperation<CreatePlaylistInput, number> {
  private repository: PlaylistRepository;

  constructor(repository: PlaylistRepository = new PlaylistRepository()) {
    this.repository = repository;
  }

  public async execute(
    input: CreatePlaylistInput,
    ctx: OperationContext
  ): Promise<OperationResult<number>> {
    const inserted = await this.repository.createPlaylist({
      name: input.name,
      parentId: input.parentId ?? null,
      playlistType: 'standard'
    }, ctx.trx);

    return {
      data: inserted.id,
      collectionId: createCollectionId('local', 'playlist', inserted.id),
      operationType: 'playlist.createPlaylist',
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
