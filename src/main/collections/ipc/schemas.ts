import { z } from 'zod';

import {
  SMART_PLAYLIST_FIELDS,
  type RuleCondition,
  type RuleGroup,
  type SmartPlaylistField,
  type SmartPlaylistOperator
} from '../../../common/collections/smartPlaylist';

/**
 * Runtime validation for collection IPC inputs. The renderer is trusted for UX purposes only -
 * every payload crossing the boundary is parsed here before it reaches the engine/repositories so
 * malformed or hostile values fail fast instead of corrupting stored positions/state.
 */

const int = z.number().int();
const playlistIdSchema = int;
const optionalParentId = int.nullable().optional();

export const createFolderInputSchema = z.object({
  name: z.string().min(1),
  parentId: optionalParentId
});

export const createPlaylistInputSchema = z.object({
  name: z.string().min(1),
  parentId: optionalParentId
});

export const addSongsInputSchema = z.object({
  playlistId: playlistIdSchema,
  songIds: z.array(int).min(1),
  insertAt: int.optional()
});

export const removeSongsInputSchema = z.object({
  playlistId: playlistIdSchema,
  entryIds: z.array(int).min(1)
});

export const reorderInputSchema = z.object({
  playlistId: playlistIdSchema,
  entryId: int,
  newPosition: int
});

export const renameInputSchema = z.object({
  playlistId: playlistIdSchema,
  newName: z.string().min(1)
});

export const moveCollectionInputSchema = z.object({
  playlistIds: z.array(int).min(1),
  targetParentId: int.nullable(),
  sidebarPosition: int.optional()
});

export const deleteInputSchema = z.object({
  playlistId: playlistIdSchema
});

export const duplicateInputSchema = z.object({
  playlistId: playlistIdSchema
});

export const mergePlaylistsInputSchema = z.object({
  sourcePlaylistIds: z.array(int).min(1),
  targetPlaylistId: playlistIdSchema
});

export const bulkDeleteInputSchema = z.object({
  playlistIds: z.array(int).min(1)
});

export const bulkRestoreInputSchema = z.object({
  restores: z
    .object({
      playlist: z.record(z.string(), z.unknown()),
      entries: z.array(z.record(z.string(), z.unknown())),
      smartRule: z.record(z.string(), z.unknown()).optional()
    })
    .array()
});

export const pinUnpinInputSchema = z.object({
  playlistId: playlistIdSchema
});

export const setArtworkInputSchema = z.object({
  playlistId: playlistIdSchema,
  artworkPath: z.string().optional(),
  artworkId: int.optional(),
  processedArtwork: z.unknown().optional()
});

export const idParamSchema = int;
export const historyUriSchema = z.string().min(1);

export const smartPlaylistFieldSchema = z.enum([
  'title',
  'artist',
  'album',
  'genre',
  'language',
  'year',
  'duration',
  'bitRate',
  'playCount',
  'skipCount',
  'addedAt',
  'isFavorite',
  'isBlacklisted'
]) as z.ZodType<SmartPlaylistField>;

export const smartPlaylistOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_true',
  'is_false',
  'is_null',
  'is_not_null',
  'in_last',
  'not_in_last'
]) as z.ZodType<SmartPlaylistOperator>;

export const ruleConditionSchema = z
  .object({
    type: z.literal('condition'),
    field: smartPlaylistFieldSchema,
    operator: smartPlaylistOperatorSchema,
    value: z
      .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())])
      .optional()
  })
  .superRefine((val, ctx) => {
    const meta = SMART_PLAYLIST_FIELDS[val.field];
    if (!meta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown field: ${val.field}`
      });
      return;
    }

    if (!meta.allowedOperators.includes(val.operator)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${val.operator}" is not allowed for field "${val.field}"`
      });
      return;
    }

    const unaryOperators = ['is_true', 'is_false', 'is_null', 'is_not_null'];
    if (unaryOperators.includes(val.operator)) {
      if (val.value !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unary operator "${val.operator}" must not have a value`
        });
      }
      return;
    }

    if (val.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${val.operator}" requires a value`
      });
      return;
    }

    if (val.operator === 'in_last' || val.operator === 'not_in_last') {
      if (typeof val.value !== 'number' || !Number.isInteger(val.value) || val.value < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Operator "${val.operator}" requires a positive integer >= 1`
        });
      }
      return;
    }

    if (meta.type === 'number') {
      if (typeof val.value !== 'number' || Number.isNaN(val.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Field "${val.field}" requires a valid number`
        });
      }
    } else if (meta.type === 'string') {
      if (typeof val.value !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Field "${val.field}" requires a string value`
        });
      }
    }
  });

export const ruleNodeSchema: z.ZodType<RuleCondition | RuleGroup> = z.lazy(() =>
  z.union([
    ruleConditionSchema,
    z.object({
      type: z.literal('group'),
      logicalOperator: z.enum(['and', 'or']),
      rules: z.array(ruleNodeSchema)
    })
  ])
);

export function getAstDepth(node: RuleCondition | RuleGroup): number {
  if (node.type === 'condition') return 1;
  if (!node.rules || node.rules.length === 0) return 1;
  return 1 + Math.max(...node.rules.map(getAstDepth));
}

export function hasEmptyGroup(node: RuleCondition | RuleGroup): boolean {
  if (node.type === 'condition') return false;
  if (!node.rules || node.rules.length === 0) return true;
  return node.rules.some(hasEmptyGroup);
}

export function countAstNodes(node: RuleCondition | RuleGroup): number {
  if (node.type === 'condition') return 1;
  if (!node.rules || node.rules.length === 0) return 1;
  return 1 + node.rules.reduce((acc, child) => acc + countAstNodes(child), 0);
}

export const smartPlaylistRuleASTSchema = z
  .object({
    type: z.literal('group'),
    logicalOperator: z.enum(['and', 'or']),
    rules: z.array(ruleNodeSchema)
  })
  .superRefine((val, ctx) => {
    if (getAstDepth(val) > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nesting depth exceeds maximum allowed of 3'
      });
    }
    if (hasEmptyGroup(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rule group cannot be empty'
      });
    }
    if (countAstNodes(val) > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Total rule nodes exceeds maximum allowed of 100'
      });
    }
  });

export const orderDefinitionSchema = z
  .object({
    field: smartPlaylistFieldSchema,
    direction: z.enum(['asc', 'desc'])
  })
  .superRefine((val, ctx) => {
    const meta = SMART_PLAYLIST_FIELDS[val.field];
    if (!meta || !meta.sortable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field "${val.field}" is not sortable`
      });
    }
  });

export const smartPlaylistDefinitionSchema = z.object({
  rule: smartPlaylistRuleASTSchema,
  orderBy: z.array(orderDefinitionSchema).max(5)
});

const maxEntriesSchema = z.number().int().min(1).max(5000).nullable().optional();

export const createSmartPlaylistInputSchema = z.object({
  name: z.string().min(1),
  parentId: optionalParentId,
  definition: smartPlaylistDefinitionSchema,
  maxEntries: maxEntriesSchema
});

export const updateSmartPlaylistInputSchema = z.object({
  playlistId: playlistIdSchema,
  name: z.string().min(1).optional(),
  definition: smartPlaylistDefinitionSchema,
  maxEntries: maxEntriesSchema
});

export const previewSmartPlaylistInputSchema = z.object({
  definition: smartPlaylistDefinitionSchema,
  maxEntries: maxEntriesSchema
});
