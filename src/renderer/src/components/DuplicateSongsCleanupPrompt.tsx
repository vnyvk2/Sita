import Button from '@renderer/components/Button';
import Checkbox from '@renderer/components/Checkbox';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Types — mirror of the main-process payload
// ---------------------------------------------------------------------------

export type SongDuplicateCategory =
  | 'EXACT_DUPLICATE'
  | 'PROBABLE_DUPLICATE'
  | 'MANUAL_REVIEW'
  | 'ALTERNATIVE_VERSION';

export interface SongDuplicateSong {
  id: number;
  title: string;
  artist: string;
  path: string | null;
  durationSec: number;
  format: string | null;
  bitrateKbps: number | null;
  sampleRateHz: number | null;
  fileSizeBytes: number | null;
  normalized: { base: string; part: { type: string; index: string } | null; variants: string[] };
}

export interface SongDuplicateGroup {
  category: SongDuplicateCategory;
  songs: SongDuplicateSong[];
  recommendedKeepId: number | null;
  reasons: Array<'one-sided-part' | 'artist-set-mismatch'>;
  groupKey: string;
}

export interface ResolveDuplicatesResult {
  ok: boolean;
  reason: string | null;
  removed: number[];
  failed: Array<{ songId: number; error: string }>;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const LOSSLESS_FORMATS = new Set(['flac', 'wav', 'alac', 'aiff', 'aif', 'ape', 'wv', 'dsf', 'dff']);

const CATEGORY_ORDER: SongDuplicateCategory[] = [
  'EXACT_DUPLICATE',
  'PROBABLE_DUPLICATE',
  'MANUAL_REVIEW',
  'ALTERNATIVE_VERSION'
];

const SECTION_META: Record<
  SongDuplicateCategory,
  { icon: string; titleKey: string; descriptionKey: string; accentClassName: string }
> = {
  EXACT_DUPLICATE: {
    icon: 'content_copy',
    titleKey: 'duplicateSongsSuggestion.exactDuplicates',
    descriptionKey: 'duplicateSongsSuggestion.exactDuplicatesDesc',
    accentClassName: 'bg-green-500/20 text-green-600 dark:text-green-400'
  },
  PROBABLE_DUPLICATE: {
    icon: 'help_outline',
    titleKey: 'duplicateSongsSuggestion.probableDuplicates',
    descriptionKey: 'duplicateSongsSuggestion.probableDuplicatesDesc',
    accentClassName: 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
  },
  MANUAL_REVIEW: {
    icon: 'rate_review',
    titleKey: 'duplicateSongsSuggestion.needsReview',
    descriptionKey: 'duplicateSongsSuggestion.needsReviewDesc',
    accentClassName: 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
  },
  ALTERNATIVE_VERSION: {
    icon: 'alt_route',
    titleKey: 'duplicateSongsSuggestion.otherVersions',
    descriptionKey: 'duplicateSongsSuggestion.otherVersionsDesc',
    accentClassName: 'bg-violet-500/20 text-violet-600 dark:text-violet-400'
  }
};

const REASON_LABEL_KEYS: Record<string, string> = {
  'one-sided-part': 'duplicateSongsSuggestion.reasonOneSidedPart',
  'artist-set-mismatch': 'duplicateSongsSuggestion.reasonArtistMismatch'
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function qualityLabel(
  song: SongDuplicateSong,
  t: (key: string, fallback?: string) => string
): string {
  const format = (song.format ?? '').toLowerCase();
  if (format === '') return '—';
  if (LOSSLESS_FORMATS.has(format)) {
    return `${format.toUpperCase()} · ${t('duplicateSongsSuggestion.lossless', 'Lossless')}`;
  }
  if (song.bitrateKbps != null) return `${format.toUpperCase()} · ${song.bitrateKbps} kbps`;
  return format.toUpperCase();
}

/** Pre-ticks duplicate copies except the locked original (review groups: user decides). */
function initialSelection(group: SongDuplicateGroup): number[] {
  if (group.category === 'EXACT_DUPLICATE' || group.category === 'PROBABLE_DUPLICATE') {
    return group.songs.filter((song) => song.id !== group.recommendedKeepId).map((song) => song.id);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Prompt Component (rendered inside Nora's PromptMenu)
// ---------------------------------------------------------------------------

export const DuplicateSongsCleanupPrompt = () => {
  const queryClient = useQueryClient();
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [selections, setSelections] = useState<Record<string, number[]>>({});
  const [moveToTrash, setMoveToTrash] = useState(true);

  // Runs on-demand when the prompt is open. When prompt is closed, 0 background queries.
  const { data: groups = [], isFetching } = useQuery({
    queryKey: ['songDuplicateGroups'],
    queryFn: () => window.api.getSongDuplicateGroups() as Promise<SongDuplicateGroup[]>,
    staleTime: 30_000
  });

  useEffect(() => {
    const next: Record<string, number[]> = {};
    for (const group of groups) {
      next[group.groupKey] = initialSelection(group);
    }
    setSelections(next);
  }, [groups]);

  const resolveMutation = useMutation({
    mutationFn: (vars: { songIds: number[]; mode: 'trash' | 'library-only' }) =>
      window.api.resolveSongDuplicates(vars) as Promise<ResolveDuplicatesResult>,
    onSuccess: (result) => {
      if (!result.ok) {
        addNewNotifications([
          {
            id: 'duplicateResolveRejected',
            iconName: 'error_outline',
            content:
              result.reason ??
              t('duplicateSongsSuggestion.resolveFailed', "Couldn't remove the selected songs.")
          }
        ]);
        return;
      }
      if (result.removed.length > 0) {
        addNewNotifications([
          {
            id: 'duplicatesRemoved',
            iconName: 'delete_sweep',
            content: t('duplicateSongsSuggestion.removedDuplicates', {
              count: result.removed.length,
              defaultValue: `Removed ${result.removed.length} duplicate files.`
            })
          }
        ]);
      }
      if (result.failed.length > 0) {
        addNewNotifications([
          {
            id: 'duplicateResolvePartial',
            iconName: 'warning_amber',
            content: t('duplicateSongsSuggestion.partialRemoval', {
              count: result.failed.length,
              defaultValue: `${result.failed.length} files could not be removed and were kept in your library.`
            })
          }
        ]);
      }
      void queryClient.invalidateQueries({ queryKey: ['songDuplicateGroups'] });
    },
    onError: () => {
      addNewNotifications([
        {
          id: 'duplicateResolveFailed',
          iconName: 'error_outline',
          content: t(
            'duplicateSongsSuggestion.resolveFailed',
            "Couldn't remove the selected songs."
          )
        }
      ]);
    }
  });

  const ignoreMutation = useMutation({
    mutationFn: async (group: SongDuplicateGroup) => {
      const groupId = `songs_${group.groupKey}`;
      await Promise.all(
        group.songs.map((song) => window.api.addIgnoredDuplicate(groupId, song.id))
      );
    },
    onSuccess: () => {
      addNewNotifications([
        {
          id: 'suggestionIgnored',
          iconName: 'do_not_disturb_on',
          content: t('notifications.suggestionIgnored', 'Suggestion ignored.')
        }
      ]);
      void queryClient.invalidateQueries({ queryKey: ['songDuplicateGroups'] });
    },
    onError: () => {
      addNewNotifications([
        {
          id: 'duplicateIgnoreFailed',
          iconName: 'error_outline',
          content: t('duplicateSongsSuggestion.ignoreFailed', "Couldn't save this preference.")
        }
      ]);
    }
  });

  const groupedByCategory = useMemo(() => {
    const map = new Map<SongDuplicateCategory, SongDuplicateGroup[]>();
    for (const group of groups) {
      const list = map.get(group.category) ?? [];
      list.push(group);
      map.set(group.category, list);
    }
    return map;
  }, [groups]);

  const totalSelected = useMemo(
    () => Object.values(selections).reduce((sum, ids) => sum + ids.length, 0),
    [selections]
  );

  const isResolving = resolveMutation.isPending;

  const handleToggleSong = (group: SongDuplicateGroup, songId: number) => {
    // The original is locked and can never be ticked
    if (songId === group.recommendedKeepId && group.category !== 'MANUAL_REVIEW') return;
    setSelections((prev) => {
      const current = prev[group.groupKey] ?? [];
      const next = current.includes(songId)
        ? current.filter((id) => id !== songId)
        : [...current, songId];
      return { ...prev, [group.groupKey]: next };
    });
  };

  const handleRemoveGroup = (group: SongDuplicateGroup) => {
    const songIds = selections[group.groupKey] ?? [];
    if (songIds.length === 0) return;
    resolveMutation.mutate({ songIds, mode: moveToTrash ? 'trash' : 'library-only' });
  };

  const handleRemoveAllSelected = () => {
    const songIds = groups
      .filter((group) => group.category !== 'ALTERNATIVE_VERSION')
      .flatMap((group) => selections[group.groupKey] ?? []);
    if (songIds.length > 0) {
      resolveMutation.mutate({ songIds, mode: moveToTrash ? 'trash' : 'library-only' });
    }
  };

  const handleClose = () => {
    changePromptMenuData(false);
  };

  return (
    <div className="flex max-h-[75vh] w-full flex-col">
      {/* Header */}
      <div className="mb-4 shrink-0 border-b border-black/10 pb-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-font-color-highlight text-2xl">
            cleaning_services
          </span>
          <h2 className="text-2xl font-semibold">
            {t('duplicateSongsPrompt.title', 'Duplicate Songs')}
          </h2>
          <span className="rounded-full bg-black/10 px-2.5 py-0.5 text-xs font-semibold dark:bg-white/10">
            {groups.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          {groups.length > 0
            ? t(
                'duplicateSongsPrompt.subtitle',
                { count: groups.length },
                'The original copy is locked and kept safe. Verify the ticked copies below before removing.'
              )
            : t(
                'duplicateSongsPrompt.noDuplicates',
                'No duplicate songs found — your library is clean!'
              )}
        </p>
      </div>

      {/* Body: Scrollable groups list */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isFetching && groups.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-black/60 dark:text-white/60">
            <span className="material-icons-round animate-spin text-3xl">progress_activity</span>
            <span>
              {t('duplicateSongsPrompt.scanning', 'Scanning your library for duplicates…')}
            </span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <span className="material-icons-round text-5xl text-green-500">check_circle</span>
            <p className="text-lg font-medium">
              {t(
                'duplicateSongsPrompt.noDuplicates',
                'No duplicate songs found — your library is clean!'
              )}
            </p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {t(
                'duplicateSongsPrompt.noDuplicatesDesc',
                'All indexed tracks appear to be unique recordings.'
              )}
            </p>
          </div>
        ) : (
          CATEGORY_ORDER.map((category) => {
            const categoryGroups = groupedByCategory.get(category);
            if (!categoryGroups || categoryGroups.length === 0) return null;
            const meta = SECTION_META[category];
            return (
              <section key={category} className="mb-5 last:mb-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`material-icons-round text-[20px] ${meta.accentClassName}`}>
                    {meta.icon}
                  </span>
                  <p className="text-base font-semibold">{t(meta.titleKey)}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.accentClassName}`}
                  >
                    {categoryGroups.length}
                  </span>
                </div>
                <p className="mb-2.5 text-xs text-black/60 dark:text-white/60">
                  {t(meta.descriptionKey)}
                </p>
                {categoryGroups.map((group) => (
                  <DuplicateGroupCard
                    key={group.groupKey}
                    group={group}
                    selection={selections[group.groupKey] ?? []}
                    isResolving={isResolving}
                    onToggleSong={handleToggleSong}
                    onRemove={handleRemoveGroup}
                    onIgnore={(g) => ignoreMutation.mutate(g)}
                    t={t}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3 dark:border-white/10">
        <Checkbox
          id="duplicateMoveToTrash"
          isChecked={moveToTrash}
          checkedStateUpdateFunction={setMoveToTrash}
          labelContent={t(
            'duplicateSongsSuggestion.moveToTrash',
            'Move files to Trash (recoverable)'
          )}
          isDisabled={isResolving}
        />

        <div className="flex items-center gap-2">
          <Button
            label={t('duplicateSongsPrompt.close', 'Close')}
            clickHandler={handleClose}
            className="px-4!"
          />
          {groups.length > 0 && (
            <Button
              label={t('duplicateSongsPrompt.removeAllSelected', {
                count: totalSelected,
                defaultValue: `Remove Selected (${totalSelected})`
              })}
              iconName="delete_sweep"
              className="bg-font-color-crimson! text-font-color-white! hover:border-font-color-crimson dark:bg-font-color-crimson! dark:text-font-color-white! dark:hover:border-font-color-crimson px-5!"
              isDisabled={totalSelected === 0 || isResolving}
              clickHandler={handleRemoveAllSelected}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Group Card
// ---------------------------------------------------------------------------

interface GroupCardProps {
  group: SongDuplicateGroup;
  selection: number[];
  isResolving: boolean;
  onToggleSong: (group: SongDuplicateGroup, songId: number) => void;
  onRemove: (group: SongDuplicateGroup) => void;
  onIgnore: (group: SongDuplicateGroup) => void;
  t: (key: string, options?: any) => string;
}

function DuplicateGroupCard({
  group,
  selection,
  isResolving,
  onToggleSong,
  onRemove,
  onIgnore,
  t
}: GroupCardProps) {
  const isVersionFamily = group.category === 'ALTERNATIVE_VERSION';
  const isReview = group.category === 'MANUAL_REVIEW';
  const canRemove =
    !isVersionFamily && selection.length > 0 && selection.length < group.songs.length;

  return (
    <div className="bg-background-color-2 dark:bg-dark-background-color-2 mb-3 rounded-lg border border-black/5 p-3.5 shadow-xs dark:border-white/5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{group.songs[0]?.title}</p>
          <p className="truncate text-xs text-black/60 dark:text-white/60">
            {group.songs[0]?.artist}
          </p>
        </div>
        <span className="shrink-0 text-xs text-black/50 dark:text-white/50">
          {group.songs.length} files
        </span>
      </div>

      {isReview && (
        <div className="mb-2 flex flex-wrap gap-1">
          {group.reasons.map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] text-blue-600 dark:text-blue-400"
            >
              {t(REASON_LABEL_KEYS[reason] ?? 'duplicateSongsSuggestion.needsReviewDesc')}
            </span>
          ))}
        </div>
      )}

      {/* Song rows */}
      <div className="flex flex-col gap-1.5">
        {group.songs.map((song) => {
          const isLockedOriginal = !isReview && song.id === group.recommendedKeepId;
          return (
            <div
              key={song.id}
              className={`flex items-center gap-2.5 rounded-md p-2 transition-colors ${
                isLockedOriginal
                  ? 'border border-green-500/30 bg-green-500/15 dark:bg-green-400/15'
                  : 'bg-background-color-1 dark:bg-dark-background-color-1 border border-black/5 dark:border-white/5'
              }`}
            >
              {isVersionFamily ? null : isLockedOriginal ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-500/25 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:text-green-300">
                  <span className="material-icons-round text-[13px]">lock</span>
                  {t('duplicateSongsPrompt.originalBadge', 'Original (Keep)')}
                </span>
              ) : (
                <input
                  type="checkbox"
                  checked={selection.includes(song.id)}
                  onChange={() => onToggleSong(group, song.id)}
                  disabled={isResolving}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-green-600"
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium">{song.title}</p>
                </div>
                <p
                  className="truncate text-[11px] text-black/50 dark:text-white/50"
                  title={song.path ?? undefined}
                >
                  {song.path}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-[11px]">
                <span className="rounded-full bg-black/10 px-2 py-0.5 font-mono dark:bg-white/10">
                  {qualityLabel(song, t)}
                </span>
                <span className="text-black/60 dark:text-white/60">
                  {formatDuration(song.durationSec)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Card actions */}
      {isVersionFamily ? (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-black/60 dark:text-white/60">
            {t('duplicateSongsSuggestion.versionNote')}
          </p>
          <Button
            label={t('duplicateSongsSuggestion.hide', 'Hide')}
            iconName="visibility_off"
            className="text-xs"
            clickHandler={() => onIgnore(group)}
          />
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <Button
            label={t('duplicateSongsSuggestion.ignore', 'Not duplicates')}
            iconName="do_not_disturb_on"
            className="text-xs"
            isDisabled={isResolving}
            clickHandler={() => onIgnore(group)}
          />
          <Button
            label={t('duplicateSongsSuggestion.removeSelected', {
              count: selection.length,
              defaultValue: `Remove selected (${selection.length})`
            })}
            iconName="delete"
            className="bg-font-color-crimson! text-font-color-white! hover:border-font-color-crimson dark:bg-font-color-crimson! dark:text-font-color-white! dark:hover:border-font-color-crimson text-xs"
            isDisabled={!canRemove || isResolving}
            clickHandler={() => onRemove(group)}
          />
        </div>
      )}
    </div>
  );
}

export default DuplicateSongsCleanupPrompt;
