import type { AlbumMetadata, AlbumTagPreview, ApplyPreviewOptions, MetadataAutoTagApi, MetadataProviderId, ProgressEventPayload } from '../../../common/metadata/types';

export const metadataApi = {
  searchAlbums: async (albumName: string, artistName?: string, limit?: number, operationId?: string): Promise<AlbumMetadata[]> => {
    const api = window.api?.metadataAutoTag as MetadataAutoTagApi | undefined;
    if (!api) return [];
    return api.searchAlbums(albumName, artistName, limit, operationId);
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
  }
};
