import type { AlbumMetadata, MetadataProviderId } from '../../../main/metadata/models/RecordingMetadata';
import type { AlbumTagPreview, ProgressEventPayload } from '../../common/metadata/types';

export const metadataApi = {
  searchAlbums: async (albumName: string, artistName?: string, limit?: number, operationId?: string): Promise<AlbumMetadata[]> => {
    const api = (window as any).api?.metadataAutoTag;
    if (!api) return [];
    return api.searchAlbums(albumName, artistName, limit, operationId);
  },

  buildPreview: async (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId, operationId?: string): Promise<AlbumTagPreview | null> => {
    const api = (window as any).api?.metadataAutoTag;
    if (!api) return null;
    return api.buildPreview(localSongs, releaseId, providerId, operationId);
  },

  applyPreview: async (preview: AlbumTagPreview, operationId?: string): Promise<{ success: boolean; updatedCount: number; failedCount: number; errors: string[] }> => {
    const api = (window as any).api?.metadataAutoTag;
    if (!api) return { success: false, updatedCount: 0, failedCount: 0, errors: ['Metadata API unavailable'] };
    return api.applyPreview(preview, operationId);
  },

  undoLastAutoTag: async (operationId?: string): Promise<{ success: boolean; restoredCount: number; errors?: string[] }> => {
    const api = (window as any).api?.metadataAutoTag;
    if (!api) return { success: false, restoredCount: 0 };
    return api.undoLastAutoTag(operationId);
  },

  cancelAutoTag: (operationId?: string): void => {
    const api = (window as any).api?.metadataAutoTag;
    if (api) api.cancelAutoTag(operationId);
  },

  onProgress: (callback: (payload: ProgressEventPayload) => void): (() => void) => {
    const api = (window as any).api?.metadataAutoTag;
    if (!api || typeof api.onProgress !== 'function') return () => {};
    return api.onProgress(callback);
  }
};
