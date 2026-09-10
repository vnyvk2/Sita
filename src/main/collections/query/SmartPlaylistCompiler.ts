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

function escapeLike(str: string): string {
  return str.replace(/[\\%_]/g, '\\$&');
}

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
    const compiled = orderBy.map((order) => {
      if (order.field === 'artist') {
        const col =
          order.direction === 'asc' ? sql`min(${artists.name})` : sql`max(${artists.name})`;
        return order.direction === 'asc' ? sql`${col} ASC` : sql`${col} DESC`;
      }
      if (order.field === 'album') {
        const col =
          order.direction === 'asc' ? sql`min(${albums.title})` : sql`max(${albums.title})`;
        return order.direction === 'asc' ? sql`${col} ASC` : sql`${col} DESC`;
      }
      if (order.field === 'genre') {
        const col = order.direction === 'asc' ? sql`min(${genres.name})` : sql`max(${genres.name})`;
        return order.direction === 'asc' ? sql`${col} ASC` : sql`${col} DESC`;
      }
      const col = this.getExpressionForField(order.field);
      return order.direction === 'asc' ? sql`${col} ASC` : sql`${col} DESC`;
    });

    // Enforce deterministic ordering with songs.id tiebreaker
    compiled.push(sql`${songs.id} ASC`);
    return compiled;
  }

  private compileCondition(condition: RuleCondition): SQL<unknown> {
    const col = this.getExpressionForField(condition.field);
    const value = condition.value;

    switch (condition.operator) {
      case 'eq':
        return sql`${col} = ${value}`;
      case 'neq':
        return sql`(${col} IS NULL OR ${col} != ${value})`;
      case 'gt':
        return sql`${col} > ${value}`;
      case 'gte':
        return sql`${col} >= ${value}`;
      case 'lt':
        return sql`${col} < ${value}`;
      case 'lte':
        return sql`${col} <= ${value}`;
      case 'contains': {
        const escaped = escapeLike(String(value ?? '').toLowerCase());
        return sql`lower(${col}) LIKE ${'%' + escaped + '%'} ESCAPE '\\'`;
      }
      case 'not_contains': {
        const escaped = escapeLike(String(value ?? '').toLowerCase());
        return sql`(${col} IS NULL OR lower(${col}) NOT LIKE ${'%' + escaped + '%'} ESCAPE '\\')`;
      }
      case 'starts_with': {
        const escaped = escapeLike(String(value ?? '').toLowerCase());
        return sql`lower(${col}) LIKE ${escaped + '%'} ESCAPE '\\'`;
      }
      case 'ends_with': {
        const escaped = escapeLike(String(value ?? '').toLowerCase());
        return sql`lower(${col}) LIKE ${'%' + escaped} ESCAPE '\\'`;
      }
      case 'is_true':
        return sql`${col} = 1`;
      case 'is_false':
        return sql`${col} = 0`;
      case 'is_null':
        return sql`${col} IS NULL`;
      case 'is_not_null':
        return sql`${col} IS NOT NULL`;
      case 'in_last':
        // Timestamps in SQLite are stored as epoch-ms integers
        return sql`${col} >= ${Date.now() - Number(value ?? 0) * DAY_MS}`;
      case 'not_in_last':
        return sql`${col} < ${Date.now() - Number(value ?? 0) * DAY_MS}`;
      default:
        throw new Error(`Unsupported operator: ${condition.operator}`);
    }
  }

  public getExpressionForField(field: SmartPlaylistField): AnySQLiteColumn | SQL<unknown> {
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
      case 'bitRate':
        return songs.bitRate;
      case 'playCount':
        return sql<number>`(SELECT count(*) FROM play_events WHERE play_events.song_id = ${songs.id})`;
      case 'skipCount':
        return sql<number>`coalesce(${songs.skipCount}, 0)`;
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
