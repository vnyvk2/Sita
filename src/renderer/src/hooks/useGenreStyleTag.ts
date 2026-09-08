import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { albumQuery } from '../queries/albums';
import { genreQuery } from '../queries/genres';
import { songQuery } from '../queries/songs';
import { metadataApi } from '../services/metadataApi';
import {
  groupSongsByAlbum,
  type SongDataForAutoTag
} from '../utils/autoTagUtils';

export interface AlbumGroupResult {
  albumName: string;
  artist: string;
  songs: SongDataForAutoTag[];
  genre?: string;
  style?: string;
  candidateId?: string;
  preview?: any;
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'error';
  error?: string;
  enabled: boolean;
}

export interface UseGenreStyleTagState {
  groups: AlbumGroupResult[];
  loading: boolean;
  applying: boolean;
  error: string | null;
  appliedCount: number;
  isComplete: boolean;
}

export interface UseGenreStyleTagActions {
  toggleGroup: (albumName: string) => void;
  retryGroup: (albumName: string) => Promise<void>;
  applyAll: () => Promise<boolean>;
  reset: () => void;
}

export function useGenreStyleTag(
  songs: SongDataForAutoTag[]
): { state: UseGenreStyleTagState; actions: UseGenreStyleTagActions } {
  const queryClient = useQueryClient();
  const operationIdRef = useRef(`genre-style-${Date.now()}`);
  const searchedRef = useRef(false);

  const [groups, setGroups] = useState<AlbumGroupResult[]>(() => {
    const albumGroups = groupSongsByAlbum(songs);
    return Array.from(albumGroups.entries()).map(([albumName, groupSongs]) => ({
      albumName,
      artist: groupSongs[0]?.artists?.[0]?.name ?? '',
      songs: groupSongs,
      status: 'pending' as const,
      enabled: true
    }));
  });

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Auto-search all groups on mount
  useEffect(() => {
    if (searchedRef.current || groups.length === 0) return;
    searchedRef.current = true;
    void searchAllGroups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const searchGroup = useCallback(
    async (group: AlbumGroupResult): Promise<AlbumGroupResult> => {
      if (group.albumName === '(No Album)') {
        return { ...group, status: 'not_found', error: 'No album name' };
      }

      try {
        const results = await metadataApi.workflowSearch(
          'genre',
          { album: group.albumName, artist: group.artist },
          operationIdRef.current
        );

        if (!results || results.length === 0) {
          return { ...group, status: 'not_found' };
        }

        const top = results[0];
        return {
          ...group,
          candidateId: top.id,
          genre: top.genre,
          style: top.style,
          status: 'found'
        };
      } catch (err: any) {
        return {
          ...group,
          status: 'error',
          error: err?.message ?? 'Search failed'
        };
      }
    },
    []
  );

  const searchAllGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    const updatedGroups = await Promise.all(
      groups.map(async (group) => {
        setGroups((prev) =>
          prev.map((g) =>
            g.albumName === group.albumName
              ? { ...g, status: 'searching' as const }
              : g
          )
        );
        return searchGroup(group);
      })
    );

    setGroups(updatedGroups);
    setLoading(false);
  }, [groups, searchGroup]);

  const toggleGroup = useCallback((albumName: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.albumName === albumName ? { ...g, enabled: !g.enabled } : g
      )
    );
  }, []);

  const retryGroup = useCallback(
    async (albumName: string) => {
      const group = groups.find((g) => g.albumName === albumName);
      if (!group) return;

      setGroups((prev) =>
        prev.map((g) =>
          g.albumName === albumName
            ? { ...g, status: 'searching' as const }
            : g
        )
      );

      const updated = await searchGroup(group);
      setGroups((prev) =>
        prev.map((g) => (g.albumName === albumName ? updated : g))
      );
    },
    [groups, searchGroup]
  );

  const applyAll = useCallback(async (): Promise<boolean> => {
    const enabledGroups = groups.filter(
      (g) => g.enabled && g.status === 'found' && g.candidateId
    );

    if (enabledGroups.length === 0) {
      setError('No groups with genre/style data to apply');
      return false;
    }

    setApplying(true);
    setError(null);
    let totalApplied = 0;

    try {
      for (const group of enabledGroups) {
        const localSongs = group.songs.map((s) => ({
          songId: s.songId,
          title: s.title,
          artist: s.artists?.map((a) => a.name).join(', ') ?? '',
          album: s.album?.name ?? '',
          path: s.path,
          trackNumber: s.trackNo,
          discNumber: s.discNo,
          year: s.year,
          duration: s.duration,
          genre: s.genres?.map((g) => g.name).join(', ')
        }));

        const preview = await metadataApi.workflowBuildPreview(
          'genre',
          localSongs,
          group.candidateId!,
          'discogs',
          operationIdRef.current
        );

        if (preview) {
          const res = await metadataApi.workflowApplyPreview(
            'genre',
            preview,
            ['genre', 'style'],
            undefined,
            operationIdRef.current
          );

          if (res.success) {
            totalApplied += group.songs.length;
          }
        }
      }

      setAppliedCount(totalApplied);
      setIsComplete(true);
      queryClient.invalidateQueries({ queryKey: songQuery._def });
      queryClient.invalidateQueries({ queryKey: albumQuery._def });
      queryClient.invalidateQueries({ queryKey: genreQuery._def });
      return true;
    } catch (err: any) {
      setError(err?.message ?? 'Apply failed');
      return false;
    } finally {
      setApplying(false);
    }
  }, [groups, queryClient]);

  const reset = useCallback(() => {
    const albumGroups = groupSongsByAlbum(songs);
    setGroups(
      Array.from(albumGroups.entries()).map(([albumName, groupSongs]) => ({
        albumName,
        artist: groupSongs[0]?.artists?.[0]?.name ?? '',
        songs: groupSongs,
        status: 'pending' as const,
        enabled: true
      }))
    );
    setAppliedCount(0);
    setIsComplete(false);
    setError(null);
    searchedRef.current = false;
  }, [songs]);

  return {
    state: { groups, loading, applying, error, appliedCount, isComplete },
    actions: { toggleGroup, retryGroup, applyAll, reset }
  };
}
