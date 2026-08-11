import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { metadataApi } from '../services/metadataApi';
import { albumQuery } from '../queries/albums';
import { songQuery } from '../queries/songs';

export type WorkflowType = 'album' | 'track' | 'genre' | 'artwork';

export interface UseMetadataWorkflowOptions {
  initialWorkflow?: WorkflowType;
  initialAlbumName?: string;
  initialArtistName?: string;
  operationId?: string;
}

export function useMetadataWorkflow(options: UseMetadataWorkflowOptions = {}) {
  const queryClient = useQueryClient();
  const operationId = options.operationId ?? 'default';

  const [workflowType, setWorkflowType] = useState<WorkflowType>(options.initialWorkflow ?? 'album');
  const [query, setQuery] = useState({
    title: options.initialAlbumName ?? '',
    artist: options.initialArtistName ?? '',
    album: options.initialAlbumName ?? ''
  });

  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set());
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());

  const [stage, setStage] = useState<string>('idle');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState<boolean>(false);

  // Listen for progress updates over IPC
  useEffect(() => {
    const cleanup = metadataApi.onProgress((payload) => {
      if (payload.operationId && payload.operationId !== operationId) return;
      setStage(payload.stage);
      setProgressMessage(payload.message);
      if (typeof payload.progressPercent === 'number') {
        setProgressPercent(payload.progressPercent);
      }
    });
    return cleanup;
  }, [operationId]);

  const search = useCallback(
    async (searchQuery = query) => {
      setLoading(true);
      setError(null);
      setCandidates([]);
      setPreview(null);
      setSelectedCandidateId(null);
      setStage('searching');

      try {
        const results = await metadataApi.workflowSearch(workflowType, searchQuery, operationId);
        setCandidates(results);
        setStage('idle');
        if (results.length > 0) {
          // Auto-select top candidate
          const top = results[0];
          setSelectedCandidateId(top.id);
        }
      } catch (err: any) {
        setError(err?.message ?? 'Failed to search metadata');
        setStage('failed');
      } finally {
        setLoading(false);
      }
    },
    [workflowType, query, operationId]
  );

  const buildPreview = useCallback(
    async (localSongs: any[], candidateId: string, providerId?: string) => {
      setLoading(true);
      setError(null);
      setStage('diffing');

      try {
        const prev = await metadataApi.workflowBuildPreview(
          workflowType,
          localSongs,
          candidateId,
          providerId,
          operationId
        );
        setPreview(prev);
        if (prev) {
          // Initialize selected fields and tracks
          const fieldIds = new Set<string>(prev.supportedFields?.map((f: any) => f.fieldId) ?? []);
          setSelectedFieldIds(fieldIds);

          const trackIds = new Set<number>(prev.matches?.map((m: any) => m.localSongId) ?? []);
          setSelectedTrackIds(trackIds);
        }
        setStage('idle');
      } catch (err: any) {
        setError(err?.message ?? 'Failed to build metadata preview');
        setStage('failed');
      } finally {
        setLoading(false);
      }
    },
    [workflowType, operationId]
  );

  const apply = useCallback(async () => {
    if (!preview) return false;
    setLoading(true);
    setError(null);
    setStage('applying');

    try {
      const activeFields = Array.from(selectedFieldIds);
      const res = await metadataApi.workflowApplyPreview(
        workflowType,
        preview,
        activeFields,
        undefined,
        operationId
      );

      if (res.success) {
        setCanUndo(true);
        setStage('completed');
        // Invalidate react-query caches
        queryClient.invalidateQueries({ queryKey: albumQuery._def });
        queryClient.invalidateQueries({ queryKey: songQuery._def });
        return true;
      } else {
        setError(res.errors?.join('; ') ?? 'Apply failed');
        setStage('failed');
        return false;
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to apply metadata preview');
      setStage('failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [preview, selectedFieldIds, workflowType, operationId, queryClient]);

  const undo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await metadataApi.workflowUndo(operationId);
      if (res.success) {
        setCanUndo(false);
        queryClient.invalidateQueries({ queryKey: albumQuery._def });
        queryClient.invalidateQueries({ queryKey: songQuery._def });
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err?.message ?? 'Undo failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [operationId, queryClient]);

  const toggleField = useCallback((fieldId: string) => {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }, []);

  const toggleTrack = useCallback((songId: number) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  }, []);

  return {
    state: {
      workflowType,
      query,
      candidates,
      selectedCandidateId,
      preview,
      selectedFieldIds,
      selectedTrackIds,
      stage,
      progressMessage,
      progressPercent,
      loading,
      error,
      canUndo
    },
    actions: {
      setWorkflowType,
      setQuery,
      search,
      buildPreview,
      setSelectedCandidateId,
      toggleField,
      toggleTrack,
      apply,
      undo
    }
  };
}
