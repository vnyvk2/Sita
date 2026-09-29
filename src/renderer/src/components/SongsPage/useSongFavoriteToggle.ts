import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useNotifications } from '../../hooks/useNotifications';
import { songCacheKeys, songQuery } from '../../queries/songs';
import { queryClient } from '../../queryClient';
import type { PaginatedResult, SongData, SongSortTypes } from '../../../../../types/app';

export interface UseSongFavoriteToggleProps {
  songId: number;
  isAFavorite?: boolean;
  isCurrentSong?: boolean;
  triggerBurst?: () => void;
  toggleIsFavorite?: (isFavorite?: boolean, updateQueue?: boolean) => void;
}

export interface UseSongFavoriteToggleReturn {
  isFavorite: boolean;
  toggleFavorite: () => void;
}

export function applyFavoriteToCaches(songId: number, isFav: boolean): void {
  // 1. Optimistically update all windowed query caches in React Query
  queryClient.setQueriesData<SongData[]>({ queryKey: songCacheKeys.windowsRoot }, (old) => {
    if (!Array.isArray(old)) return old;
    let changed = false;
    const updated = old.map((s) => {
      if (s && s.songId === songId) {
        changed = true;
        return { ...s, isAFavorite: isFav };
      }
      return s;
    });
    return changed ? updated : old;
  });

  // 2. Optimistically update legacy/non-windowed song queries
  queryClient.setQueriesData<PaginatedResult<SongData, SongSortTypes>>(
    { queryKey: songQuery.all._def },
    (old) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((s) => (s.songId === songId ? { ...s, isAFavorite: isFav } : s))
      };
    }
  );
}

/**
 * Shared favorite toggle hook with deduplicated cache synchronization,
 * optimistic updates, sequence-guarded async rollback, player bar heart sync,
 * and error notification handling.
 */
export function useSongFavoriteToggle({
  songId,
  isAFavorite: initialFavorite = false,
  isCurrentSong = false,
  triggerBurst,
  toggleIsFavorite: directToggleIsFavorite
}: UseSongFavoriteToggleProps): UseSongFavoriteToggleReturn {
  const { t } = useTranslation();
  const context = useContext(AppUpdateContext);
  const { addNewNotifications: hookNotifications } = useNotifications();

  const toggleIsFavorite = directToggleIsFavorite ?? context.toggleIsFavorite;
  const addNewNotifications = context.addNewNotifications ?? hookNotifications;

  const [optimisticFavorite, setOptimisticFavorite] = useState<{
    songId: number;
    isFavorite: boolean;
  } | null>(null);
  const likeMutationSeqRef = useRef(0);

  useEffect(() => {
    setOptimisticFavorite(null);
  }, [initialFavorite, songId]);

  const effectiveIsFavorite =
    optimisticFavorite?.songId === songId ? optimisticFavorite.isFavorite : initialFavorite;

  const toggleFavorite = useCallback(() => {
    const nextFav = !effectiveIsFavorite;
    const currentSeq = ++likeMutationSeqRef.current;

    // 1. Synchronous row feedback & burst
    setOptimisticFavorite({ songId, isFavorite: nextFav });
    if (nextFav && triggerBurst) {
      triggerBurst();
    }

    // 2. Optimistically update query caches
    applyFavoriteToCaches(songId, nextFav);

    // 3. Audio player heart sync
    if (isCurrentSong && toggleIsFavorite) {
      toggleIsFavorite(nextFav, true);
    }

    // 4. Dispatch IPC with complete rollback
    window.api.playerControls
      .toggleLikeSongs([songId], nextFav)
      .then((res) => {
        if (likeMutationSeqRef.current !== currentSeq) return;

        if (res && res.likes.length + res.dislikes.length === 0) {
          // DB did not change any rows — rollback
          setOptimisticFavorite({ songId, isFavorite: !nextFav });
          applyFavoriteToCaches(songId, !nextFav);
          if (isCurrentSong && toggleIsFavorite) {
            toggleIsFavorite(!nextFav, true);
          }
        } else {
          queryClient.invalidateQueries({ queryKey: songCacheKeys.favorites() });
        }
      })
      .catch((err) => {
        if (likeMutationSeqRef.current !== currentSeq) return;

        console.error('[useSongFavoriteToggle] Failed to toggle like:', err);
        setOptimisticFavorite({ songId, isFavorite: !nextFav });
        applyFavoriteToCaches(songId, !nextFav);
        if (isCurrentSong && toggleIsFavorite) {
          toggleIsFavorite(!nextFav, true);
        }
        addNewNotifications([
          {
            id: `toggleLikeError-${songId}`,
            content: t('song.toggleLikeFailed'),
            iconName: 'error',
            duration: 5000
          }
        ]);
      });
  }, [
    effectiveIsFavorite,
    songId,
    triggerBurst,
    isCurrentSong,
    toggleIsFavorite,
    addNewNotifications,
    t
  ]);

  return {
    isFavorite: effectiveIsFavorite,
    toggleFavorite
  };
}
