import { type SQL, sql } from 'drizzle-orm';
import type { SmartPlaylistRuleAST, RuleCondition, SmartPlaylistField, OrderDefinition } from './ast';
import { songs, artists, albums, genres } from '../../db/schema';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export class SmartPlaylistCompiler {
  public compilePredicate(rule: SmartPlaylistRuleAST | RuleCondition): SQL<unknown> | undefined {
    if (rule.type === 'group') {
      if (rule.rules.length === 0) return undefined;
      const compiledRules = rule.rules
        .map(r => this.compilePredicate(r))
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
    return orderBy.map(order => {
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
        return sql`${col} ILIKE ${'%' + value + '%'}`;
      case 'not_contains':
        return sql`${col} NOT ILIKE ${'%' + value + '%'}`;
      case 'starts_with':
        return sql`${col} ILIKE ${value + '%'}`;
      case 'ends_with':
        return sql`${col} ILIKE ${'%' + value}`;
      case 'is_true':
        return sql`${col} = true`;
      case 'is_false':
        return sql`${col} = false`;
      case 'is_null':
        return sql`${col} IS NULL`;
      case 'is_not_null':
        return sql`${col} IS NOT NULL`;
      case 'in_last':
        return sql`${col} >= NOW() - (${value} || ' days')::interval`;
      case 'not_in_last':
        return sql`${col} < NOW() - (${value} || ' days')::interval`;
      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  private getColumnForField(field: SmartPlaylistField): AnyPgColumn {
    switch (field) {
      case 'title': return songs.title;
      case 'artist': return artists.name;
      case 'album': return albums.title;
      case 'genre': return genres.name;
      case 'year': return songs.year;
      case 'duration': return songs.duration;
      case 'playCount': throw new Error('playCount is not supported');
      case 'skipCount': return songs.skipCount;
      case 'addedAt': return songs.createdAt;
      case 'isFavorite': return songs.isFavorite;
      case 'isBlacklisted': return songs.isBlacklisted;
      default:
        throw new Error(`Unknown field: ${field}`);
    }
  }
}
