import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { albumQuery } from '../queries/albums';
import { songQuery } from '../queries/songs';
import { metadataApi } from '../services/metadataApi';
import type { SongDataForAutoTag } from '../utils/autoTagUtils';

export interface TrackCandidate {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  provider: string;
  confidenceScore?: number;
}

export interface TrackFieldDiff {
  fieldId: string;
  oldValue: string | number | undefined;
  suggestedValue: string | number | undefined;
  enabled: boolean;
}

export interface UseTrackIdentifyState {
  /** Songs being processed */
  songs: SongDataForAutoTag[];
  /** Index of the current song in the array */
  currentIndex: number;
  /** Search query fields for the current song */
  searchTitle: string;
  searchArtist: string;
  searchAlbum: string;
  /** Candidate recordings returned by MusicBrainz */
  candidates: TrackCandidate[];
  /** Currently selected candidate */
  selectedCandidateId: string | null;
  /** Field diffs for the selected candidate */
  fieldDiffs: TrackFieldDiff[];
  /** Preview object (opaque, passed to applyPreview) */
  preview: any | null;
  /** Loading states */
  loadingSearch: boolean;
  loadingPreview: boolean;
  loadingApply: boolean;
  /** Error message */
  error: string | null;
  /** Tracks that have already been processed (applied or skipped) */
  processedIndices: Set<number>;
  /** Total applied count */
  appliedCount: number;
  /** Whether all songs are done */
  isComplete: boolean;
}

export interface UseTrackIdentifyActions {
  setSearchTitle: (val: string) => void;
  setSearchArtist: (val: string) => void;
  setSearchAlbum: (val: string) => void;
  search: () => Promise<void>;
  selectCandidate: (candidateId: string) => Promise<void>;
  toggleField: (fieldId: string) => void;
  applyCurrentTrack: () => Promise<boolean>;
  skipTrack: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  applyAll: () => Promise<void>;
  reset: () => void;
}

export function useTrackIdentify(
  songs: SongDataForAutoTag[]
): { state: UseTrackIdentifyState; actions: UseTrackIdentifyActions } {
  const queryClient = useQueryClient();
  const operationIdRef = useRef(`track-identify-${Date.now()}`);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchTitle, setSearchTitle] = useState(songs[0]?.title ?? '');
  const [searchArtist, setSearchArtist] = useState(
    songs[0]?.artists?.[0]?.name ?? ''
  );
  const [searchAlbum, setSearchAlbum] = useState(
    songs[0]?.album?.name ?? ''
  );
  const [candidates, setCandidates] = useState<TrackCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<
    string | null
  >(null);
  const [fieldDiffs, setFieldDiffs] = useState<TrackFieldDiff[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedIndices, setProcessedIndices] = useState<Set<number>>(
    new Set()
  );
  const [appliedCount, setAppliedCount] = useState(0);

  const currentSong = songs[currentIndex];

  const prefillForIndex = useCallback(
    (idx: number) => {
      const song = songs[idx];
      if (!song) return;
      setSearchTitle(song.title);
      setSearchArtist(song.artists?.[0]?.name ?? '');
      setSearchAlbum(song.album?.name ?? '');
      setCandidates([]);
      setSelectedCandidateId(null);
      setFieldDiffs([]);
      setPreview(null);
      setError(null);
    },
    [songs]
  );

  const buildPreviewForCandidate = useCallback(
    async (candidateId: string) => {
      if (!currentSong) return;
      setLoadingPreview(true);
      setError(null);

      try {
        const localSongs = [
          {
            songId: currentSong.songId,
            title: currentSong.title,
            artist: currentSong.artists?.map((a) => a.name).join(', ') ?? '',
            album: currentSong.album?.name ?? '',
            path: currentSong.path,
            trackNumber: currentSong.trackNo,
            discNumber: currentSong.discNo,
            year: currentSong.year,
            duration: currentSong.duration
          }
        ];

        const prev = await metadataApi.workflowBuildPreview(
          'track',
          localSongs,
          candidateId,
          'musicbrainz',
          operationIdRef.current
        );

        setPreview(prev);

        if (prev?.matches?.[0]?.fieldDiffs) {
          setFieldDiffs(
            prev.matches[0].fieldDiffs.map((d: any) => ({
              fieldId: d.fieldId,
              oldValue: d.oldValue,
              suggestedValue: d.suggestedValue,
              enabled: d.status !== 'unchanged'
            }))
          );
        }
      } catch (err: any) {
        setError(err?.message ?? 'Failed to build preview');
      } finally {
        setLoadingPreview(false);
      }
    },
    [currentSong]
  );

  const search = useCallback(async () => {
    if (!searchTitle.trim()) return;
    setLoadingSearch(true);
    setError(null);
    setCandidates([]);
    setSelectedCandidateId(null);
    setFieldDiffs([]);
    setPreview(null);

    try {
      const results = await metadataApi.workflowSearch(
        'track',
        { title: searchTitle, artist: searchArtist, album: searchAlbum },
        operationIdRef.current
      );
      setCandidates(results ?? []);

      // Auto-select top candidate and build preview
      if (results && results.length > 0) {
        setSelectedCandidateId(results[0].id);
        await buildPreviewForCandidate(results[0].id);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Search failed');
    } finally {
      setLoadingSearch(false);
    }
  }, [searchTitle, searchArtist, searchAlbum, buildPreviewForCandidate]);

  const selectCandidate = useCallback(
    async (candidateId: string) => {
      setSelectedCandidateId(candidateId);
      await buildPreviewForCandidate(candidateId);
    },
    [buildPreviewForCandidate]
  );

  const toggleField = useCallback((fieldId: string) => {
    setFieldDiffs((prev) =>
      prev.map((d) =>
        d.fieldId === fieldId ? { ...d, enabled: !d.enabled } : d
      )
    );
  }, []);

  const advanceToNext = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < songs.length) {
      setCurrentIndex(nextIdx);
      prefillForIndex(nextIdx);
    }
  }, [currentIndex, songs.length, prefillForIndex]);

  const applyCurrentTrack = useCallback(async (): Promise<boolean> => {
    if (!preview) return false;
    setLoadingApply(true);
    setError(null);

    try {
      const activeFields = fieldDiffs
        .filter((d) => d.enabled)
        .map((d) => d.fieldId);

      const res = await metadataApi.workflowApplyPreview(
        'track',
        preview,
        activeFields,
        undefined,
        operationIdRef.current
      );

      if (res.success) {
        setAppliedCount((prev) => prev + 1);
        setProcessedIndices((prev) => new Set([...prev, currentIndex]));
        queryClient.invalidateQueries({ queryKey: songQuery._def });
        queryClient.invalidateQueries({ queryKey: albumQuery._def });
        advanceToNext();
        return true;
      } else {
        setError(res.errors?.join('; ') ?? 'Apply failed');
        return false;
      }
    } catch (err: any) {
      setError(err?.message ?? 'Apply failed');
      return false;
    } finally {
      setLoadingApply(false);
    }
  }, [preview, fieldDiffs, currentIndex, queryClient, advanceToNext]);

  const skipTrack = useCallback(() => {
    setProcessedIndices((prev) => new Set([...prev, currentIndex]));
    advanceToNext();
  }, [currentIndex, advanceToNext]);

  const prevTrack = useCallback(() => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      prefillForIndex(prevIdx);
    }
  }, [currentIndex, prefillForIndex]);

  const applyAll = useCallback(async () => {
    // Apply current track if it has a preview, then auto-apply remaining
    for (let i = currentIndex; i < songs.length; i++) {
      if (processedIndices.has(i)) continue;

      // If not the current index, prefill and search first
      if (i !== currentIndex) {
        setCurrentIndex(i);
        const song = songs[i];
        if (!song) continue;

        try {
          setLoadingSearch(true);
          const results = await metadataApi.workflowSearch(
            'track',
            {
              title: song.title,
              artist: song.artists?.[0]?.name,
              album: song.album?.name
            },
            operationIdRef.current
          );

          if (!results || results.length === 0) {
            setProcessedIndices((prev) => new Set([...prev, i]));
            continue;
          }

          const localSongs = [
            {
              songId: song.songId,
              title: song.title,
              artist: song.artists?.map((a) => a.name).join(', ') ?? '',
              album: song.album?.name ?? '',
              path: song.path,
              trackNumber: song.trackNo,
              discNumber: song.discNo,
              year: song.year,
              duration: song.duration
            }
          ];

          const prev = await metadataApi.workflowBuildPreview(
            'track',
            localSongs,
            results[0].id,
            'musicbrainz',
            operationIdRef.current
          );

          if (prev) {
            const activeFields =
              prev.supportedFields
                ?.filter((f: any) => f.defaultEnabled)
                .map((f: any) => f.fieldId) ?? [];

            await metadataApi.workflowApplyPreview(
              'track',
              prev,
              activeFields,
              undefined,
              operationIdRef.current
            );
            setAppliedCount((c) => c + 1);
          }

          setProcessedIndices((prev) => new Set([...prev, i]));
        } catch {
          setProcessedIndices((prev) => new Set([...prev, i]));
        } finally {
          setLoadingSearch(false);
        }
      } else {
        // Current index — apply if preview exists
        if (preview) {
          await applyCurrentTrack();
        } else {
          setProcessedIndices((prev) => new Set([...prev, i]));
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: songQuery._def });
    queryClient.invalidateQueries({ queryKey: albumQuery._def });
  }, [
    currentIndex,
    songs,
    processedIndices,
    preview,
    applyCurrentTrack,
    queryClient
  ]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setCandidates([]);
    setSelectedCandidateId(null);
    setFieldDiffs([]);
    setPreview(null);
    setError(null);
    setProcessedIndices(new Set());
    setAppliedCount(0);
    if (songs[0]) prefillForIndex(0);
  }, [songs, prefillForIndex]);

  const isComplete =
    songs.length > 0 && processedIndices.size >= songs.length;

  return {
    state: {
      songs,
      currentIndex,
      searchTitle,
      searchArtist,
      searchAlbum,
      candidates,
      selectedCandidateId,
      fieldDiffs,
      preview,
      loadingSearch,
      loadingPreview,
      loadingApply,
      error,
      processedIndices,
      appliedCount,
      isComplete
    },
    actions: {
      setSearchTitle,
      setSearchArtist,
      setSearchAlbum,
      search,
      selectCandidate,
      toggleField,
      applyCurrentTrack,
      skipTrack,
      nextTrack: advanceToNext,
      prevTrack,
      applyAll,
      reset
    }
  };
}
