import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AlbumMetadata,
  AlbumTagPreview,
  ApplyPreviewOptions,
  AutoTagSongInput,
  AutoTagStage,
  AvailableSearchProviderInfo,
  GlobalAlbumMutations,
  MetadataFieldId,
  MetadataProviderId,
  ProgressEventPayload,
  TrackMatchPreview
} from '../../../common/metadata/types';
import { albumQuery } from '../queries/albums';
import { artistQuery } from '../queries/artists';
import { genreQuery } from '../queries/genres';
import { songQuery } from '../queries/songs';
import { metadataApi } from '../services/metadataApi';

export type AutoTagStep = 'search' | 'preview' | 'applying' | 'complete';
export type PreviewFilterOption = 'all' | 'changed' | 'matched' | 'low_confidence' | 'warnings';
export type PreviewSortOption = 'trackNumber' | 'confidence' | 'title';
export type ArtworkSourceOption = 'musicbrainz' | 'coverartarchive' | 'discogs' | 'local';

export interface GlobalFieldDiff {
  fieldId: string;
  fieldName: string;
  oldValue: string;
  suggestedValue: string;
  status: 'same' | 'changed' | 'new';
  isChanged: boolean;
}

export interface UseAlbumAutoTagState {
  step: AutoTagStep;
  stage: AutoTagStage;
  progressMessage: string;
  progressPercent: number;

  // Search Criteria
  searchAlbum: string;
  searchArtist: string;
  searchTotalTracks: string;
  searchExpanded: boolean;
  selectedSource: string;
  availableProviders: AvailableSearchProviderInfo[];

  // Candidate Matches
  searchCandidates: AlbumMetadata[];
  selectedCandidateId: string | null;
  loadingCandidateId: string | null;
  loadingCandidates: boolean;
  loadingPreview: boolean;

  // Preview & Review
  preview: AlbumTagPreview | null;
  filteredMatches: TrackMatchPreview[];
  globalFieldDiffs: GlobalFieldDiff[];
  selectedGlobalFields: Set<string>;

  // Selection & Edits
  selectedTrackIds: Set<number>;
  selectedFieldMap: Map<string, boolean>;
  userEditedValues: Map<string, string | number>;
  artworkSource: ArtworkSourceOption;
  replaceArtwork: boolean;

  // Stats & Invariants
  totalChanges: number;
  selectedTracksCount: number;
  totalTracksCount: number;
  activeFieldsCount: number;

  // UI Table
  filter: PreviewFilterOption;
  sort: PreviewSortOption;

  // Lifecycle
  loading: boolean;
  error: string | null;
  canUndo: boolean;
  lastRestoredCount: number;
  operationId: string;
}

export interface UseAlbumAutoTagActions {
  setSearchAlbum: (val: string) => void;
  setSearchArtist: (val: string) => void;
  setSearchTotalTracks: (val: string) => void;
  setSelectedSource: (val: string) => void;
  setSearchExpanded: (expanded: boolean) => void;
  toggleSearchExpanded: () => void;

  searchReleases: (album?: string, artist?: string) => Promise<void>;
  selectCandidate: (localSongs: AutoTagSongInput[], candidate: AlbumMetadata) => Promise<void>;
  buildPreview: (
    localSongs: AutoTagSongInput[],
    releaseId: string,
    providerId?: MetadataProviderId
  ) => Promise<void>;

  toggleGlobalField: (fieldId: string) => void;
  selectAllGlobalFields: () => void;
  selectChangedGlobalFields: () => void;
  clearGlobalFields: () => void;

  toggleTrack: (songId: number) => void;
  toggleField: (songId: number, fieldId: MetadataFieldId) => void;
  setFieldValue: (songId: number, fieldId: MetadataFieldId, value: string | number) => void;
  resetFieldValue: (songId: number, fieldId: MetadataFieldId) => void;

  selectAllTracks: () => void;
  selectChangedTracks: () => void;
  clearTrackSelections: () => void;

  setArtworkSource: (source: ArtworkSourceOption) => void;
  setReplaceArtwork: (replace: boolean) => void;

  setFilter: (filter: PreviewFilterOption) => void;
  setSort: (sort: PreviewSortOption) => void;

  applyPreview: () => Promise<boolean>;
  undoLastAutoTag: () => Promise<boolean>;
  cancel: () => void;
  reset: () => void;
}

const generateSessionOperationId = (): string => {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

export function useAlbumAutoTag(
  initialOperationId?: string,
  initialSongs: AutoTagSongInput[] = []
) {
  const queryClient = useQueryClient();

  const [operationId, setOperationId] = useState(
    () => initialOperationId ?? generateSessionOperationId()
  );
  const [step, setStep] = useState<AutoTagStep>('search');
  const [stage, setStage] = useState<AutoTagStage>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  // Search Criteria Inputs
  const [searchAlbum, setSearchAlbum] = useState('');
  const [searchArtist, setSearchArtist] = useState('');
  const [searchTotalTracks, setSearchTotalTracks] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [selectedSource, setSelectedSource] = useState('auto');
  const [availableProviders, setAvailableProviders] = useState<AvailableSearchProviderInfo[]>([
    { id: 'musicbrainz', displayName: 'MusicBrainz', isOnline: true }
  ]);

  useEffect(() => {
    metadataApi
      .getAvailableSearchProviders()
      .then((providers) => {
        if (providers && providers.length > 0) {
          setAvailableProviders(providers);
        }
      })
      .catch(() => {});
  }, []);

  // Candidate Matches & Selection
  const [searchCandidates, setSearchCandidates] = useState<AlbumMetadata[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [loadingCandidateId, setLoadingCandidateId] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Preview & Review
  const [preview, setPreview] = useState<AlbumTagPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [lastRestoredCount, setLastRestoredCount] = useState(0);

  // Selections & Edits
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [selectedFieldMap, setSelectedFieldMap] = useState<Map<string, boolean>>(new Map());
  const [userEditedValues, setUserEditedValues] = useState<Map<string, string | number>>(new Map());
  const [selectedGlobalFields, setSelectedGlobalFields] = useState<Set<string>>(
    new Set(['album', 'artist', 'year', 'genre', 'artwork'])
  );
  const [artworkSource, setArtworkSource] = useState<ArtworkSourceOption>('musicbrainz');
  const [replaceArtwork, setReplaceArtwork] = useState<boolean>(true);

  // UI Filter & Sort
  const [filter, setFilter] = useState<PreviewFilterOption>('all');
  const [sort, setSort] = useState<PreviewSortOption>('trackNumber');

  // Race protection ref and scoped candidate preview cache
  const previewRequestIdRef = useRef<number>(0);
  const previewCacheRef = useRef<Map<string, AlbumTagPreview>>(new Map());

  // Subscribe to IPC progress events
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

  // Query Cache Invalidation
  const invalidateQueryCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: albumQuery._def });
    queryClient.invalidateQueries({ queryKey: songQuery._def });
    queryClient.invalidateQueries({ queryKey: artistQuery._def });
    queryClient.invalidateQueries({ queryKey: genreQuery._def });
  }, [queryClient]);

  // Initialize preview state from response
  const initPreviewState = useCallback((res: AlbumTagPreview) => {
    setPreview(res);
    setStep('preview');

    const newTrackIds = new Set<number>();
    const newFieldMap = new Map<string, boolean>();
    const newEdits = new Map<string, string | number>();

    for (const match of res.matches) {
      if (!match.isMissingLocally && match.localSongId > 0 && match.applyTrack) {
        newTrackIds.add(match.localSongId);
      }
      if (!match.isMissingLocally && match.localSongId > 0) {
        for (const diff of match.fieldDiffs) {
          const key = `${match.localSongId}::${diff.fieldId}`;
          newFieldMap.set(key, diff.applyField);
          if (diff.userValue !== undefined) {
            newEdits.set(key, diff.userValue);
          }
        }
      }
    }

    setSelectedTrackIds(newTrackIds);
    setSelectedFieldMap(newFieldMap);
    setUserEditedValues(newEdits);

    // Set artwork source based on candidate provider and available online artwork
    const hasOnlineArtwork = Boolean(
      res.album.artwork?.primaryPath || res.album.artwork?.onlineUrls?.[0]
    );
    if (!hasOnlineArtwork) {
      setArtworkSource('local');
    } else if (res.provider === 'discogs') {
      setArtworkSource('discogs');
    } else if (res.provider === 'musicbrainz') {
      setArtworkSource('coverartarchive');
    } else {
      setArtworkSource((res.provider as ArtworkSourceOption) || 'coverartarchive');
    }
  }, []);

  // Build preview with candidate switching race protection
  const buildPreview = useCallback(
    async (localSongs: AutoTagSongInput[], releaseId: string, providerId?: MetadataProviderId) => {
      const requestId = ++previewRequestIdRef.current;

      // Check scoped in-memory cache first
      if (previewCacheRef.current.has(releaseId)) {
        initPreviewState(previewCacheRef.current.get(releaseId)!);
        return;
      }

      setLoading(true);
      setLoadingPreview(true);
      setLoadingCandidateId(releaseId);
      setError(null);

      try {
        const res = await metadataApi.buildPreview(localSongs, releaseId, providerId, operationId);

        // Guard against race condition: if another candidate was selected while waiting, discard stale response
        if (requestId !== previewRequestIdRef.current) {
          return;
        }

        if (res) {
          previewCacheRef.current.set(releaseId, res);
          initPreviewState(res);
        }
      } catch (err: unknown) {
        if (requestId === previewRequestIdRef.current) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      } finally {
        if (requestId === previewRequestIdRef.current) {
          setLoading(false);
          setLoadingPreview(false);
          setLoadingCandidateId(null);
        }
      }
    },
    [operationId, initPreviewState]
  );

  // Search releases action
  const searchReleases = useCallback(
    async (albumParam?: string, artistParam?: string, sourceParam?: string) => {
      const albumQuery = (albumParam !== undefined ? albumParam : searchAlbum).trim();
      const artistQuery = (artistParam !== undefined ? artistParam : searchArtist).trim();
      const activeSource = sourceParam !== undefined ? sourceParam : selectedSource;

      if (!albumQuery) return;

      setLoading(true);
      setLoadingCandidates(true);
      setError(null);
      setStep('search');

      try {
        const parsedTracks = searchTotalTracks.trim()
          ? parseInt(searchTotalTracks.trim(), 10)
          : undefined;
        const targetTrackCount =
          Number.isInteger(parsedTracks) && (parsedTracks as number) > 0 ? parsedTracks : undefined;
        const source = activeSource === 'auto' ? undefined : (activeSource as MetadataProviderId);

        const results = await metadataApi.searchAlbums(albumQuery, artistQuery || undefined, {
          limit: 10,
          targetTrackCount,
          source: source ?? 'auto',
          operationId
        });
        setSearchCandidates(results);

        // Auto-select best match candidate and build its preview seamlessly
        if (results.length > 0 && initialSongs.length > 0) {
          const bestCandidate = results[0];
          const candidateKey = bestCandidate.releaseId ?? bestCandidate.title;
          setSelectedCandidateId(candidateKey);
          if (bestCandidate.releaseId) {
            await buildPreview(initialSongs, bestCandidate.releaseId, bestCandidate.provider);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingCandidates(false);
      }
    },
    [
      searchAlbum,
      searchArtist,
      searchTotalTracks,
      selectedSource,
      operationId,
      initialSongs,
      buildPreview
    ]
  );

  // Select a candidate from the table and trigger preview
  const selectCandidate = useCallback(
    async (localSongs: AutoTagSongInput[], candidate: AlbumMetadata) => {
      const candidateKey = candidate.releaseId ?? candidate.title;
      setSelectedCandidateId(candidateKey);
      setSearchExpanded(false); // Collapse search bar for focus on review

      if (candidate.releaseId) {
        await buildPreview(localSongs, candidate.releaseId, candidate.provider);
      }
    },
    [buildPreview]
  );

  // Global Field Diff toggles
  const toggleGlobalField = useCallback((fieldId: string) => {
    setSelectedGlobalFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }, []);

  const selectAllGlobalFields = useCallback(() => {
    setSelectedGlobalFields(new Set(['album', 'artist', 'year', 'genre', 'composer', 'artwork']));
  }, []);

  const selectChangedGlobalFields = useCallback(() => {
    setSelectedGlobalFields(new Set(['album', 'artist', 'year', 'genre', 'artwork']));
  }, []);

  const clearGlobalFields = useCallback(() => {
    setSelectedGlobalFields(new Set());
  }, []);

  // Track & Field Toggles
  const toggleTrack = useCallback((songId: number) => {
    if (songId <= 0) return; // Do not toggle missing tracks
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }, []);

  const toggleField = useCallback((songId: number, fieldId: MetadataFieldId) => {
    if (songId <= 0) return;
    const key = `${songId}::${fieldId}`;
    setSelectedFieldMap((prev) => {
      const next = new Map(prev);
      next.set(key, !(prev.get(key) ?? true));
      return next;
    });
  }, []);

  const setFieldValue = useCallback(
    (songId: number, fieldId: MetadataFieldId, value: string | number) => {
      if (songId <= 0) return;
      const key = `${songId}::${fieldId}`;
      setUserEditedValues((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
    },
    []
  );

  const resetFieldValue = useCallback(
    (songId: number, fieldId: MetadataFieldId) => {
      if (!preview || songId <= 0) return;
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
    },
    [preview]
  );

  const selectAllTracks = useCallback(() => {
    if (!preview) return;
    setSelectedTrackIds(
      new Set(
        preview.matches
          .filter((m) => !m.isMissingLocally && m.localSongId > 0)
          .map((m) => m.localSongId)
      )
    );
  }, [preview]);

  const selectChangedTracks = useCallback(() => {
    if (!preview) return;
    const changed = new Set(
      preview.matches
        .filter(
          (m) =>
            !m.isMissingLocally &&
            m.localSongId > 0 &&
            m.fieldDiffs.some((d) => d.status === 'changed' || d.status === 'new')
        )
        .map((m) => m.localSongId)
    );
    setSelectedTrackIds(changed);
  }, [preview]);

  const clearTrackSelections = useCallback(() => {
    setSelectedTrackIds(new Set());
  }, []);

  // Apply preview transaction
  const applyPreview = useCallback(async (): Promise<boolean> => {
    if (!preview) return false;
    setLoading(true);
    setStep('applying');
    setError(null);

    try {
      const isGlobalField = (fieldId: string) =>
        ['album', 'artist', 'year', 'genre'].includes(fieldId);

      const effectiveMatches: TrackMatchPreview[] = preview.matches
        .filter((m) => !m.isMissingLocally && m.localSongId > 0)
        .map((m) => {
          const applyTrack = selectedTrackIds.has(m.localSongId);
          const updatedDiffs = m.fieldDiffs.map((d) => {
            const key = `${m.localSongId}::${d.fieldId}`;
            let applyField: boolean;

            if (isGlobalField(d.fieldId)) {
              // Global fields are governed by selectedGlobalFields, with granular override if explicitly set in selectedFieldMap
              applyField = selectedFieldMap.has(key)
                ? (selectedFieldMap.get(key) ?? false)
                : selectedGlobalFields.has(d.fieldId);
            } else {
              applyField = selectedFieldMap.get(key) ?? d.applyField;
            }

            const userVal = userEditedValues.get(key) ?? d.userValue;
            return { ...d, applyField, userValue: userVal };
          });

          return { ...m, applyTrack, fieldDiffs: updatedDiffs };
        });

      const payloadAlbum = {
        ...preview.album,
        title: selectedGlobalFields.has('album')
          ? preview.album.title
          : preview.matches[0]?.oldAlbum || preview.album.title,
        artist: selectedGlobalFields.has('artist')
          ? preview.album.artist
          : preview.matches[0]?.oldArtist || preview.album.artist,
        year: selectedGlobalFields.has('year')
          ? preview.album.year
          : preview.matches[0]?.oldYear || preview.album.year
      };

      const payload: AlbumTagPreview = {
        ...preview,
        album: payloadAlbum,
        matches: effectiveMatches
      };
      const effectiveReplaceArtwork =
        replaceArtwork &&
        selectedGlobalFields.has('artwork') &&
        artworkSource !== 'local';
      const suggestedGenre =
        preview.album.genre ||
        preview.matches
          .map((m) => m.fieldDiffs.find((d) => d.fieldId === 'genre')?.suggestedValue)
          .find((g) => g !== undefined && g !== null && String(g).trim() !== '')
          ?.toString() ||
        undefined;

      const globalMutations: GlobalAlbumMutations = {
        albumTitle: preview.album.title,
        albumArtist: preview.album.artist,
        year: preview.album.year,
        genre: suggestedGenre,
        applyAlbumTitle: selectedGlobalFields.has('album'),
        applyAlbumArtist: selectedGlobalFields.has('artist'),
        applyYear: selectedGlobalFields.has('year'),
        applyGenre: selectedGlobalFields.has('genre') && Boolean(suggestedGenre)
      };

      const options: ApplyPreviewOptions = {
        replaceArtwork: effectiveReplaceArtwork,
        artworkUrl: !effectiveReplaceArtwork
          ? undefined
          : preview.album.artwork?.primaryPath || preview.album.artwork?.onlineUrls?.[0],
        globalMutations,
        operationId
      };

      const res = await metadataApi.applyPreview(payload, options, operationId);

      if (res.success) {
        setStep('complete');
        setCanUndo(true);
        previewCacheRef.current.clear();
        invalidateQueryCache();
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
  }, [
    preview,
    selectedTrackIds,
    selectedFieldMap,
    selectedGlobalFields,
    userEditedValues,
    replaceArtwork,
    artworkSource,
    operationId,
    invalidateQueryCache
  ]);

  // Undo transaction
  const undoLastAutoTag = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await metadataApi.undoLastAutoTag(operationId);
      if (res.success) {
        setCanUndo(false);
        setLastRestoredCount(res.restoredCount);
        invalidateQueryCache();
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
  }, [operationId, invalidateQueryCache]);

  const cancel = useCallback(() => {
    metadataApi.cancelAutoTag(operationId);
    setLoading(false);
    setStage('cancelled');
  }, [operationId]);

  // Reset state & clear cached previews
  const reset = useCallback(() => {
    setStep('search');
    setStage('idle');
    setProgressMessage('');
    setProgressPercent(0);
    setSearchCandidates([]);
    setSelectedCandidateId(null);
    setPreview(null);
    setLoading(false);
    setLoadingCandidates(false);
    setLoadingPreview(false);
    setError(null);
    setSelectedTrackIds(new Set());
    setSelectedFieldMap(new Map());
    setUserEditedValues(new Map());
    setSelectedGlobalFields(new Set(['album', 'artist', 'year', 'genre', 'artwork']));
    setArtworkSource('musicbrainz');
    setReplaceArtwork(true);
    setSearchExpanded(true);
    previewCacheRef.current.clear();
    previewRequestIdRef.current = 0;
    setOperationId(generateSessionOperationId());
  }, []);

  const toggleSearchExpanded = useCallback(() => {
    setSearchExpanded((prev) => !prev);
  }, []);

  // Filtered & Sorted Tracks
  const filteredMatches = useMemo(() => {
    if (!preview) return [];

    let result = [...preview.matches];

    if (filter === 'changed') {
      result = result.filter(
        (m) =>
          !m.isMissingLocally &&
          m.localSongId > 0 &&
          m.fieldDiffs.some((d) => d.status === 'changed' || d.status === 'new')
      );
    } else if (filter === 'matched') {
      result = result.filter((m) => !m.isMissingLocally && m.localSongId > 0);
    } else if (filter === 'low_confidence') {
      result = result.filter((m) => !m.isMissingLocally && m.confidence < 0.8);
    } else if (filter === 'warnings') {
      result = result.filter((m) => !m.isMissingLocally && m.hasWarnings);
    }

    result.sort((a, b) => {
      if (sort === 'confidence') {
        const confA = a.isMissingLocally ? -1 : a.confidence;
        const confB = b.isMissingLocally ? -1 : b.confidence;
        return confB - confA;
      }
      if (sort === 'title') {
        const titleA = a.isMissingLocally ? (a.remoteTitle ?? '') : (a.oldTitle ?? '');
        const titleB = b.isMissingLocally ? (b.remoteTitle ?? '') : (b.oldTitle ?? '');
        return titleA.localeCompare(titleB);
      }
      const discA = a.discNumber ?? a.oldDiscNumber ?? 1;
      const discB = b.discNumber ?? b.oldDiscNumber ?? 1;
      if (discA !== discB) return discA - discB;

      const trackA = a.trackNumber ?? a.oldTrackNumber ?? 999;
      const trackB = b.trackNumber ?? b.oldTrackNumber ?? 999;
      return trackA - trackB;
    });

    return result;
  }, [preview, filter, sort]);

  // Global Field Diffs
  const globalFieldDiffs = useMemo((): GlobalFieldDiff[] => {
    if (!preview) return [];

    const firstLocalMatch =
      preview.matches.find((m) => !m.isMissingLocally && m.localSongId > 0) ?? preview.matches[0];
    const localArtist = firstLocalMatch?.oldArtist ?? '—';
    const localAlbum = firstLocalMatch?.oldAlbum ?? '—';
    const localYear = firstLocalMatch?.oldYear ? String(firstLocalMatch.oldYear) : '—';
    const localGenre = firstLocalMatch?.oldGenre ?? '—';

    const remoteArtist = preview.album.artist || '—';
    const remoteAlbum = preview.album.title || '—';
    const remoteYear = preview.album.year ? String(preview.album.year) : '—';
    const suggestedGenre =
      preview.album.genre ||
      preview.matches
        .map((m) => m.fieldDiffs.find((d) => d.fieldId === 'genre')?.suggestedValue)
        .find((g) => g !== undefined && g !== null && String(g).trim() !== '')
        ?.toString() ||
      '';
    const remoteGenre = suggestedGenre || '—';
    const remoteArtwork = preview.album.artwork ? 'Cover Art' : 'None';

    const makeDiff = (
      id: string,
      name: string,
      oldVal: string,
      newVal: string
    ): GlobalFieldDiff => {
      const isChanged = oldVal.toLowerCase() !== newVal.toLowerCase() && newVal !== '—';
      const status = isChanged ? (oldVal === '—' ? 'new' : 'changed') : 'same';
      return {
        fieldId: id,
        fieldName: name,
        oldValue: oldVal,
        suggestedValue: newVal,
        status,
        isChanged
      };
    };

    return [
      makeDiff('album', 'Album', localAlbum, remoteAlbum),
      makeDiff('artist', 'Album Artist', localArtist, remoteArtist),
      makeDiff('year', 'Year', localYear, remoteYear),
      makeDiff('genre', 'Genre', localGenre, remoteGenre),
      makeDiff('artwork', 'Artwork', 'Existing', remoteArtwork)
    ];
  }, [preview]);

  // Exact Change-Count Calculation:
  // totalChanges = selectedGlobalChangedFields.length + sum(selectedTracks: selectedChangedTrackFields(track))
  const totalChanges = useMemo(() => {
    if (!preview) return 0;

    const isGlobalField = (fieldId: string) =>
      ['album', 'artist', 'year', 'genre'].includes(fieldId);
    const globalCount = globalFieldDiffs.filter(
      (g) => selectedGlobalFields.has(g.fieldId) && g.isChanged
    ).length;

    const trackChangesCount = filteredMatches.reduce((acc, match) => {
      if (
        match.isMissingLocally ||
        match.localSongId <= 0 ||
        !selectedTrackIds.has(match.localSongId)
      )
        return acc;

      const changedTrackFields = match.fieldDiffs.filter((d) => {
        const key = `${match.localSongId}::${d.fieldId}`;
        const isApplied = isGlobalField(d.fieldId)
          ? selectedFieldMap.has(key)
            ? (selectedFieldMap.get(key) ?? false)
            : selectedGlobalFields.has(d.fieldId)
          : (selectedFieldMap.get(key) ?? d.applyField);
        return isApplied && (d.status === 'changed' || d.status === 'new');
      }).length;

      return acc + changedTrackFields;
    }, 0);

    return globalCount + trackChangesCount;
  }, [
    preview,
    globalFieldDiffs,
    selectedGlobalFields,
    filteredMatches,
    selectedTrackIds,
    selectedFieldMap
  ]);

  return {
    state: {
      step,
      stage,
      progressMessage,
      progressPercent,
      searchAlbum,
      searchArtist,
      searchTotalTracks,
      searchExpanded,
      selectedSource,
      availableProviders,
      searchCandidates,
      selectedCandidateId,
      loadingCandidateId,
      loadingCandidates,
      loadingPreview,
      preview,
      filteredMatches,
      globalFieldDiffs,
      selectedGlobalFields,
      selectedTrackIds,
      selectedFieldMap,
      userEditedValues,
      artworkSource,
      replaceArtwork,
      selectedTracksCount: selectedTrackIds.size,
      totalTracksCount:
        preview?.matches.filter((m) => !m.isMissingLocally && m.localSongId > 0).length ?? 0,
      albumTracksCount: preview?.matches.length ?? 0,
      activeFieldsCount: selectedGlobalFields.size,
      totalChanges,
      filter,
      sort,
      loading,
      error,
      canUndo,
      lastRestoredCount,
      operationId
    },
    actions: {
      setSearchAlbum,
      setSearchArtist,
      setSearchTotalTracks,
      setSelectedSource,
      setSearchExpanded,
      toggleSearchExpanded,
      searchReleases,
      selectCandidate,
      buildPreview,
      toggleGlobalField,
      selectAllGlobalFields,
      selectChangedGlobalFields,
      clearGlobalFields,
      toggleTrack,
      toggleField,
      setFieldValue,
      resetFieldValue,
      selectAllTracks,
      selectChangedTracks,
      clearTrackSelections,
      setArtworkSource,
      setReplaceArtwork,
      setFilter,
      setSort,
      applyPreview,
      undoLastAutoTag,
      cancel,
      reset
    }
  };
}
