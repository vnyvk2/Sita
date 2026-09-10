import type { SmartPlaylistDefinition } from '../../../../../src/main/collections/query/ast';
import { QueryPlanner } from '../../../../../src/main/collections/query/QueryPlanner';

describe('QueryPlanner', () => {
  it('should not add joins for fields present in songs table', () => {
    const planner = new QueryPlanner();
    const definition: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'title', operator: 'contains', value: 'love' },
          { type: 'condition', field: 'year', operator: 'gt', value: 2000 }
        ]
      },
      orderBy: []
    };

    const plan = planner.plan(definition);
    expect(plan.joins).toEqual([]);
    expect(plan.rule).toBe(definition.rule);
    expect(plan.orderBy).toBe(definition.orderBy);
  });

  it('should add artists join if artist field is referenced', () => {
    const planner = new QueryPlanner();
    const definition: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'artist', operator: 'eq', value: 'The Beatles' }]
      },
      orderBy: []
    };

    const plan = planner.plan(definition);
    expect(plan.joins).toEqual([{ relation: 'artist' }]);
  });

  it('should collect multiple unique joins across groups and order definitions', () => {
    const planner = new QueryPlanner();
    const definition: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'or',
        rules: [
          { type: 'condition', field: 'album', operator: 'contains', value: 'Greatest Hits' },
          {
            type: 'group',
            logicalOperator: 'and',
            rules: [
              { type: 'condition', field: 'genre', operator: 'eq', value: 'Rock' },
              { type: 'condition', field: 'artist', operator: 'eq', value: 'Queen' }
            ]
          }
        ]
      },
      orderBy: [
        { field: 'artist', direction: 'asc' },
        { field: 'year', direction: 'desc' }
      ]
    };

    const plan = planner.plan(definition);
    // Should be sorted alphabetically by relation: album, artist, genre
    expect(plan.joins).toEqual([
      { relation: 'album' },
      { relation: 'artist' },
      { relation: 'genre' }
    ]);
  });
});
