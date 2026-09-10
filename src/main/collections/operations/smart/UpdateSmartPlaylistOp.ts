import { eq } from 'drizzle-orm';

import { createCollectionId } from '../../../../common/collections/id';
import type { UpdateSmartPlaylistInput as BaseUpdateInput } from '../../../../common/collections/operationInputs';
import { playlists, smartPlaylistRules } from '../../../db/schema';
import { DependencyAnalyzer } from '../../engine/DependencyAnalyzer';
import type {
  SmartPlaylistDefinition,
  SmartPlaylistRuleAST,
  OrderDefinition
} from '../../query/ast';
import type { CollectionOperation, OperationContext, OperationResult } from '../types';

export interface UpdateSmartPlaylistInput extends BaseUpdateInput {
  name?: string;
}

export class UpdateSmartPlaylistOp implements CollectionOperation<UpdateSmartPlaylistInput, void> {
  public async execute(
    input: UpdateSmartPlaylistInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId, definition } = input;

    // Get current rule for inverse
    const [currentRule] = await ctx.trx
      .select({
        ruleAst: smartPlaylistRules.ruleAst,
        sortDefinition: smartPlaylistRules.sortDefinition,
        ruleVersion: smartPlaylistRules.ruleVersion,
        maxEntries: smartPlaylistRules.maxEntries
      })
      .from(smartPlaylistRules)
      .where(eq(smartPlaylistRules.playlistId, playlistId));

    if (!currentRule) {
      throw new Error(`Smart playlist ${playlistId} not found`);
    }

    const previousDefinition: SmartPlaylistDefinition = {
      rule: currentRule.ruleAst as SmartPlaylistRuleAST,
      orderBy: (currentRule.sortDefinition as OrderDefinition[]) || []
    };

    // Update playlist name if provided
    if (input.name) {
      await ctx.trx
        .update(playlists)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(playlists.id, playlistId));
    }

    // Apply rule update
    const [updated] = await ctx.trx
      .update(smartPlaylistRules)
      .set({
        ruleAst: definition.rule,
        sortDefinition: definition.orderBy,
        maxEntries: input.maxEntries !== undefined ? input.maxEntries : currentRule.maxEntries,
        dependencies: DependencyAnalyzer.extractDependencies(definition),
        updatedAt: new Date(),
        ruleVersion: currentRule.ruleVersion + 1
      })
      .where(eq(smartPlaylistRules.playlistId, playlistId))
      .returning({ version: smartPlaylistRules.ruleVersion });

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.updateSmartRule',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.updateSmartRule',
        input: {
          playlistId,
          definition: previousDefinition,
          maxEntries: currentRule.maxEntries
        }
      },
      version: updated.version,
      affectedSongIds: []
    };
  }
}
