import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../../../../src/main/db/db';
import { playlists, smartPlaylistRules } from '../../../../../../src/main/db/schema';
import { eq } from 'drizzle-orm';
import { UpdateSmartPlaylistOp } from '../../../../../../src/main/collections/operations/smart/UpdateSmartPlaylistOp';
import type { OperationContext } from '../../../../../../src/main/collections/operations/types';
import type { SmartPlaylistDefinition } from '../../../../../../src/main/collections/query/ast';

describe('UpdateSmartPlaylistOp', () => {
  const op = new UpdateSmartPlaylistOp();
  let playlistId: number;
  let ctx: OperationContext;

  beforeEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);

    const [pl] = await db.insert(playlists).values({
      name: 'Test Smart',
      playlistType: 'smart'
    }).returning({ id: playlists.id });
    
    playlistId = pl.id;

    await db.insert(smartPlaylistRules).values({
      playlistId,
      ruleAst: {
        type: 'group',
        logicalOperator: 'and',
        rules: []
      },
      sortDefinition: [],
      ruleVersion: 1
    });

    ctx = {
      trx: db as any,
      membershipService: {} as any
    };
  });

  afterEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);
  });

  it('should update the rule and generate an inverse', async () => {
    const newDef: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'title', operator: 'contains', value: 'Hello' }
        ]
      },
      orderBy: [
        { field: 'title', direction: 'asc' }
      ]
    };

    const result = await op.execute({ playlistId, definition: newDef }, ctx);

    // Verify DB was updated
    const [updated] = await db.select().from(smartPlaylistRules).where(eq(smartPlaylistRules.playlistId, playlistId));
    expect(updated.ruleAst).toEqual(newDef.rule);
    expect(updated.sortDefinition).toEqual(newDef.orderBy);
    expect(updated.ruleVersion).toBe(2);

    // Verify inverse
    expect(result.inverseInput.operationType).toBe('playlist.updateSmartRule');
    expect((result.inverseInput.input as any).definition.rule.rules).toHaveLength(0); // the old rule
  });
});
