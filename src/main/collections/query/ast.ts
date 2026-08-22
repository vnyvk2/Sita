export type SmartPlaylistField =
  | 'title'
  | 'artist'
  | 'album'
  | 'genre'
  | 'language'
  | 'year'
  | 'duration'
  | 'playCount'
  | 'skipCount'
  | 'addedAt'
  | 'isFavorite'
  | 'isBlacklisted';

export type SmartPlaylistOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_true'
  | 'is_false'
  | 'is_null'
  | 'is_not_null'
  | 'in_last'
  | 'not_in_last';

export interface RuleCondition {
  type: 'condition';
  field: SmartPlaylistField;
  operator: SmartPlaylistOperator;
  value?: string | number | boolean | string[] | number[];
  metadata?: {
    caseSensitive?: boolean;
    locale?: string;
  };
}

export interface RuleGroup {
  type: 'group';
  logicalOperator: 'and' | 'or';
  rules: (RuleCondition | RuleGroup)[];
}

export type SmartPlaylistRuleAST = RuleGroup;

export interface OrderDefinition {
  field: SmartPlaylistField;
  direction: 'asc' | 'desc';
}

export interface SmartPlaylistDefinition {
  rule: SmartPlaylistRuleAST;
  orderBy: OrderDefinition[];
}
