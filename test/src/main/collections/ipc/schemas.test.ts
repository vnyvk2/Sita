import {
  createSmartPlaylistInputSchema,
  previewSmartPlaylistInputSchema,
  smartPlaylistDefinitionSchema,
  smartPlaylistRuleASTSchema,
  updateSmartPlaylistInputSchema,
  getAstDepth,
  hasEmptyGroup
} from '@main/collections/ipc/schemas';

describe('Smart Playlist IPC Schemas', () => {
  describe('Depth calculation and enforcement', () => {
    it('calculates depth accurately', () => {
      const depth1 = {
        type: 'condition' as const,
        field: 'title' as const,
        operator: 'contains' as const,
        value: 'test'
      };
      expect(getAstDepth(depth1)).toBe(1);

      const depth2 = {
        type: 'group' as const,
        logicalOperator: 'and' as const,
        rules: [depth1]
      };
      expect(getAstDepth(depth2)).toBe(2);

      const depth3 = {
        type: 'group' as const,
        logicalOperator: 'or' as const,
        rules: [depth2]
      };
      expect(getAstDepth(depth3)).toBe(3);

      const depth4 = {
        type: 'group' as const,
        logicalOperator: 'and' as const,
        rules: [depth3]
      };
      expect(getAstDepth(depth4)).toBe(4);
    });

    it('accepts ASTs with depth <= 3', () => {
      const validAst = {
        type: 'group' as const,
        logicalOperator: 'and' as const,
        rules: [
          {
            type: 'group' as const,
            logicalOperator: 'or' as const,
            rules: [
              {
                type: 'condition' as const,
                field: 'year' as const,
                operator: 'gte' as const,
                value: 2020
              }
            ]
          }
        ]
      };
      const result = smartPlaylistRuleASTSchema.safeParse(validAst);
      expect(result.success).toBe(true);
    });

    it('rejects ASTs with depth > 3', () => {
      const deepAst = {
        type: 'group' as const,
        logicalOperator: 'and' as const,
        rules: [
          {
            type: 'group' as const,
            logicalOperator: 'or' as const,
            rules: [
              {
                type: 'group' as const,
                logicalOperator: 'and' as const,
                rules: [
                  {
                    type: 'condition' as const,
                    field: 'title' as const,
                    operator: 'eq' as const,
                    value: 'deep'
                  }
                ]
              }
            ]
          }
        ]
      };
      const result = smartPlaylistRuleASTSchema.safeParse(deepAst);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('exceeds maximum allowed of 3');
      }
    });
  });

  describe('Empty group validation', () => {
    it('detects empty groups accurately', () => {
      expect(
        hasEmptyGroup({
          type: 'group',
          logicalOperator: 'and',
          rules: []
        })
      ).toBe(true);

      expect(
        hasEmptyGroup({
          type: 'group',
          logicalOperator: 'and',
          rules: [
            {
              type: 'group',
              logicalOperator: 'or',
              rules: []
            }
          ]
        })
      ).toBe(true);

      expect(
        hasEmptyGroup({
          type: 'group',
          logicalOperator: 'and',
          rules: [
            {
              type: 'condition',
              field: 'title',
              operator: 'contains',
              value: 'test'
            }
          ]
        })
      ).toBe(false);
    });

    it('rejects rule group when empty', () => {
      const emptyGroup = {
        type: 'group' as const,
        logicalOperator: 'and' as const,
        rules: []
      };
      const result = smartPlaylistRuleASTSchema.safeParse(emptyGroup);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('cannot be empty'))).toBe(true);
      }
    });
  });

  describe('Input schemas validation', () => {
    const validDefinition = {
      rule: {
        type: 'group' as const,
        logicalOperator: 'and' as const,
        rules: [
          {
            type: 'condition' as const,
            field: 'duration' as const,
            operator: 'gt' as const,
            value: 60
          }
        ]
      },
      orderBy: [{ field: 'duration' as const, direction: 'asc' as const }]
    };

    it('validates previewSmartPlaylistInputSchema', () => {
      const parsed = previewSmartPlaylistInputSchema.safeParse({
        definition: validDefinition,
        maxEntries: 50
      });
      expect(parsed.success).toBe(true);
    });

    it('validates createSmartPlaylistInputSchema', () => {
      const parsed = createSmartPlaylistInputSchema.safeParse({
        name: 'My Smart Playlist',
        definition: validDefinition,
        maxEntries: null
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects createSmartPlaylistInputSchema with empty name', () => {
      const parsed = createSmartPlaylistInputSchema.safeParse({
        name: '',
        definition: validDefinition
      });
      expect(parsed.success).toBe(false);
    });

    it('validates updateSmartPlaylistInputSchema', () => {
      const parsed = updateSmartPlaylistInputSchema.safeParse({
        playlistId: 42,
        name: 'Updated Name',
        definition: validDefinition,
        maxEntries: 100
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects disallowed operator for field according to metadata', () => {
      const invalidFieldOperator = {
        rule: {
          type: 'group' as const,
          logicalOperator: 'and' as const,
          rules: [
            {
              type: 'condition' as const,
              field: 'duration' as const,
              operator: 'contains' as const,
              value: 'short'
            }
          ]
        },
        orderBy: [{ field: 'duration' as const, direction: 'asc' as const }]
      };
      const parsed = previewSmartPlaylistInputSchema.safeParse({
        definition: invalidFieldOperator
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain(
          'Operator "contains" is not allowed for field "duration"'
        );
      }
    });

    it('rejects unary operators when value is provided', () => {
      const unaryWithValue = {
        rule: {
          type: 'group' as const,
          logicalOperator: 'and' as const,
          rules: [
            {
              type: 'condition' as const,
              field: 'isFavorite' as const,
              operator: 'is_true' as const,
              value: true
            }
          ]
        },
        orderBy: [{ field: 'title' as const, direction: 'asc' as const }]
      };
      const parsed = previewSmartPlaylistInputSchema.safeParse({
        definition: unaryWithValue
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain(
          'Unary operator "is_true" must not have a value'
        );
      }
    });

    it('validates in_last requires positive integer >= 1', () => {
      const makeInLast = (val: unknown) => ({
        rule: {
          type: 'group' as const,
          logicalOperator: 'and' as const,
          rules: [
            {
              type: 'condition' as const,
              field: 'addedAt' as const,
              operator: 'in_last' as const,
              value: val
            }
          ]
        },
        orderBy: [{ field: 'addedAt' as const, direction: 'desc' as const }]
      });

      expect(previewSmartPlaylistInputSchema.safeParse({ definition: makeInLast(0) }).success).toBe(
        false
      );
      expect(
        previewSmartPlaylistInputSchema.safeParse({ definition: makeInLast(-5) }).success
      ).toBe(false);
      expect(
        previewSmartPlaylistInputSchema.safeParse({ definition: makeInLast(1.5) }).success
      ).toBe(false);
      expect(
        previewSmartPlaylistInputSchema.safeParse({ definition: makeInLast('7') }).success
      ).toBe(false);
      expect(previewSmartPlaylistInputSchema.safeParse({ definition: makeInLast(7) }).success).toBe(
        true
      );
    });

    it('enforces maxEntries boundary between 1 and 5000', () => {
      expect(
        previewSmartPlaylistInputSchema.safeParse({
          definition: validDefinition,
          maxEntries: 0
        }).success
      ).toBe(false);

      expect(
        previewSmartPlaylistInputSchema.safeParse({
          definition: validDefinition,
          maxEntries: -10
        }).success
      ).toBe(false);

      expect(
        previewSmartPlaylistInputSchema.safeParse({
          definition: validDefinition,
          maxEntries: 5001
        }).success
      ).toBe(false);

      expect(
        previewSmartPlaylistInputSchema.safeParse({
          definition: validDefinition,
          maxEntries: 1
        }).success
      ).toBe(true);

      expect(
        previewSmartPlaylistInputSchema.safeParse({
          definition: validDefinition,
          maxEntries: 5000
        }).success
      ).toBe(true);
    });

    it('rejects non-sortable fields in orderBy', () => {
      const nonSortableOrderBy = {
        rule: {
          type: 'group' as const,
          logicalOperator: 'and' as const,
          rules: [
            {
              type: 'condition' as const,
              field: 'title' as const,
              operator: 'contains' as const,
              value: 'Hello'
            }
          ]
        },
        orderBy: [{ field: 'isFavorite' as const, direction: 'asc' as const }]
      };
      const parsed = previewSmartPlaylistInputSchema.safeParse({
        definition: nonSortableOrderBy
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('Field "isFavorite" is not sortable');
      }
    });
  });
});
