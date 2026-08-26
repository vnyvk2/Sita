import type {
  AlbumMetadata,
  AlbumTagPreview,
  ApplyPreviewOptions,
  AvailableSearchProviderInfo,
  MetadataAutoTagApi,
  MetadataProviderId,
  MetadataProviderPreferences,
  MetadataSearchOptions,
  ProgressEventPayload
} from '../../../common/metadata/types';

export const metadataApi = {
  searchAlbums: async (
    albumName: string,
    artistName?: string,
    options?: MetadataSearchOptions
  ): Promise<AlbumMetadata[]> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api) return [];
    return api.searchAlbums(albumName, artistName, options);
  },

  getMetadataPreferences: async (): Promise<MetadataProviderPreferences | null> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api || typeof api.getMetadataPreferences !== 'function') return null;
    return api.getMetadataPreferences();
  },

  saveMetadataPreferences: async (
    prefs: Partial<MetadataProviderPreferences>
  ): Promise<MetadataProviderPreferences | null> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api || typeof api.saveMetadataPreferences !== 'function') return null;
    return api.saveMetadataPreferences(prefs);
  },

  getAvailableSearchProviders: async (): Promise<AvailableSearchProviderInfo[]> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api || typeof api.getAvailableSearchProviders !== 'function') {
      return [{ id: 'musicbrainz', displayName: 'MusicBrainz', isOnline: true }];
    }
    return api.getAvailableSearchProviders();
  },

  buildPreview: async (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId, operationId?: string): Promise<AlbumTagPreview | null> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api) return null;
    return api.buildPreview(localSongs, releaseId, providerId, operationId);
  },

  applyPreview: async (preview: AlbumTagPreview, options?: ApplyPreviewOptions, operationId?: string): Promise<{ success: boolean; updatedCount: number; failedCount: number; errors: string[] }> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api) return { success: false, updatedCount: 0, failedCount: 0, errors: ['Metadata API unavailable'] };
    return api.applyPreview(preview, options, operationId);
  },

  undoLastAutoTag: async (operationId?: string): Promise<{ success: boolean; restoredCount: number; errors?: string[] }> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api) return { success: false, restoredCount: 0 };
    return api.undoLastAutoTag(operationId);
  },

  cancelAutoTag: (operationId?: string): void => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (api) api.cancelAutoTag(operationId);
  },

  onProgress: (callback: (payload: ProgressEventPayload) => void): (() => void) => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api || typeof api.onProgress !== 'function') return () => {};
    return api.onProgress(callback);
  },

  // --- Phase 14 Unified Metadata Workflow API ---
  workflowSearch: async (workflowType: string, query: { title?: string; artist?: string; album?: string; limit?: number }, operationId?: string): Promise<any[]> => {
    const api = window.api?.metadataWorkflow;
    if (!api) return [];
    return api.search(workflowType, query, operationId);
  },

  workflowBuildPreview: async (workflowType: string, localSongs: unknown[], candidateId: string, providerId?: string, operationId?: string): Promise<any | null> => {
    const api = window.api?.metadataWorkflow;
    if (!api) return null;
    return api.buildPreview(workflowType, localSongs, candidateId, providerId, operationId);
  },

  workflowApplyPreview: async (workflowType: string, preview: unknown, selectedFieldIds?: string[], options?: unknown, operationId?: string): Promise<{ success: boolean; updatedCount: number; failedCount: number; errors: string[] }> => {
    const api = window.api?.metadataWorkflow;
    if (!api) return { success: false, updatedCount: 0, failedCount: 0, errors: ['Metadata API unavailable'] };
    return api.applyPreview(workflowType, preview, selectedFieldIds, options, operationId);
  },

  workflowUndo: async (operationId?: string): Promise<{ success: boolean; revertedCount: number; errors: string[] }> => {
    const api = window.api?.metadataWorkflow;
    if (!api) return { success: false, revertedCount: 0, errors: ['Metadata API unavailable'] };
    return api.undo(operationId);
  },

  workflowCancel: (operationId?: string): void => {
    const api = window.api?.metadataWorkflow;
    if (api) api.cancel(operationId);
  }
};
