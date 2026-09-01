import { type SQL, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { songs, artists, albums, genres } from '../../db/schema';
import type {
  SmartPlaylistRuleAST,
  RuleCondition,
  SmartPlaylistField,
  OrderDefinition
} from './ast';

const DAY_MS = 24 * 60 * 60 * 1000;

export class SmartPlaylistCompiler {
  public compilePredicate(rule: SmartPlaylistRuleAST | RuleCondition): SQL<unknown> | undefined {
    if (rule.type === 'group') {
      if (rule.rules.length === 0) return undefined;
      const compiledRules = rule.rules
        .map((r) => this.compilePredicate(r))
        .filter((r): r is SQL<unknown> => r !== undefined);

      if (compiledRules.length === 0) return undefined;

      const operatorStr = rule.logicalOperator === 'and' ? ' AND ' : ' OR ';
      const joined = sql.join(compiledRules, sql.raw(operatorStr));
      return sql`(${joined})`;
    } else {
      return this.compileCondition(rule);
    }
  }

  public compileOrderBy(orderBy: OrderDefinition[]): SQL<unknown>[] {
    return orderBy.map((order) => {
      const col = this.getColumnForField(order.field);
      return order.direction === 'asc' ? sql`${col} ASC` : sql`${col} DESC`;
    });
  }

  private compileCondition(condition: RuleCondition): SQL<unknown> {
    const col = this.getColumnForField(condition.field);
    const value = condition.value;

    switch (condition.operator) {
      case 'eq':
        return sql`${col} = ${value}`;
      case 'neq':
        return sql`${col} != ${value}`;
      case 'gt':
        return sql`${col} > ${value}`;
      case 'gte':
        return sql`${col} >= ${value}`;
      case 'lt':
        return sql`${col} < ${value}`;
      case 'lte':
        return sql`${col} <= ${value}`;
      case 'contains':
        // lower() on both sides mirrors pg ILIKE semantics (SQLite LIKE is ASCII-CI
        // only when unadorned; explicit lower() keeps intent clear and deterministic)
        return sql`lower(${col}) LIKE ${'%' + String(value).toLowerCase() + '%'}`;
      case 'not_contains':
        return sql`lower(${col}) NOT LIKE ${'%' + String(value).toLowerCase() + '%'}`;
      case 'starts_with':
        return sql`lower(${col}) LIKE ${String(value).toLowerCase() + '%'}`;
      case 'ends_with':
        return sql`lower(${col}) LIKE ${'%' + String(value).toLowerCase()}`;
      case 'is_true':
        return sql`${col} = true`;
      case 'is_false':
        return sql`${col} = false`;
      case 'is_null':
        return sql`${col} IS NULL`;
      case 'is_not_null':
        return sql`${col} IS NOT NULL`;
      case 'in_last':
        // pg: col >= NOW() - (value || ' days')::interval. Timestamps are epoch-ms
        // integers now; the cutoff is computed at compile time, which removes the
        // session-timezone dependence pg's naive NOW() had (POC finding b9).
        return sql`${col} >= ${Date.now() - Number(value) * DAY_MS}`;
      case 'not_in_last':
        return sql`${col} < ${Date.now() - Number(value) * DAY_MS}`;
      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  private getColumnForField(field: SmartPlaylistField): AnySQLiteColumn {
    switch (field) {
      case 'title':
        return songs.title;
      case 'artist':
        return artists.name;
      case 'album':
        return albums.title;
      case 'genre':
        return genres.name;
      case 'language':
        return songs.language;
      case 'year':
        return songs.year;
      case 'duration':
        return songs.duration;
      case 'playCount':
        throw new Error('playCount is not supported');
      case 'skipCount':
        return songs.skipCount;
      case 'addedAt':
        return songs.createdAt;
      case 'isFavorite':
        return songs.isFavorite;
      case 'isBlacklisted':
        return songs.isBlacklisted;
      default:
        throw new Error(`Unknown field: ${field}`);
    }
  }
}
