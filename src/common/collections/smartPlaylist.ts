export type SmartPlaylistField =
  | 'title'
  | 'artist'
  | 'album'
  | 'genre'
  | 'language'
  | 'year'
  | 'duration'
  | 'bitRate'
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

export interface SmartPlaylistPreviewResult {
  totalMatches: number;
  limitedMatches: number;
  limitedDuration: number;
  previewSongs: SongData[];
}

export type SmartPlaylistFieldType = 'string' | 'number' | 'boolean' | 'date';

export interface SmartPlaylistFieldMeta {
  key: SmartPlaylistField;
  label: string;
  type: SmartPlaylistFieldType;
  allowedOperators: readonly SmartPlaylistOperator[];
  sortable: boolean;
  unit?: string;
}

export const SMART_PLAYLIST_FIELDS: Record<SmartPlaylistField, SmartPlaylistFieldMeta> = {
  title: {
    key: 'title',
    label: 'Title',
    type: 'string',
    allowedOperators: ['contains', 'not_contains', 'starts_with', 'ends_with', 'eq', 'neq'],
    sortable: true
  },
  artist: {
    key: 'artist',
    label: 'Artist',
    type: 'string',
    allowedOperators: ['contains', 'not_contains', 'starts_with', 'ends_with', 'eq', 'neq'],
    sortable: true
  },
  album: {
    key: 'album',
    label: 'Album',
    type: 'string',
    allowedOperators: [
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'eq',
      'neq',
      'is_null',
      'is_not_null'
    ],
    sortable: true
  },
  genre: {
    key: 'genre',
    label: 'Genre',
    type: 'string',
    allowedOperators: [
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'eq',
      'neq',
      'is_null',
      'is_not_null'
    ],
    sortable: true
  },
  language: {
    key: 'language',
    label: 'Language',
    type: 'string',
    allowedOperators: ['eq', 'neq', 'is_null', 'is_not_null'],
    sortable: true
  },
  year: {
    key: 'year',
    label: 'Year',
    type: 'number',
    allowedOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'],
    sortable: true,
    unit: 'year'
  },
  duration: {
    key: 'duration',
    label: 'Duration',
    type: 'number',
    allowedOperators: ['eq', 'gt', 'gte', 'lt', 'lte'],
    sortable: true,
    unit: 'seconds'
  },
  bitRate: {
    key: 'bitRate',
    label: 'Bitrate',
    type: 'number',
    allowedOperators: ['eq', 'gt', 'gte', 'lt', 'lte'],
    sortable: true,
    unit: 'kbps'
  },
  playCount: {
    key: 'playCount',
    label: 'Play Count',
    type: 'number',
    allowedOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    sortable: true,
    unit: 'count'
  },
  skipCount: {
    key: 'skipCount',
    label: 'Skip Count',
    type: 'number',
    allowedOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    sortable: true,
    unit: 'count'
  },
  addedAt: {
    key: 'addedAt',
    label: 'Date Added',
    type: 'date',
    allowedOperators: ['in_last', 'not_in_last'],
    sortable: true,
    unit: 'days'
  },
  isFavorite: {
    key: 'isFavorite',
    label: 'Favorite',
    type: 'boolean',
    allowedOperators: ['is_true', 'is_false'],
    sortable: false
  },
  isBlacklisted: {
    key: 'isBlacklisted',
    label: 'Blacklisted',
    type: 'boolean',
    allowedOperators: ['is_true', 'is_false'],
    sortable: false
  }
};

export interface SmartPlaylistRuleDto {
  playlistId: number;
  ruleAst: SmartPlaylistRuleAST;
  sortDefinition: OrderDefinition[];
  maxEntries: number | null;
  dependencies: SmartPlaylistField[];
  ruleVersion: number;
  lastGeneratedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}
