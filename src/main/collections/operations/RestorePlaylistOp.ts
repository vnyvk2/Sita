import { createCollectionId } from '../../../common/collections/id';
import { smartPlaylistRules } from '../../db/schema';
import { DependencyAnalyzer } from '../engine/DependencyAnalyzer';
import { PlaylistRepository, type PlaylistRow } from '../repositories/PlaylistRepository';
import type { RestoreSongsInput } from './RestoreSongsOp';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

type RestorablePlaylist = Omit<PlaylistRow, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

export interface RestorePlaylistInput {
  playlist: RestorablePlaylist;
  entries: RestoreSongsInput['entries'];
  smartRule?: {
    ruleAst: any;
    sortDefinition: any;
    maxEntries?: number | null;
    ruleVersion?: number;
  };
}

export class RestorePlaylistOp implements CollectionOperation<RestorePlaylistInput, void> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: RestorePlaylistInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlist, entries, smartRule } = input;

    const playlistToInsert = {
      ...playlist,
      createdAt:
        typeof playlist.createdAt === 'string' ? new Date(playlist.createdAt) : playlist.createdAt,
      updatedAt:
        typeof playlist.updatedAt === 'string' ? new Date(playlist.updatedAt) : playlist.updatedAt
    };

    await this.repository.restorePlaylistWithId(playlistToInsert, ctx.trx);

    if (smartRule) {
      const ast =
        typeof smartRule.ruleAst === 'string' ? JSON.parse(smartRule.ruleAst) : smartRule.ruleAst;
      const sortDef =
        typeof smartRule.sortDefinition === 'string'
          ? JSON.parse(smartRule.sortDefinition)
          : smartRule.sortDefinition;
      const dependencies = ast
        ? DependencyAnalyzer.extractDependencies({
            rule: ast,
            orderBy: Array.isArray(sortDef) ? sortDef : []
          })
        : [];
      await ctx.trx.insert(smartPlaylistRules).values({
        playlistId: playlist.id,
        ruleAst: smartRule.ruleAst,
        sortDefinition: smartRule.sortDefinition,
        maxEntries: smartRule.maxEntries ?? null,
        ruleVersion: smartRule.ruleVersion ?? 1,
        dependencies
      });
    }

    if (entries.length > 0) {
      const entriesToInsert = entries.map((e) => {
        return {
          ...e,
          addedAt: typeof e.addedAt === 'string' ? new Date(e.addedAt) : e.addedAt,
          createdAt: typeof e.createdAt === 'string' ? new Date(e.createdAt) : e.createdAt,
          updatedAt: typeof e.updatedAt === 'string' ? new Date(e.updatedAt) : e.updatedAt
        };
      });
      await this.repository.restoreEntriesWithIds(entriesToInsert, ctx.trx);
    }

    const affectedSongIds = Array.from(new Set(entries.map((e) => e.songId)));

    const duration =
      typeof playlist.totalDuration === 'string'
        ? parseFloat(playlist.totalDuration)
        : playlist.totalDuration || 0;

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlist.id),
      operationType: 'playlist.restore',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.delete',
        input: { playlistId: playlist.id }
      },
      version: 1,
      affectedSongIds,
      statsDelta: playlist.parentId
        ? {
            targetPlaylistId: playlist.parentId,
            itemCountDelta: playlist.itemCount || 0,
            durationDelta: duration
          }
        : undefined
    };
  }
}
