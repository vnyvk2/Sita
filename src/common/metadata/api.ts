import type { MetadataProviderId } from './provider';
import type { AlbumMetadata } from './release';
import type { AlbumTagPreview, ApplyPreviewOptions, ProgressEventPayload } from './preview';
import type { MetadataProviderPreferences } from './preferences';

export interface MetadataSearchOptions {
  limit?: number;
  targetTrackCount?: number;
  source?: 'auto' | MetadataProviderId;
  operationId?: string;
}

export interface AvailableSearchProviderInfo {
  id: MetadataProviderId;
  displayName: string;
  isOnline: boolean;
}

export interface MetadataAutoTagApi {
  searchAlbums: (albumName: string, artistName?: string, options?: MetadataSearchOptions) => Promise<AlbumMetadata[]>;
  buildPreview: (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId, operationId?: string) => Promise<AlbumTagPreview | null>;
  applyPreview: (preview: AlbumTagPreview, options?: ApplyPreviewOptions, operationId?: string) => Promise<{ success: boolean; updatedCount: number; failedCount: number; errors: string[] }>;
  undoLastAutoTag: (operationId?: string) => Promise<{ success: boolean; restoredCount: number; errors?: string[] }>;
  cancelAutoTag: (operationId?: string) => void;
  onProgress: (callback: (payload: ProgressEventPayload) => void) => () => void;
  getMetadataPreferences?: () => Promise<MetadataProviderPreferences>;
  saveMetadataPreferences?: (prefs: Partial<MetadataProviderPreferences>) => Promise<MetadataProviderPreferences>;
  getAvailableSearchProviders?: () => Promise<AvailableSearchProviderInfo[]>;
}
