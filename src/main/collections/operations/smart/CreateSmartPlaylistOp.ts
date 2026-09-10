import { createCollectionId } from '../../../../common/collections/id';
import type { CreateSmartPlaylistInput } from '../../../../common/collections/operationInputs';
import { playlists, smartPlaylistRules } from '../../../db/schema';
import { DependencyAnalyzer } from '../../engine/DependencyAnalyzer';
import type { CollectionOperation, OperationContext, OperationResult } from '../types';

export class CreateSmartPlaylistOp implements CollectionOperation<
  CreateSmartPlaylistInput,
  number
> {
  public async execute(
    input: CreateSmartPlaylistInput,
    ctx: OperationContext
  ): Promise<OperationResult<number>> {
    const [inserted] = await ctx.trx
      .insert(playlists)
      .values({
        name: input.name,
        parentId: input.parentId ?? null,
        playlistType: 'smart'
      })
      .returning();

    const dependencies = DependencyAnalyzer.extractDependencies(input.definition);

    await ctx.trx.insert(smartPlaylistRules).values({
      playlistId: inserted.id,
      ruleAst: input.definition.rule,
      sortDefinition: input.definition.orderBy,
      maxEntries: input.maxEntries ?? null,
      dependencies,
      ruleVersion: 1
    });

    return {
      data: inserted.id,
      collectionId: createCollectionId('local', 'playlist', inserted.id),
      operationType: 'playlist.createSmartPlaylist',
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
