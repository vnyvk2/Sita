import { DependencyAnalyzer } from '../../../../../src/main/collections/engine/DependencyAnalyzer';
import type { SmartPlaylistDefinition } from '../../../../../src/main/collections/query/ast';

describe('DependencyAnalyzer', () => {
  it('should extract dependencies from a simple AST', () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'condition',
        field: 'title',
        operator: 'contains',
        value: 'test'
      },
      orderBy: []
    };

    const deps = DependencyAnalyzer.extractDependencies(def);
    expect(deps).toEqual(['title']);
  });

  it('should extract dependencies from a nested AST and orderBy', () => {
    const def: SmartPlaylistDefinition = {
      rule: {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          { type: 'condition', field: 'artist', operator: 'eq', value: 'foo' },
          {
            type: 'group',
            logicalOperator: 'or',
            rules: [
              { type: 'condition', field: 'playCount', operator: 'gt', value: 10 },
              { type: 'condition', field: 'isFavorite', operator: 'is_true' }
            ]
          }
        ]
      },
      orderBy: [{ field: 'duration', direction: 'desc' }]
    };

    const deps = DependencyAnalyzer.extractDependencies(def);
    expect(deps).toContain('artist');
    expect(deps).toContain('playCount');
    expect(deps).toContain('isFavorite');
    expect(deps).toContain('duration');
    expect(deps.length).toBe(4);
  });

  it('should correctly determine if metadata changes affect a playlist', () => {
    const cachedDeps = ['artist', 'title'] as any[];

    // Does affect
    expect(DependencyAnalyzer.isAffectedByMetadataChange(cachedDeps, ['title', 'year'])).toBe(true);
    expect(DependencyAnalyzer.isAffectedByMetadataChange(cachedDeps, ['artist'])).toBe(true);

    // Does not affect
    expect(
      DependencyAnalyzer.isAffectedByMetadataChange(cachedDeps, ['playCount', 'duration'])
    ).toBe(false);
  });
});
