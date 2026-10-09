import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useNotifications } from '../../hooks/useNotifications';
import { songQuery } from '../../queries/songs';
import { queryClient as defaultQueryClient } from '../../queryClient';

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

export function applyFavoriteToCaches(
  songId: number,
  isFav: boolean,
  client: QueryClient = defaultQueryClient
): void {
  // 1. Optimistically update all active windowed query caches across all keyPrefixes
  const windowQueries = client.getQueryCache().findAll({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey.length >= 2 &&
      query.queryKey[1] === 'window'
  });

  for (const wQuery of windowQueries) {
    client.setQueryData<SongData[]>(wQuery.queryKey, (old) => {
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
  }

  // 2. Optimistically update legacy/non-windowed song queries
  client.setQueriesData<PaginatedResult<SongData, SongSortTypes>>(
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

export function invalidateLikeSensitiveQueries(client: QueryClient = defaultQueryClient): void {
  client.invalidateQueries({ queryKey: songQuery.favorites._def });
  const likeSensitiveFilters = new Set(['favorites', 'nonFavorites']);
  const idQueries = client.getQueryCache().findAll({ queryKey: songQuery.ids._def });
  for (const listQuery of idQueries) {
    const params = listQuery.queryKey?.[2] as { filterType?: string } | undefined;
    if (params && likeSensitiveFilters.has(params.filterType ?? '')) {
      client.invalidateQueries({ queryKey: listQuery.queryKey });
    }
  }
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
  const client = useQueryClient();
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
    applyFavoriteToCaches(songId, nextFav, client);

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
          applyFavoriteToCaches(songId, !nextFav, client);
          if (isCurrentSong && toggleIsFavorite) {
            toggleIsFavorite(!nextFav, true);
          }
          invalidateLikeSensitiveQueries(client);
        } else {
          // Success: Invalidate both legacy favorites query and like-sensitive ID lists
          // (such as the Favorites page) so favorited / unfavorited tracks reflect immediately.
          invalidateLikeSensitiveQueries(client);
        }
      })
      .catch((err) => {
        if (likeMutationSeqRef.current !== currentSeq) return;

        console.error('[useSongFavoriteToggle] Failed to toggle like:', err);
        setOptimisticFavorite({ songId, isFavorite: !nextFav });
        applyFavoriteToCaches(songId, !nextFav, client);
        if (isCurrentSong && toggleIsFavorite) {
          toggleIsFavorite(!nextFav, true);
        }
        invalidateLikeSensitiveQueries(client);
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
