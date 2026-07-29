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

    // Inverse operation is deleting the newly created folder
    const inverse = new DeleteOp(this.repository);

    return {
      result: inserted.id,
      inverseOp: inverse,
      inverseInput: { playlistId: inserted.id }
    };
  }
}
