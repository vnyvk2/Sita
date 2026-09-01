import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, it, expect } from 'vitest';

import type { SmartPlaylistRuleAST } from '../../../../../src/main/collections/query/ast';
import { SmartPlaylistCompiler } from '../../../../../src/main/collections/query/SmartPlaylistCompiler';

describe('SmartPlaylistCompiler', () => {
  it('should compile basic conditions deterministically', () => {
    const compiler = new SmartPlaylistCompiler();
    const rule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'hello' }]
    };

    const sql1 = compiler.compilePredicate(rule);
    const sql2 = compiler.compilePredicate(rule);

    const query1 = new PgDialect().sqlToQuery(sql1!).sql;
    const query2 = new PgDialect().sqlToQuery(sql2!).sql;

    // The SQL generation should be fully deterministic
    expect(query1).toEqual(query2);
    // SQLite dialect: case-insensitive contains is lower(col) LIKE (pg emitted ILIKE)
    expect(query1).toContain('LIKE');
    expect(query1).toContain('lower(');
  });

  it('should compile complex nested conditions', () => {
    const compiler = new SmartPlaylistCompiler();
    const rule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'or',
      rules: [
        { type: 'condition', field: 'year', operator: 'gte', value: 2010 },
        {
          type: 'group',
          logicalOperator: 'and',
          rules: [
            { type: 'condition', field: 'isFavorite', operator: 'is_true' },
            { type: 'condition', field: 'artist', operator: 'eq', value: 'Taylor Swift' }
          ]
        }
      ]
    };

    const compiled = compiler.compilePredicate(rule);
    expect(compiled).toBeDefined();

    // Ensure both AND and OR are represented
    const queryStr = new PgDialect().sqlToQuery(compiled!).sql;
    expect(queryStr).toContain(' OR ');
    expect(queryStr).toContain(' AND ');
    expect(queryStr).toContain('>=');
    expect(queryStr).toContain('=');
  });

  it('should omit empty groups', () => {
    const compiler = new SmartPlaylistCompiler();
    const rule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [
        {
          type: 'group',
          logicalOperator: 'or',
          rules: []
        }
      ]
    };

    const compiled = compiler.compilePredicate(rule);
    expect(compiled).toBeUndefined();
  });

  it('should compile language field conditions properly', () => {
    const compiler = new SmartPlaylistCompiler();
    const rule: SmartPlaylistRuleAST = {
      type: 'group',
      logicalOperator: 'and',
      rules: [
        { type: 'condition', field: 'language', operator: 'eq', value: 'Telugu' },
        { type: 'condition', field: 'language', operator: 'neq', value: 'Hindi' }
      ]
    };

    const compiled = compiler.compilePredicate(rule);
    expect(compiled).toBeDefined();
    const queryStr = new PgDialect().sqlToQuery(compiled!).sql;
    expect(queryStr).toContain('"songs"."language" = $1');
    expect(queryStr).toContain('"songs"."language" != $2');
  });
});
