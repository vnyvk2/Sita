import type { MetadataProviderId } from './provider';
import type { AlbumMetadata } from './release';
import type { AlbumTagPreview, ApplyPreviewOptions, ProgressEventPayload } from './preview';

export interface MetadataAutoTagApi {
  searchAlbums: (albumName: string, artistName?: string, limit?: number, targetTrackCount?: number, operationId?: string) => Promise<AlbumMetadata[]>;
  buildPreview: (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId, operationId?: string) => Promise<AlbumTagPreview | null>;
  applyPreview: (preview: AlbumTagPreview, options?: ApplyPreviewOptions, operationId?: string) => Promise<{ success: boolean; updatedCount: number; failedCount: number; errors: string[] }>;
  undoLastAutoTag: (operationId?: string) => Promise<{ success: boolean; restoredCount: number; errors?: string[] }>;
  cancelAutoTag: (operationId?: string) => void;
  onProgress: (callback: (payload: ProgressEventPayload) => void) => () => void;
}
