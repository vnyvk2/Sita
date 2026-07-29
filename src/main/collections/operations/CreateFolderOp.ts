import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { DeleteOp } from './DeleteOp';
import { PlaylistRepository } from '../repositories/PlaylistRepository';

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
    const [inserted] = await ctx.trx.insert(playlists)
      .values({
        name: input.name,
        parentId: input.parentId ?? null,
        playlistType: 'folder'
      })
      .returning({ id: playlists.id });

    const inverse = new DeleteOp(this.repository);

    return {
      data: inserted.id,
      collectionId: `local:playlist:${inserted.id}` as any, // Temporary cast or import createCollectionId
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
