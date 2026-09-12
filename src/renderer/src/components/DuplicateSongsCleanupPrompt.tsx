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

type TabFilter = 'ALL' | SongDuplicateCategory;

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
  {
    icon: string;
    titleKey: string;
    defaultTitle: string;
    descriptionKey: string;
    defaultDescription: string;
    accentClassName: string;
  }
> = {
  EXACT_DUPLICATE: {
    icon: 'content_copy',
    titleKey: 'duplicateSongsSuggestion.exactDuplicates',
    defaultTitle: 'Exact Duplicates',
    descriptionKey: 'duplicateSongsSuggestion.exactDuplicatesDesc',
    defaultDescription: 'Identical audio files found in multiple locations.',
    accentClassName: 'bg-green-500/20 text-green-600 dark:text-green-400'
  },
  PROBABLE_DUPLICATE: {
    icon: 'help_outline',
    titleKey: 'duplicateSongsSuggestion.probableDuplicates',
    defaultTitle: 'Probable Duplicates',
    descriptionKey: 'duplicateSongsSuggestion.probableDuplicatesDesc',
    defaultDescription: 'Same track with similar duration and metadata.',
    accentClassName: 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
  },
  MANUAL_REVIEW: {
    icon: 'rate_review',
    titleKey: 'duplicateSongsSuggestion.needsReview',
    defaultTitle: 'Needs Review',
    descriptionKey: 'duplicateSongsSuggestion.needsReviewDesc',
    defaultDescription: 'Potential duplicates that require manual inspection.',
    accentClassName: 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
  },
  ALTERNATIVE_VERSION: {
    icon: 'alt_route',
    titleKey: 'duplicateSongsSuggestion.otherVersions',
    defaultTitle: 'Other Versions',
    descriptionKey: 'duplicateSongsSuggestion.otherVersionsDesc',
    defaultDescription: 'Different versions (live, acoustic, remasters) of songs in your library.',
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

/**
 * The effective keeper: the swapped choice if it is still a group member (a resolve/refetch can
 * change membership), otherwise the engine recommendation. Swaps are session-only — no storage, no
 * persistence.
 */
function getEffectiveKeeper(
  group: SongDuplicateGroup,
  swappedKeepers: Record<string, number>
): number | null {
  const swapped = swappedKeepers[group.groupKey];
  if (swapped !== undefined && group.songs.some((song) => song.id === swapped)) {
    return swapped;
  }
  return group.recommendedKeepId;
}

/** Default selection: every copy except the (effective) keeper. */
function defaultSelection(
  group: SongDuplicateGroup,
  swappedKeepers: Record<string, number>
): number[] {
  if (group.category !== 'EXACT_DUPLICATE' && group.category !== 'PROBABLE_DUPLICATE') return [];
  const keeper = getEffectiveKeeper(group, swappedKeepers);
  return group.songs.filter((song) => song.id !== keeper).map((song) => song.id);
}

// ---------------------------------------------------------------------------
// Prompt Component (rendered inside Nora's PromptMenu)
// ---------------------------------------------------------------------------

export const DuplicateSongsCleanupPrompt = () => {
  const queryClient = useQueryClient();
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [selections, setSelections] = useState<Record<string, number[]>>({});
  const [swappedKeepers, setSwappedKeepers] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');
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
      next[group.groupKey] = defaultSelection(group, swappedKeepers);
    }
    setSelections(next);
    // Swaps are preserved across refetches; getEffectiveKeeper guards validity against group membership
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Fall back to 'ALL' if the active category tab emptied out after a resolution
  const effectiveTab: TabFilter =
    activeTab === 'ALL' || (groupedByCategory.get(activeTab)?.length ?? 0) > 0 ? activeTab : 'ALL';

  const tabEntries: Array<{
    id: TabFilter;
    label: string;
    count: number;
    accentClassName?: string;
  }> = [
    {
      id: 'ALL',
      label: (t as any)('duplicateSongsPrompt.all', { defaultValue: 'All' }) as string,
      count: groups.length
    },
    ...CATEGORY_ORDER.map((category) => ({
      id: category as TabFilter,
      label: (t as any)(SECTION_META[category].titleKey, {
        defaultValue: SECTION_META[category].defaultTitle
      }) as string,
      count: groupedByCategory.get(category)?.length ?? 0,
      accentClassName: SECTION_META[category].accentClassName
    })).filter((entry) => entry.count > 0)
  ];

  const handleToggleSong = (group: SongDuplicateGroup, songId: number) => {
    const keeper = getEffectiveKeeper(group, swappedKeepers);
    // The (possibly swapped) original is locked and can never be ticked
    if (group.category !== 'MANUAL_REVIEW' && keeper === songId) return;
    setSelections((prev) => {
      const current = prev[group.groupKey] ?? [];
      const next = current.includes(songId)
        ? current.filter((id) => id !== songId)
        : [...current, songId];
      return { ...prev, [group.groupKey]: next };
    });
  };

  const handleSwapKeeper = (group: SongDuplicateGroup, newKeeperId: number) => {
    const keeper = getEffectiveKeeper(group, swappedKeepers);
    if (keeper === null || keeper === newKeeperId) return;
    setSwappedKeepers((prev) => ({ ...prev, [group.groupKey]: newKeeperId }));
    setSelections((prev) => {
      const next = new Set(prev[group.groupKey] ?? []);
      next.add(keeper); // The demoted original becomes a deletion candidate
      next.delete(newKeeperId); // The new keeper is locked and never selected
      return { ...prev, [group.groupKey]: [...next] };
    });
  };

  const handleSectionSelectAll = (groupsInSection: SongDuplicateGroup[]) => {
    setSelections((prev) => {
      const next = { ...prev };
      for (const group of groupsInSection) {
        const keeper = getEffectiveKeeper(group, swappedKeepers);
        next[group.groupKey] = group.songs
          .filter((song) => song.id !== keeper)
          .map((song) => song.id);
      }
      return next;
    });
  };

  const handleSectionDeselectAll = (groupsInSection: SongDuplicateGroup[]) => {
    setSelections((prev) => {
      const next = { ...prev };
      for (const group of groupsInSection) next[group.groupKey] = [];
      return next;
    });
  };

  const isSectionFullySelected = (groupsInSection: SongDuplicateGroup[]): boolean =>
    groupsInSection.every((group) => {
      const keeper = getEffectiveKeeper(group, swappedKeepers);
      const target = group.songs.filter((song) => song.id !== keeper).length;
      return target > 0 && (selections[group.groupKey] ?? []).length === target;
    });

  const sectionHasSelection = (groupsInSection: SongDuplicateGroup[]): boolean =>
    groupsInSection.some((group) => (selections[group.groupKey] ?? []).length > 0);

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
      <div className="mb-3 shrink-0 border-b border-black/10 pb-3 dark:border-white/10">
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
            ? (t as any)('duplicateSongsPrompt.subtitle', {
                count: groups.length,
                defaultValue:
                  'The original copy is locked and kept safe. Verify the duplicate copies below before removing.'
              })
            : (t as any)('duplicateSongsPrompt.noDuplicates', {
                defaultValue: 'No duplicate songs found — your library is clean!'
              })}
        </p>
      </div>

      {/* Category Tabs */}
      {groups.length > 0 && (
        <div className="mb-3 flex shrink-0 flex-wrap gap-1.5 border-b border-black/10 pb-3 dark:border-white/10">
          {tabEntries.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                effectiveTab === tab.id
                  ? (tab.accentClassName ??
                    'bg-black/20 text-black dark:bg-white/25 dark:text-white')
                  : 'bg-black/5 text-black/60 hover:bg-black/10 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      )}

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
            if (effectiveTab !== 'ALL' && effectiveTab !== category) return null;
            const categoryGroups = groupedByCategory.get(category);
            if (!categoryGroups || categoryGroups.length === 0) return null;
            const meta = SECTION_META[category];
            const isReview = category === 'MANUAL_REVIEW';
            const isVersionFamily = category === 'ALTERNATIVE_VERSION';

            return (
              <section key={category} className="mb-5 last:mb-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`material-icons-round text-[20px] ${meta.accentClassName}`}>
                      {meta.icon}
                    </span>
                    <p className="text-base font-semibold">
                      {(t as any)(meta.titleKey, { defaultValue: meta.defaultTitle })}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.accentClassName}`}
                    >
                      {categoryGroups.length}
                    </span>
                  </div>

                  {/* Bulk Select / Deselect controls */}
                  {!isVersionFamily &&
                    (isReview ? (
                      sectionHasSelection(categoryGroups) ? (
                        <BulkToggleButton
                          label={t('duplicateSongsPrompt.deselectAll', 'Deselect All')}
                          onClick={() => handleSectionDeselectAll(categoryGroups)}
                          disabled={isResolving}
                        />
                      ) : null
                    ) : (
                      <BulkToggleButton
                        label={
                          isSectionFullySelected(categoryGroups)
                            ? t('duplicateSongsPrompt.deselectAll', 'Deselect All')
                            : t('duplicateSongsPrompt.selectAll', 'Select All')
                        }
                        onClick={() =>
                          isSectionFullySelected(categoryGroups)
                            ? handleSectionDeselectAll(categoryGroups)
                            : handleSectionSelectAll(categoryGroups)
                        }
                        disabled={isResolving}
                      />
                    ))}
                </div>
                <p className="mb-2.5 text-xs text-black/60 dark:text-white/60">
                  {(t as any)(meta.descriptionKey, { defaultValue: meta.defaultDescription })}
                </p>
                {categoryGroups.map((group) => (
                  <DuplicateGroupCard
                    key={group.groupKey}
                    group={group}
                    keeperId={getEffectiveKeeper(group, swappedKeepers)}
                    selection={selections[group.groupKey] ?? []}
                    isResolving={isResolving}
                    onToggleSong={handleToggleSong}
                    onRemove={handleRemoveGroup}
                    onIgnore={(g) => ignoreMutation.mutate(g)}
                    onSwapKeeper={handleSwapKeeper}
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
  keeperId: number | null;
  selection: number[];
  isResolving: boolean;
  onToggleSong: (group: SongDuplicateGroup, songId: number) => void;
  onRemove: (group: SongDuplicateGroup) => void;
  onIgnore: (group: SongDuplicateGroup) => void;
  onSwapKeeper: (group: SongDuplicateGroup, newKeeperId: number) => void;
  t: (key: any, options?: any) => string;
}

function DuplicateGroupCard({
  group,
  keeperId,
  selection,
  isResolving,
  onToggleSong,
  onRemove,
  onIgnore,
  onSwapKeeper,
  t
}: GroupCardProps) {
  const isVersionFamily = group.category === 'ALTERNATIVE_VERSION';
  const isReview = group.category === 'MANUAL_REVIEW';
  const hasKeeperLogic = !isVersionFamily && !isReview;
  const canRemove =
    !isVersionFamily && selection.length > 0 && selection.length < group.songs.length;

  return (
    <div className="bg-background-color-2 dark:bg-dark-background-color-2 mb-2.5 rounded-lg border border-black/5 p-3 shadow-xs dark:border-white/5">
      {/* Card Header: Left side Title/Artist/Info, Right side Actions */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{group.songs[0]?.title}</p>
          <span className="text-xs opacity-40">•</span>
          <p className="truncate text-xs text-black/60 dark:text-white/60">
            {group.songs[0]?.artist}
          </p>
          <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
            {group.songs.length} files
          </span>
          {isReview &&
            group.reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"
              >
                {t(REASON_LABEL_KEYS[reason] ?? 'duplicateSongsSuggestion.needsReviewDesc')}
              </span>
            ))}
        </div>

        {/* Right side: Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          {isVersionFamily ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-black/50 dark:text-white/50">
                {t('duplicateSongsSuggestion.versionNote')}
              </span>
              <Button
                label={t('duplicateSongsSuggestion.hide', 'Hide')}
                iconName="visibility_off"
                className="px-2.5! py-0.5! text-xs"
                clickHandler={() => onIgnore(group)}
              />
            </div>
          ) : (
            <>
              <Button
                label={t('duplicateSongsSuggestion.ignore', 'Not duplicates')}
                iconName="do_not_disturb_on"
                className="px-2.5! py-0.5! text-xs"
                isDisabled={isResolving}
                clickHandler={() => onIgnore(group)}
              />
              <Button
                label={t('duplicateSongsSuggestion.removeSelected', {
                  count: selection.length,
                  defaultValue: `Remove selected (${selection.length})`
                })}
                iconName="delete"
                className="bg-font-color-crimson! text-font-color-white! hover:border-font-color-crimson dark:bg-font-color-crimson! dark:text-font-color-white! dark:hover:border-font-color-crimson px-3! py-0.5! text-xs"
                isDisabled={!canRemove || isResolving}
                clickHandler={() => onRemove(group)}
              />
            </>
          )}
        </div>
      </div>

      {/* Song rows — single compact line per track */}
      <div className="flex flex-col gap-1">
        {group.songs.map((song) => {
          const isLockedOriginal = hasKeeperLogic && song.id === keeperId;
          return (
            <div
              key={song.id}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors ${
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

              <div className="flex min-w-0 flex-1 items-center gap-3">
                <p
                  className="max-w-[260px] shrink-0 truncate text-xs font-medium"
                  title={song.title}
                >
                  {song.title}
                </p>
                <p
                  className="flex-1 truncate font-mono text-[11px] text-black/45 dark:text-white/45"
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

              {hasKeeperLogic && !isLockedOriginal && (
                <button
                  type="button"
                  title={t('duplicateSongsPrompt.keepInstead', 'Keep this file instead')}
                  onClick={() => onSwapKeeper(group, song.id)}
                  disabled={isResolving}
                  className="shrink-0 cursor-pointer rounded-full p-1 text-black/50 transition-colors hover:bg-black/10 hover:text-black dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <span className="material-icons-round text-[16px]">swap_vert</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BulkToggleButton({
  label,
  onClick,
  disabled
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 cursor-pointer text-xs text-black/60 transition-colors hover:text-black hover:underline disabled:opacity-50 dark:text-white/60 dark:hover:text-white"
    >
      {label}
    </button>
  );
}

export default DuplicateSongsCleanupPrompt;
