import { store } from '@renderer/store/store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../contexts/AppUpdateContext';
import Button from './Button';

// ---------------------------------------------------------------------------
// Types — mirror of the main-process payload (plain serializable data)
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

function qualityLabel(song: SongDuplicateSong, t: (key: string) => string): string {
  const format = (song.format ?? '').toLowerCase();
  if (format === '') return '—';
  if (LOSSLESS_FORMATS.has(format)) {
    return `${format.toUpperCase()} · ${t('duplicateSongsSuggestion.lossless')}`;
  }
  if (song.bitrateKbps != null) return `${format.toUpperCase()} · ${song.bitrateKbps} kbps`;
  return format.toUpperCase();
}

/** Pre-selection: everything except the recommended keep (review groups: user decides). */
function initialSelection(group: SongDuplicateGroup): number[] {
  if (group.category === 'EXACT_DUPLICATE' || group.category === 'PROBABLE_DUPLICATE') {
    return group.songs.filter((song) => song.id !== group.recommendedKeepId).map((song) => song.id);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DuplicateSongsSuggestion() {
  const queryClient = useQueryClient();
  const { addNewNotifications } = useContext(AppUpdateContext);
  const { t, i18n } = useTranslation();
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [moveToTrash, setMoveToTrash] = useState(true);
  const [selections, setSelections] = useState<Record<string, number[]>>({});

  const { data: groups = [] } = useQuery({
    queryKey: ['songDuplicateGroups'],
    queryFn: () => window.api.getSongDuplicateGroups() as Promise<SongDuplicateGroup[]>
  });

  // Re-apply pre-selections whenever a fresh snapshot arrives (also drops
  // selections belonging to resolved/ignored groups).
  useEffect(() => {
    const next: Record<string, number[]> = {};
    for (const group of groups) next[group.groupKey] = initialSelection(group);
    setSelections(next);
  }, [groups]);

  const resolveMutation = useMutation({
    mutationFn: (vars: {
      group: SongDuplicateGroup;
      songIds: number[];
      mode: 'trash' | 'library-only';
    }) =>
      window.api.resolveSongDuplicates({
        songIds: vars.songIds,
        mode: vars.mode
      }) as Promise<ResolveDuplicatesResult>,
    onSuccess: (result, vars) => {
      if (!result.ok) {
        // backend rejected — nothing happened, snapshot still valid, no refetch
        addNewNotifications([
          {
            id: 'duplicateResolveRejected',
            iconName: 'error_outline',
            content: result.reason ?? t('duplicateSongsSuggestion.resolveFailed')
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
              count: result.removed.length
            })
          }
        ]);
      }
      if (result.failed.length > 0) {
        addNewNotifications([
          {
            id: 'duplicateResolvePartial',
            iconName: 'warning_amber',
            content: t('duplicateSongsSuggestion.partialRemoval', { count: result.failed.length })
          }
        ]);
      }
      setSelections((prev) => {
        const next = { ...prev };
        delete next[vars.group.groupKey];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['songDuplicateGroups'] });
    },
    onError: () => {
      addNewNotifications([
        {
          id: 'duplicateResolveFailed',
          iconName: 'error_outline',
          content: t('duplicateSongsSuggestion.resolveFailed')
        }
      ]);
    }
  });

  const ignoreMutation = useMutation({
    mutationFn: async (group: SongDuplicateGroup) => {
      // one row per song — robust to the adapter's filter semantics and
      // survives partial resolution
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
          content: t('notifications.suggestionIgnored')
        }
      ]);
      void queryClient.invalidateQueries({ queryKey: ['songDuplicateGroups'] });
    },
    onError: () => {
      addNewNotifications([
        {
          id: 'duplicateIgnoreFailed',
          iconName: 'error_outline',
          content: t('duplicateSongsSuggestion.ignoreFailed')
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

  if (groups.length === 0) return null;

  const isResolving = resolveMutation.isPending;

  const handleToggleSong = (group: SongDuplicateGroup, songId: number) => {
    setSelections((prev) => {
      const current = prev[group.groupKey] ?? [];
      const next = current.includes(songId)
        ? current.filter((id) => id !== songId)
        : [...current, songId];
      return { ...prev, [group.groupKey]: next };
    });
  };

  const handleRemove = (group: SongDuplicateGroup) => {
    const songIds = selections[group.groupKey] ?? [];
    resolveMutation.mutate({ group, songIds, mode: moveToTrash ? 'trash' : 'library-only' });
  };

  return (
    <div
      key={i18n.language}
      className={`appear-from-bottom mx-auto mb-6 w-full rounded-lg p-4 shadow-md transition-[height] ${
        bodyBackgroundImage
          ? 'bg-background-color-2/75 dark:bg-dark-background-color-2/75 backdrop-blur-xs'
          : 'bg-background-color-2 dark:bg-dark-background-color-2'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-black/10 px-2 py-1 text-[11px] dark:bg-white/10">
            <span className="material-icons-round text-[16px]">science</span>
            <span>{t('duplicateSongsSuggestion.experimental')}</span>
          </div>
          <p className="text-xl font-medium">{t('duplicateSongsSuggestion.title')}</p>
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">
            {groups.length}
          </span>
        </div>
        <Button
          id="toggleSongDuplicatesBox"
          className="hover:bg-background-color-1/50 dark:hover:bg-dark-background-color-1/50 m-0! border-0! p-0! outline-offset-1 focus-visible:outline!"
          iconClassName="leading-none! text-3xl!"
          iconName={isCollapsed ? 'arrow_drop_down' : 'arrow_drop_up'}
          tooltipLabel={isCollapsed ? t('common.showSuggestion') : t('common.hideSuggestion')}
          clickHandler={(e) => {
            e.preventDefault();
            setIsCollapsed((collapsed) => !collapsed);
          }}
        />
      </div>

      {!isCollapsed && (
        <div className="max-h-[60vh] overflow-y-auto px-1">
          {CATEGORY_ORDER.map((category) => {
            const categoryGroups = groupedByCategory.get(category);
            if (categoryGroups === undefined || categoryGroups.length === 0) return null;
            const meta = SECTION_META[category];
            return (
              <section key={category} className="mt-4 first:mt-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`material-icons-round text-[20px] ${meta.accentClassName}`}>
                    {meta.icon}
                  </span>
                  <p className="text-lg font-medium">{t(meta.titleKey)}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.accentClassName}`}
                  >
                    {categoryGroups.length}
                  </span>
                </div>
                <p className="mb-2 text-xs text-black/60 dark:text-white/60">
                  {t(meta.descriptionKey)}
                </p>
                {categoryGroups.map((group) => (
                  <DuplicateGroupCard
                    key={group.groupKey}
                    group={group}
                    selection={selections[group.groupKey] ?? []}
                    isResolving={isResolving}
                    onToggleSong={handleToggleSong}
                    onRemove={handleRemove}
                    onIgnore={(g) => ignoreMutation.mutate(g)}
                    moveToTrash={moveToTrash}
                    onToggleMoveToTrash={() => setMoveToTrash((v) => !v)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

interface GroupCardProps {
  group: SongDuplicateGroup;
  selection: number[];
  isResolving: boolean;
  onToggleSong: (group: SongDuplicateGroup, songId: number) => void;
  onRemove: (group: SongDuplicateGroup) => void;
  onIgnore: (group: SongDuplicateGroup) => void;
  moveToTrash: boolean;
  onToggleMoveToTrash: () => void;
}

function DuplicateGroupCard({
  group,
  selection,
  isResolving,
  onToggleSong,
  onRemove,
  onIgnore,
  moveToTrash,
  onToggleMoveToTrash
}: GroupCardProps) {
  const { t } = useTranslation();
  const isVersionFamily = group.category === 'ALTERNATIVE_VERSION';
  // mirrors the backend invariant: at least one file must survive
  const canRemove =
    !isVersionFamily && selection.length > 0 && selection.length < group.songs.length;

  return (
    <div className="bg-background-color-3 dark:bg-dark-background-color-3 mb-3 rounded-lg p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
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

      {group.category === 'MANUAL_REVIEW' && (
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

      <div className="flex flex-col gap-1">
        {group.songs.map((song) => (
          <div
            key={song.id}
            className="bg-background-color-2 dark:bg-dark-background-color-2 flex items-center gap-2 rounded-md p-2"
          >
            {!isVersionFamily && (
              <input
                type="checkbox"
                checked={selection.includes(song.id)}
                onChange={() => onToggleSong(group, song.id)}
                disabled={isResolving}
                className="h-4 w-4 shrink-0 cursor-pointer"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm">{song.title}</p>
                {song.id === group.recommendedKeepId && (
                  <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
                    {t('duplicateSongsSuggestion.recommended')}
                  </span>
                )}
              </div>
              <p
                className="truncate text-[11px] text-black/50 dark:text-white/50"
                title={song.path ?? undefined}
              >
                {song.path}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px]">
              <span className="rounded-full bg-black/10 px-2 py-0.5 dark:bg-white/10">
                {qualityLabel(song, t)}
              </span>
              <span className="text-black/60 dark:text-white/60">
                {formatDuration(song.durationSec)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {isVersionFamily ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-black/60 dark:text-white/60">
            {t('duplicateSongsSuggestion.versionNote')}
          </p>
          <Button
            label={t('duplicateSongsSuggestion.hide')}
            iconName="visibility_off"
            iconClassName="material-icons-round"
            className="bg-background-color-1/50 hover:bg-background-color-1 dark:bg-dark-background-color-1/50 dark:hover:bg-dark-background-color-1 border-0! px-4! py-1! text-xs transition-colors"
            clickHandler={() => onIgnore(group)}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs select-none">
            <input
              type="checkbox"
              checked={moveToTrash}
              onChange={onToggleMoveToTrash}
              disabled={isResolving}
              className="h-4 w-4 cursor-pointer"
            />
            <span>{t('duplicateSongsSuggestion.moveToTrash')}</span>
          </label>
          <div className="flex items-center gap-2">
            <Button
              label={t('duplicateSongsSuggestion.ignore')}
              iconName="do_not_disturb_on"
              iconClassName="material-icons-round"
              className="bg-background-color-1/50 hover:bg-background-color-1 dark:bg-dark-background-color-1/50 dark:hover:bg-dark-background-color-1 border-0! px-4! py-1! text-xs transition-colors"
              clickHandler={() => onIgnore(group)}
              isDisabled={isResolving}
            />
            <Button
              label={t('duplicateSongsSuggestion.removeSelected', { count: selection.length })}
              iconName="delete"
              iconClassName="material-icons-round"
              className="bg-font-color-crimson! text-font-color-white hover:border-font-color-crimson dark:bg-font-color-crimson! dark:text-font-color-white dark:hover:border-font-color-crimson border-0! px-4! py-1! text-xs transition-colors"
              clickHandler={() => onRemove(group)}
              isDisabled={!canRemove || isResolving}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DuplicateSongsSuggestion;
