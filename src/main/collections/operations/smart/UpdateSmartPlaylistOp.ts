import { smartPlaylistRules } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { createCollectionId } from '../../../../common/collections/id';
import type { CollectionOperation, OperationContext, OperationResult } from '../types';
import type { SmartPlaylistDefinition, SmartPlaylistRuleAST, OrderDefinition } from '../../query/ast';
import { DependencyAnalyzer } from '../../engine/DependencyAnalyzer';

export interface UpdateSmartPlaylistInput {
  playlistId: number;
  definition: SmartPlaylistDefinition;
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
        ruleVersion: smartPlaylistRules.ruleVersion
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

    // Apply update
    const [updated] = await ctx.trx
      .update(smartPlaylistRules)
      .set({
        ruleAst: definition.rule,
        sortDefinition: definition.orderBy,
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
      operationInput: { playlistId, definition },
      inverseInput: {
        operationType: 'playlist.updateSmartRule',
        input: { playlistId, definition: previousDefinition }
      },
      version: updated.version,
      affectedSongIds: [] // No direct song additions from the rule change itself, engine regenerates later
    };
  }
}
