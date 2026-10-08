import { getSongsByIds } from '../../db/queries/songs';
import type { ApplyFieldId, NormalizedMutation } from '../apply/contract';
import type { ResourceMutationPayload } from '../domain/MetadataTransaction';
import { LocalSongNormalizer } from '../matching/LocalSongNormalizer';
import type { LocalSongInput } from './AlbumMetadataService';
import type { CoverArtBufferService } from './CoverArtBufferService';
import type { MetadataWorkflowService } from './MetadataWorkflowService';

export interface GapFillStats {
  updated: number;
  skipped: number;
  failed: number;
  albumsProcessed: number;
}

export interface GapFillResult extends GapFillStats {
  errors: string[];
}

const isEmptyVal = (v: unknown): boolean =>
  v === undefined || v === null || String(v).trim().length === 0;

const hasArtwork = (s: LocalSongInput): boolean =>
  !isEmptyVal(s.artworkPath) || !isEmptyVal(s.artworkUrl);

const groupKey = (s: LocalSongInput): string => {
  const album = (s.album ?? '').trim().toLowerCase();
  if (!album) return `song:${s.songId}`;
  const artist = (s.artist ?? '').trim().toLowerCase();
  return `album:${album}::${artist}`;
};

const groupLabel = (s: LocalSongInput): string => s.album?.trim() || s.title;

/**
 * Gap-fill background tagging: fills ONLY empty enrichment fields (genre, artwork) for the given
 * songs, grouped per album so each album commits as a single undo checkpoint. Identity fields
 * (title, artist, album, year, track numbers) are never touched.
 *
 * Genre comes from the Discogs-backed genre workflow (silently skipped when the provider is not
 * configured); artwork from the CAA/Discogs artwork workflow. Groups are processed sequentially to
 * respect provider rate limits; pass an AbortSignal to cancel between groups.
 */
export class GapFillService {
  private readonly workflowService: MetadataWorkflowService;
  private readonly coverArtBufferService?: CoverArtBufferService;

  constructor(options: {
    workflowService: MetadataWorkflowService;
    coverArtBufferService?: CoverArtBufferService;
  }) {
    this.workflowService = options.workflowService;
    this.coverArtBufferService = options.coverArtBufferService;
  }

  public async fillGaps(
    songs: LocalSongInput[],
    operationId = 'default',
    signal?: AbortSignal
  ): Promise<GapFillResult> {
    const result: GapFillResult = {
      updated: 0,
      skipped: 0,
      failed: 0,
      albumsProcessed: 0,
      errors: []
    };

    const locals = songs.filter((s) => s && s.songId > 0 && !isEmptyVal(s.path));
    if (locals.length === 0) return result;

    // Authoritative baseline: a caller that omits genre (partial literal,
    // failed resolve) must not read as "empty" when the database has a value.
    // Backfill caller-empty genres from SQLite; failures fall back to input.
    const baselined = await this.backfillGenres(locals);

    const groups = new Map<string, LocalSongInput[]>();
    for (const s of baselined) {
      const key = groupKey(s);
      const group = groups.get(key) ?? [];
      group.push(s);
      groups.set(key, group);
    }

    let groupIdx = 0;
    for (const groupSongs of groups.values()) {
      if (signal?.aborted) {
        result.errors.push('Gap fill cancelled.');
        break;
      }
      const label = groupLabel(groupSongs[0]);
      const opId = `${operationId}:gapfill:${groupIdx++}`;
      try {
        const stats = await this.fillGroup(groupSongs, label, opId, signal);
        result.updated += stats.updated;
        result.skipped += stats.skipped;
        result.failed += stats.failed;
        result.albumsProcessed += 1;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.failed += groupSongs.length;
        result.errors.push(`[${label}] ${msg}`);
      }
    }

    return result;
  }

  private async fillGroup(
    groupSongs: LocalSongInput[],
    label: string,
    operationId: string,
    signal?: AbortSignal
  ): Promise<{ updated: number; skipped: number; failed: number }> {
    const byId = new Map(groupSongs.map((s) => [s.songId, s]));
    const missingGenre = groupSongs.filter((s) => isEmptyVal(s.genre));
    const missingArtwork = groupSongs.filter((s) => !hasArtwork(s));

    if (missingGenre.length === 0 && missingArtwork.length === 0) {
      return { updated: 0, skipped: groupSongs.length, failed: 0 };
    }

    const first = groupSongs[0];
    const query = {
      album: first.album?.trim() || undefined,
      artist: first.artist?.trim() || undefined,
      title: first.title,
      limit: 3
    };

    const mutations: NormalizedMutation[] = [];

    // Genre (Discogs-only workflow; absent when no token is configured).
    if (missingGenre.length > 0) {
      try {
        const workflow = this.workflowService.getWorkflow('genre');
        const candidates = await workflow.search(query, signal);
        const top = candidates[0];
        if (top) {
          const preview = await workflow.buildPreview(missingGenre, top.id, 'discogs', signal);
          const raw = workflow.buildMutations(preview, ['genre']);
          for (const rm of raw) {
            const local = byId.get(Number(rm.resourceId));
            if (!local || !isEmptyVal(local.genre)) continue;
            const fields = rm.fieldMutations.filter((fm) => !isEmptyVal(fm.newValue));
            if (fields.length === 0) continue;
            mutations.push(this.toMutation(rm, fields, operationId, `Gap fill for ${label}`));
          }
        }
      } catch {
        // Provider unavailable or search failed: genre stays empty for this group.
      }
    }

    // Artwork (CAA with Discogs fallback).
    if (missingArtwork.length > 0) {
      try {
        const workflow = this.workflowService.getWorkflow('artwork');
        const candidates = await workflow.search(query, signal);
        const top = candidates.find((c) => c.coverArtUrl) ?? candidates[0];
        if (top) {
          const preview = await workflow.buildPreview(missingArtwork, top.id, top.provider, signal);
          const raw = workflow.buildMutations(preview, ['artworkUrl', 'artworkPath']);
          for (const rm of raw) {
            const local = byId.get(Number(rm.resourceId));
            if (!local || hasArtwork(local)) continue;
            const artField = rm.fieldMutations.find(
              (fm) =>
                (fm.fieldId === 'artworkUrl' || fm.fieldId === 'artworkPath') &&
                !isEmptyVal(fm.newValue)
            );
            const targetUrl = (artField?.newValue as string | undefined) ?? top.coverArtUrl;
            if (!targetUrl) continue;
            // Validate upfront so imageless mutations never enter the journal.
            const buf = await this.coverArtBufferService?.fetchBuffer(targetUrl);
            if (!buf) continue;
            mutations.push({
              mutationId: `${operationId}:${String(rm.resourceId)}`,
              operationId,
              songId: Number(rm.resourceId),
              filePath: rm.filePath ?? local.path,
              fields: [],
              artwork: { buffer: buf },
              fileWrite: { deferredIfPlaying: true },
              undo: { description: `Gap fill for ${label}` }
            });
          }
        }
      } catch {
        // Search or download failed: artwork stays empty for this group.
      }
    }

    if (mutations.length === 0) {
      return { updated: 0, skipped: groupSongs.length, failed: 0 };
    }

    const orchRes = await this.workflowService.executeMutations(mutations, {
      albumTitle: label,
      groupUndo: { description: `Gap fill for ${label}` }
    });
    const updated = orchRes.updatedCount + orchRes.deferredCount;
    const failed = orchRes.failedCount;
    const skipped = Math.max(0, groupSongs.length - updated - failed);
    if (!orchRes.success && orchRes.errors.length > 0) {
      throw new Error(orchRes.errors.join('; '));
    }
    return { updated, skipped, failed };
  }

  private async backfillGenres(locals: LocalSongInput[]): Promise<LocalSongInput[]> {
    const ids = [...new Set(locals.filter((s) => isEmptyVal(s.genre)).map((s) => s.songId))];
    if (ids.length === 0) return locals;
    try {
      const rows = await getSongsByIds(ids);
      const byId = new Map(
        (rows ?? [])
          .filter((r) => r && r.id)
          .map((r) => [r.id, LocalSongNormalizer.fromDbSong(r)] as const)
      );
      return locals.map((s) => {
        if (!isEmptyVal(s.genre)) return s;
        const dbGenre = byId.get(s.songId)?.genre;
        return dbGenre ? { ...s, genre: dbGenre } : s;
      });
    } catch {
      return locals;
    }
  }

  private toMutation(
    rm: ResourceMutationPayload,
    fields: ResourceMutationPayload['fieldMutations'],
    operationId: string,
    description: string
  ): NormalizedMutation {
    return {
      mutationId: `${operationId}:${String(rm.resourceId)}`,
      operationId,
      songId: Number(rm.resourceId),
      filePath: rm.filePath ?? '',
      fields: fields.map((fm) => ({
        fieldId: fm.fieldId as ApplyFieldId,
        oldValue: fm.oldValue ?? null,
        newValue: fm.newValue as string | number
      })),
      fileWrite: { deferredIfPlaying: true },
      undo: { description }
    };
  }
}
