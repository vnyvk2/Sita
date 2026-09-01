import { createCollectionId } from '../../../common/collections/id';
import type { RenameInput } from '../../../common/collections/operationInputs';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export class RenameOp implements CollectionOperation<RenameInput, void> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(input: RenameInput, ctx: OperationContext): Promise<OperationResult<void>> {
    const { playlistId, newName } = input;
    if (!newName.trim()) {
      throw new Error('Playlist name cannot be empty');
    }

    const playlist = await this.repository.getById(playlistId, ctx.trx);
    if (!playlist) {
      throw new Error(`Playlist ${playlistId} not found`);
    }

    await this.repository.updatePlaylist(playlistId, { name: newName.trim() }, ctx.trx);

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.rename',
      operationInput: { playlistId, newName },
      inverseInput: {
        operationType: 'playlist.rename',
        input: { playlistId, newName: playlist.name }
      },
      version: 1,
      affectedSongIds: [] // renaming doesn't affect membership
    };
  }
}
