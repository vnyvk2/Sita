import { ipcMain, type BrowserWindow } from 'electron';
import type { MetadataSearchOptions, AvailableSearchProviderInfo } from '../../common/metadata/api';
import type { MetadataProviderPreferences } from '../../common/metadata/preferences';
import { DEFAULT_METADATA_PREFERENCES } from '../../common/metadata/preferences';
import type { AlbumAutoTagService } from '../metadata/services/AlbumAutoTagService';
import type { MetadataWorkflowService } from '../metadata/services/MetadataWorkflowService';
import type { MetadataPreferencesService } from '../metadata/services/MetadataPreferencesService';
import type { LocalSongInput } from '../metadata/services/AlbumMetadataService';
import type { AlbumTagPreview, ApplyPreviewOptions, ProgressEventPayload } from '../metadata/models/AlbumTagPreview';
import type { MetadataProviderId } from '../metadata/models/RecordingMetadata';
import type { WorkflowPreview, WorkflowType } from '../metadata/workflows/MetadataWorkflow';

const activeProgressListeners = new WeakSet<object>();

export function registerMetadataHandlers(
  autoTagService: AlbumAutoTagService,
  workflowService?: MetadataWorkflowService,
  preferencesService?: MetadataPreferencesService,
  mainWindow?: BrowserWindow
): void {
  // Listen for progress events from AlbumAutoTagService and send over IPC to renderer
  if (!activeProgressListeners.has(autoTagService)) {
    activeProgressListeners.add(autoTagService);
    autoTagService.on('progress', (payload: ProgressEventPayload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('metadata/progress', payload);
      }
    });
  }

  if (workflowService && !activeProgressListeners.has(workflowService)) {
    activeProgressListeners.add(workflowService);
    workflowService.on('progress', (payload: ProgressEventPayload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('metadata/progress', payload);
      }
    });
  }

  // --- Album AutoTag IPC Endpoints ---
  ipcMain.handle(
    'metadata/searchAlbums',
    async (_, albumName: string, artistName?: string, options?: MetadataSearchOptions) => {
      const operationId = options?.operationId ?? 'default';
      const signal = autoTagService.createAbortSignal(operationId);
      return autoTagService.searchReleases(albumName, artistName, options, signal);
    }
  );

  ipcMain.handle('metadata/getPreferences', async () => {
    if (!preferencesService) {
      return DEFAULT_METADATA_PREFERENCES;
    }
    return preferencesService.getPreferences();
  });

  ipcMain.handle('metadata/savePreferences', async (_, prefs: Partial<MetadataProviderPreferences>) => {
    if (!preferencesService) {
      throw new Error('Preferences service not initialized');
    }
    return preferencesService.savePreferences(prefs, ['musicbrainz', 'discogs', 'spotify']);
  });

  ipcMain.handle('metadata/getAvailableSearchProviders', async (): Promise<AvailableSearchProviderInfo[]> => {
    return [
      { id: 'musicbrainz', displayName: 'MusicBrainz', isOnline: true },
      { id: 'discogs', displayName: 'Discogs', isOnline: true }
    ];
  });

  ipcMain.handle(
    'metadata/buildPreview',
    async (_, localSongs: LocalSongInput[], releaseId: string, providerId?: MetadataProviderId, operationId = 'default') => {
      const signal = autoTagService.createAbortSignal(operationId);
      return autoTagService.buildPreview(localSongs, releaseId, providerId, signal, operationId);
    }
  );

  ipcMain.handle('metadata/applyPreview', async (_, preview: AlbumTagPreview, options?: ApplyPreviewOptions, operationId = 'default') => {
    const signal = autoTagService.createAbortSignal(operationId);
    return autoTagService.applyPreview(preview, options, signal, operationId);
  });

  ipcMain.handle('metadata/undoLastAutoTag', async (_, operationId = 'default') => {
    return autoTagService.undoLastAutoTag(operationId);
  });

  ipcMain.handle('metadata/cancelAutoTag', (_, operationId = 'default') => {
    autoTagService.cancel(operationId);
    return { cancelled: true };
  });

  // --- Phase 14 Unified Workflow IPC Endpoints ---
  if (workflowService) {
    ipcMain.handle(
      'metadata/workflow/search',
      async (_, workflowType: WorkflowType, query: { title?: string; artist?: string; album?: string; limit?: number }, operationId = 'default') => {
        return workflowService.search(workflowType, query, operationId);
      }
    );

    ipcMain.handle(
      'metadata/workflow/buildPreview',
      async (_, workflowType: WorkflowType, localSongs: LocalSongInput[], candidateId: string, providerId?: string, operationId = 'default') => {
        return workflowService.buildPreview(workflowType, localSongs, candidateId, providerId, operationId);
      }
    );

    ipcMain.handle(
      'metadata/workflow/applyPreview',
      async (
        _,
        workflowType: WorkflowType,
        preview: WorkflowPreview,
        selectedFieldIds?: string[],
        options?: ApplyPreviewOptions,
        operationId = 'default'
      ) => {
        return workflowService.applyPreview(workflowType, preview, selectedFieldIds, options, operationId);
      }
    );

    ipcMain.handle('metadata/workflow/undo', async (_, operationId = 'default') => {
      return workflowService.undoLastAutoTag(operationId);
    });

    ipcMain.handle('metadata/workflow/cancel', (_, operationId = 'default') => {
      workflowService.cancel(operationId);
      return { cancelled: true };
    });
  }
}
