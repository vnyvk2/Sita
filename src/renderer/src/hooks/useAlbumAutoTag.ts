import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AlbumMetadata,
  AlbumTagPreview,
  AutoTagStage,
  MetadataFieldId,
  MetadataProviderId,
  ProgressEventPayload,
  TrackMatchPreview
} from '../../../common/metadata/types';
import { metadataApi } from '../services/metadataApi';
import { albumQuery } from '../queries/albums';
import { songQuery } from '../queries/songs';

export type AutoTagStep = 'search' | 'preview' | 'applying' | 'complete';
export type PreviewFilterOption = 'all' | 'changed' | 'low_confidence' | 'warnings';
export type PreviewSortOption = 'trackNumber' | 'confidence' | 'title';

export interface UseAlbumAutoTagState {
  step: AutoTagStep;
  stage: AutoTagStage;
  progressMessage: string;
  progressPercent: number;
  searchCandidates: AlbumMetadata[];
  preview: AlbumTagPreview | null;
  filteredMatches: TrackMatchPreview[];
  loading: boolean;
  error: string | null;
  canUndo: boolean;
  lastRestoredCount: number;
  selectedTrackIds: Set<number>;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  filter: PreviewFilterOption;
  sort: PreviewSortOption;
  operationId: string;
}

export interface UseAlbumAutoTagActions {
  searchReleases: (album: string, artist?: string) => Promise<void>;
  buildPreview: (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId) => Promise<void>;
  applyPreview: () => Promise<boolean>;
  undoLastAutoTag: () => Promise<boolean>;
  cancel: () => void;
  toggleTrack: (songId: number) => void;
  toggleField: (songId: number, fieldId: MetadataFieldId) => void;
  setFieldValue: (songId: number, fieldId: MetadataFieldId, value: string | number) => void;
  resetFieldValue: (songId: number, fieldId: MetadataFieldId) => void;
  selectAllTracks: () => void;
  selectChangedTracks: () => void;
  clearTrackSelections: () => void;
  setFilter: (filter: PreviewFilterOption) => void;
  setSort: (sort: PreviewSortOption) => void;
  reset: () => void;
}

export function useAlbumAutoTag(initialOperationId?: string) {
  const [operationId] = useState(() => initialOperationId ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `op_${Date.now()}`));
  const [step, setStep] = useState<AutoTagStep>('search');
  const [stage, setStage] = useState<AutoTagStage>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [searchCandidates, setSearchCandidates] = useState<AlbumMetadata[]>([]);
  const [preview, setPreview] = useState<AlbumTagPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [lastRestoredCount, setLastRestoredCount] = useState(0);

  // Separate Selection & Editing State
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [selectedFieldMap, setSelectedFieldMap] = useState<Map<string, boolean>>(new Map());
  const [userEditedValues, setUserEditedValues] = useState<Map<string, string | number>>(new Map());

  const [filter, setFilter] = useState<PreviewFilterOption>('all');
  const [sort, setSort] = useState<PreviewSortOption>('trackNumber');

  // IPC Progress Event Listener Subscription with operationId filtering guard
  useEffect(() => {
    const unsubscribe = metadataApi.onProgress((payload: ProgressEventPayload) => {
      if (payload && payload.operationId && payload.operationId === operationId) {
        setStage(payload.stage);
        if (payload.message) setProgressMessage(payload.message);
        if (payload.progressPercent !== undefined) setProgressPercent(payload.progressPercent);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [operationId]);

  const invalidateQueriesSafely = useCallback(() => {
    try {
      const { queryClient } = require('../index');
      if (queryClient && typeof queryClient.invalidateQueries === 'function') {
        queryClient.invalidateQueries({ queryKey: albumQuery._def });
        queryClient.invalidateQueries({ queryKey: songQuery._def });
      }
    } catch {
      // In Vitest standalone environment, ignore missing index module
    }
  }, []);

  // Actions
  const searchReleases = useCallback(async (album: string, artist?: string) => {
    setLoading(true);
    setError(null);
    setStep('search');
    try {
      const results = await metadataApi.searchAlbums(album, artist, 10, operationId);
      setSearchCandidates(results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [operationId]);

  const buildPreview = useCallback(async (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await metadataApi.buildPreview(localSongs, releaseId, providerId, operationId);

      if (res) {
        setPreview(res);
        setStep('preview');

        // Initialize track & field selections
        const newTrackIds = new Set<number>();
        const newFieldMap = new Map<string, boolean>();
        const newEdits = new Map<string, string | number>();

        for (const match of res.matches) {
          if (match.applyTrack) {
            newTrackIds.add(match.localSongId);
          }
          for (const diff of match.fieldDiffs) {
            const key = `${match.localSongId}::${diff.fieldId}`;
            newFieldMap.set(key, diff.applyField);
            if (diff.userValue !== undefined) {
              newEdits.set(key, diff.userValue);
            }
          }
        }

        setSelectedTrackIds(newTrackIds);
        setSelectedFieldMap(newFieldMap);
        setUserEditedValues(newEdits);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [operationId]);

  const applyPreview = useCallback(async (): Promise<boolean> => {
    if (!preview) return false;
    setLoading(true);
    setStep('applying');
    setError(null);

    try {
      // Build effective preview payload incorporating React state overrides
      const effectiveMatches: TrackMatchPreview[] = preview.matches.map((m) => {
        const applyTrack = selectedTrackIds.has(m.localSongId);
        const updatedDiffs = m.fieldDiffs.map((d) => {
          const key = `${m.localSongId}::${d.fieldId}`;
          const applyField = selectedFieldMap.get(key) ?? d.applyField;
          const userVal = userEditedValues.get(key) ?? d.userValue;
          return { ...d, applyField, userValue: userVal };
        });

        return { ...m, applyTrack, fieldDiffs: updatedDiffs };
      });

      const payload: AlbumTagPreview = { ...preview, matches: effectiveMatches };
      const res = await metadataApi.applyPreview(payload, operationId);

      if (res.success) {
        setStep('complete');
        setCanUndo(true);

        // Directly invalidate TanStack Query cache ON SUCCESS ONLY
        invalidateQueriesSafely();

        return true;
      } else {
        setError(res.errors?.join('; ') ?? 'Apply failed');
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [preview, selectedTrackIds, selectedFieldMap, userEditedValues, operationId, invalidateQueriesSafely]);

  const undoLastAutoTag = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await metadataApi.undoLastAutoTag(operationId);
      if (res.success) {
        setCanUndo(false);
        setLastRestoredCount(res.restoredCount);

        // Directly invalidate TanStack Query cache ON UNDO SUCCESS ONLY
        invalidateQueriesSafely();

        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [operationId, invalidateQueriesSafely]);

  const cancel = useCallback(() => {
    metadataApi.cancelAutoTag(operationId);
    setLoading(false);
    setStage('cancelled');
  }, [operationId]);

  // Selection & Editing Helper Actions
  const toggleTrack = useCallback((songId: number) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }, []);

  const toggleField = useCallback((songId: number, fieldId: MetadataFieldId) => {
    const key = `${songId}::${fieldId}`;
    setSelectedFieldMap((prev) => {
      const next = new Map(prev);
      next.set(key, !next.get(key));
      return next;
    });
  }, []);

  const setFieldValue = useCallback((songId: number, fieldId: MetadataFieldId, value: string | number) => {
    const key = `${songId}::${fieldId}`;
    setUserEditedValues((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  }, []);

  const resetFieldValue = useCallback((songId: number, fieldId: MetadataFieldId) => {
    if (!preview) return;
    const key = `${songId}::${fieldId}`;
    const match = preview.matches.find((m) => m.localSongId === songId);
    const diff = match?.fieldDiffs.find((d) => d.fieldId === fieldId);

    if (diff) {
      setUserEditedValues((prev) => {
        const next = new Map(prev);
        if (diff.suggestedValue !== undefined) next.set(key, diff.suggestedValue);
        else next.delete(key);
        return next;
      });
    }
  }, [preview]);

  const selectAllTracks = useCallback(() => {
    if (!preview) return;
    const all = new Set(preview.matches.map((m) => m.localSongId));
    setSelectedTrackIds(all);
  }, [preview]);

  const selectChangedTracks = useCallback(() => {
    if (!preview) return;
    const changed = new Set(
      preview.matches
        .filter((m) => m.fieldDiffs.some((d) => d.status === 'changed' || d.status === 'new'))
        .map((m) => m.localSongId)
    );
    setSelectedTrackIds(changed);
  }, [preview]);

  const clearTrackSelections = useCallback(() => {
    setSelectedTrackIds(new Set());
  }, []);

  const reset = useCallback(() => {
    setStep('search');
    setStage('idle');
    setProgressMessage('');
    setProgressPercent(0);
    setSearchCandidates([]);
    setPreview(null);
    setLoading(false);
    setError(null);
    setSelectedTrackIds(new Set());
    setSelectedFieldMap(new Map());
    setUserEditedValues(new Map());
  }, []);

  // Derived Filtered & Sorted Tracks
  const filteredMatches = useMemo(() => {
    if (!preview) return [];

    let result = [...preview.matches];

    // Filter
    if (filter === 'changed') {
      result = result.filter((m) => m.fieldDiffs.some((d) => d.status === 'changed' || d.status === 'new'));
    } else if (filter === 'low_confidence') {
      result = result.filter((m) => m.confidence < 0.80);
    } else if (filter === 'warnings') {
      result = result.filter((m) => m.hasWarnings);
    }

    // Sort
    result.sort((a, b) => {
      if (sort === 'confidence') return b.confidence - a.confidence;
      if (sort === 'title') return a.oldTitle.localeCompare(b.oldTitle);
      // Default: trackNumber
      const trackA = a.oldTrackNumber ?? 999;
      const trackB = b.oldTrackNumber ?? 999;
      return trackA - trackB;
    });

    return result;
  }, [preview, filter, sort]);

  return {
    state: {
      step,
      stage,
      progressMessage,
      progressPercent,
      searchCandidates,
      preview,
      filteredMatches,
      loading,
      error,
      canUndo,
      lastRestoredCount,
      selectedTrackIds,
      selectedFieldMap,
      userEditedValues,
      filter,
      sort,
      operationId
    },
    actions: {
      searchReleases,
      buildPreview,
      applyPreview,
      undoLastAutoTag,
      cancel,
      toggleTrack,
      toggleField,
      setFieldValue,
      resetFieldValue,
      selectAllTracks,
      selectChangedTracks,
      clearTrackSelections,
      setFilter,
      setSort,
      reset
    }
  };
}
