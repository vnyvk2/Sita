import {
  SMART_PLAYLIST_FIELDS,
  type SmartPlaylistField,
  type SmartPlaylistOperator,
  type SmartPlaylistRuleAST
} from '@common/collections/smartPlaylist';
import { SmartPlaylistCompiler } from '@main/collections/query/SmartPlaylistCompiler';

describe('SmartPlaylistCompiler', () => {
  const compiler = new SmartPlaylistCompiler();

  describe('compilePredicate - Exhaustiveness for SMART_PLAYLIST_FIELDS x allowedOperators', () => {
    const sampleValueForField = (
      field: SmartPlaylistField,
      operator: SmartPlaylistOperator
    ): unknown => {
      if (operator === 'is_true' || operator === 'is_false') return true;
      if (operator === 'is_null' || operator === 'is_not_null') return null;
      if (operator === 'in_last' || operator === 'not_in_last') return 30; // 30 days
      const meta = SMART_PLAYLIST_FIELDS[field];
      if (meta.type === 'number') return 100;
      if (meta.type === 'date') return 7;
      if (meta.type === 'boolean') return true;
      return 'TestValue';
    };

    for (const [fieldName, meta] of Object.entries(SMART_PLAYLIST_FIELDS) as [
      SmartPlaylistField,
      (typeof SMART_PLAYLIST_FIELDS)[SmartPlaylistField]
    ][]) {
      for (const operator of meta.allowedOperators) {
        it(`compiles field "${fieldName}" with operator "${operator}" without throwing`, () => {
          const rule: SmartPlaylistRuleAST = {
            type: 'condition',
            field: fieldName,
            operator,
            value: sampleValueForField(fieldName, operator)
          };

          const sqlChunk = compiler.compilePredicate(rule);
          expect(sqlChunk).toBeDefined();
          // Verify generated SQL chunk has query chunks
          expect((sqlChunk as any).queryChunks).toBeDefined();
        });
      }
    }
  });

  describe('compilePredicate - Logical groups and nesting', () => {
    it('compiles AND groups and OR groups correctly', () => {
      const andGroup: SmartPlaylistRuleAST = {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'title', operator: 'contains', value: 'rock' },
          { type: 'condition', field: 'duration', operator: 'gt', value: 180 }
        ]
      };
      const andSql = compiler.compilePredicate(andGroup);
      expect(andSql).toBeDefined();

      const orGroup: SmartPlaylistRuleAST = {
        type: 'group',
        logicalOperator: 'or',
        rules: [
          { type: 'condition', field: 'genre', operator: 'eq', value: 'Rock' },
          { type: 'condition', field: 'genre', operator: 'eq', value: 'Pop' }
        ]
      };
      const orSql = compiler.compilePredicate(orGroup);
      expect(orSql).toBeDefined();
    });

    it('returns undefined for empty groups', () => {
      const emptyGroup: SmartPlaylistRuleAST = {
        type: 'group',
        logicalOperator: 'and',
        rules: []
      };
      expect(compiler.compilePredicate(emptyGroup)).toBeUndefined();
    });

    it('compiles nested groups up to depth 3', () => {
      const nested: SmartPlaylistRuleAST = {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          {
            type: 'group',
            logicalOperator: 'or',
            rules: [
              {
                type: 'group',
                logicalOperator: 'and',
                rules: [
                  { type: 'condition', field: 'year', operator: 'gte', value: 2000 },
                  { type: 'condition', field: 'isFavorite', operator: 'is_true', value: true }
                ]
              },
              { type: 'condition', field: 'playCount', operator: 'gt', value: 10 }
            ]
          },
          { type: 'condition', field: 'isBlacklisted', operator: 'is_false', value: false }
        ]
      };
      const result = compiler.compilePredicate(nested);
      expect(result).toBeDefined();
    });
  });

  describe('compileOrderBy', () => {
    it('appends deterministic songs.id ASC tiebreaker', () => {
      const orderBy = compiler.compileOrderBy([
        { field: 'duration', direction: 'desc' },
        { field: 'title', direction: 'asc' }
      ]);

      // Should have 2 specified orders + 1 tiebreaker = 3 order chunks
      expect(orderBy.length).toBe(3);
    });

    it('includes tiebreaker even when no explicit order fields are passed', () => {
      const orderBy = compiler.compileOrderBy([]);
      expect(orderBy.length).toBe(1);
    });
  });

  describe('Field-specific compilation expressions', () => {
    it('handles playCount via play_events subquery', () => {
      const col = compiler.getExpressionForField('playCount');
      expect(col).toBeDefined();
      expect((col as any).queryChunks).toBeDefined();
    });

    it('handles skipCount with coalesce protection', () => {
      const col = compiler.getExpressionForField('skipCount');
      expect(col).toBeDefined();
      expect((col as any).queryChunks).toBeDefined();
    });

    it('handles bitRate column directly', () => {
      const col = compiler.getExpressionForField('bitRate');
      expect(col).toBeDefined();
      expect((col as any).name).toBe('bit_rate');
    });
  });
});
