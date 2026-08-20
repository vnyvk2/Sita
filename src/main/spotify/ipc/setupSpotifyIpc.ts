import { ipcMain, shell } from 'electron';

import logger from '../../logger';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import { importExecutor } from '../../playlistImport/setup';
import { SpotifyApiClient } from '../api/SpotifyApiClient';
import type { SyncStrategy } from '../api/types';
import { SpotifyLoopbackServer } from '../auth/SpotifyLoopbackServer';
import { SpotifyPkceService } from '../auth/SpotifyPkceService';
import { SpotifyTokenStore } from '../auth/SpotifyTokenStore';
import type { SpotifyAuthStatus } from '../auth/types';
import { SpotifyPlaylistExportService } from '../export/SpotifyPlaylistExportService';
import { SpotifyPlaylistImportService } from '../import/SpotifyPlaylistImportService';
import { SpotifyPlaylistSyncService } from '../sync/SpotifyPlaylistSyncService';
import { SpotifyExportValidator } from './SpotifyExportValidator';
import { SpotifyImportValidator } from './SpotifyImportValidator';

export function getSpotifyClientId(): string {
  const clientId =
    typeof process !== 'undefined' && process.env.MAIN_VITE_SPOTIFY_CLIENT_ID
      ? process.env.MAIN_VITE_SPOTIFY_CLIENT_ID
      : (import.meta as unknown as { env?: { MAIN_VITE_SPOTIFY_CLIENT_ID?: string } }).env
          ?.MAIN_VITE_SPOTIFY_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      'Spotify Client ID not configured. Please provide MAIN_VITE_SPOTIFY_CLIENT_ID.'
    );
  }
  return clientId;
}

export function setupSpotifyIpc(
  apiClient = new SpotifyApiClient(),
  importService = new SpotifyPlaylistImportService(apiClient),
  exportService = new SpotifyPlaylistExportService(apiClient),
  syncService = new SpotifyPlaylistSyncService(apiClient)
): void {
  // Connect handler
  ipcMain.handle('spotify/auth/connect', async () => {
    try {
      const clientId = getSpotifyClientId();
      const pkce = SpotifyPkceService.generatePkceCredentials();

      const loopback = await SpotifyLoopbackServer.create({
        expectedState: pkce.state
      });

      const authorizeUrl = SpotifyPkceService.buildAuthorizeUrl({
        clientId,
        redirectUri: loopback.redirectUri,
        codeChallenge: pkce.codeChallenge,
        state: pkce.state
      });

      logger.info('Opening system browser for Spotify authorization', {
        redirectUri: loopback.redirectUri
      });

      await shell.openExternal(authorizeUrl);

      const callback = await loopback.waitForCallback();

      const tokens = await SpotifyPkceService.exchangeCodeForTokens({
        clientId,
        code: callback.code,
        redirectUri: loopback.redirectUri,
        codeVerifier: pkce.codeVerifier
      });

      const userProfile = await apiClient.getCurrentUser(tokens.accessToken);

      await SpotifyTokenStore.saveTokens({
        user: {
          spotifyUserId: userProfile.id,
          displayName: userProfile.displayName,
          email: userProfile.email,
          product: userProfile.product
        },
        tokens
      });

      logger.info('Successfully connected Spotify account', {
        userId: userProfile.id,
        name: userProfile.displayName
      });

      return {
        success: true,
        user: {
          spotifyUserId: userProfile.id,
          displayName: userProfile.displayName,
          email: userProfile.email,
          product: userProfile.product
        }
      };
    } catch (error) {
      logger.error('Spotify connect flow failed', { error });
      throw error;
    }
  });

  // Disconnect handler
  ipcMain.handle('spotify/auth/disconnect', async () => {
    try {
      await SpotifyTokenStore.clearIntegration();
      logger.info('Disconnected Spotify account');
      return { success: true };
    } catch (error) {
      logger.error('Spotify disconnect failed', { error });
      throw error;
    }
  });

  // Get Auth Status handler
  ipcMain.handle('spotify/auth/getStatus', async (): Promise<SpotifyAuthStatus> => {
    try {
      const integration = await SpotifyTokenStore.getActiveIntegration();
      if (!integration) {
        return { isConnected: false, user: null };
      }

      return {
        isConnected: true,
        user: {
          spotifyUserId: integration.spotifyUserId,
          displayName: integration.displayName,
          email: integration.email || null,
          product: integration.product || null
        }
      };
    } catch (error) {
      logger.error('Failed to get Spotify auth status', { error });
      return { isConnected: false, user: null };
    }
  });

  // Get User Playlists handler
  ipcMain.handle('spotify/playlists/getUserPlaylists', async () => {
    try {
      const clientId = getSpotifyClientId();
      const accessToken = await SpotifyTokenStore.getValidAccessToken(clientId);
      if (!accessToken) {
        throw new Error('Spotify not authenticated. Please connect your account.');
      }

      return await apiClient.getAllUserPlaylists(accessToken);
    } catch (error) {
      logger.error('Failed to fetch user Spotify playlists', { error });
      throw error;
    }
  });

  // Generate Import Plan handler
  ipcMain.handle('spotify/playlists/generateImportPlan', async (_, playlistId: string) => {
    try {
      if (!playlistId || typeof playlistId !== 'string') {
        throw new Error('Playlist ID is required to generate import plan.');
      }
      return await importService.generateImportPlan(playlistId);
    } catch (error) {
      logger.error('Failed to generate Spotify playlist import plan', { playlistId, error });
      throw error;
    }
  });

  // Execute Import Plan handler
  ipcMain.handle(
    'spotify/playlists/executeImportPlan',
    async (
      _,
      untrustedPlan: PlaylistImportPlan,
      options?: { targetPlaylistId?: number; mode?: 'create' | 'merge' | 'replace' }
    ) => {
      try {
        const validatedPlan = await SpotifyImportValidator.validateAndSanitizePlan(untrustedPlan);
        logger.info(`Executing Spotify import plan for '${validatedPlan.playlistName}'...`, {
          entriesCount: validatedPlan.entries.length,
          matchedCount: validatedPlan.statistics.importedEntries
        });

        return await importExecutor.execute(validatedPlan, options);
      } catch (error) {
        logger.error('Failed to execute Spotify playlist import plan', { error });
        throw error;
      }
    }
  );

  // ==========================================
  // Phase 3A Export Handlers
  // ==========================================

  // Check export permissions
  ipcMain.handle('spotify/export/hasPermissions', async (_, isPublic = false) => {
    const requiredScopes = SpotifyExportValidator.getRequiredExportScopes(Boolean(isPublic));
    return await SpotifyTokenStore.hasRequiredScopes(requiredScopes);
  });

  // Generate Export Plan preview handler
  ipcMain.handle('spotify/export/generatePlan', async (_, playlistId: number) => {
    try {
      if (!Number.isInteger(playlistId) || playlistId <= 0) {
        throw new Error('Valid playlist ID is required to generate export plan.');
      }
      return await exportService.generateExportPlan(playlistId);
    } catch (error) {
      logger.error('Failed to generate Spotify playlist export plan', { playlistId, error });
      throw error;
    }
  });

  // Execute Export Plan handler
  ipcMain.handle('spotify/export/executeExport', async (_, untrustedRequest: unknown) => {
    try {
      const validated = await SpotifyExportValidator.validateExportRequest(untrustedRequest);
      logger.info(`Executing Spotify export for playlist '${validated.playlistName}'...`, {
        playlistId: validated.playlistId,
        isPublic: validated.isPublic
      });

      return await exportService.executeExport(validated);
    } catch (error) {
      logger.error('Failed to execute Spotify playlist export', { error });
      throw error;
    }
  });

  // ==========================================
  // Phase 3B Two-Way Sync Handlers
  // ==========================================

  // Get playlist link info
  ipcMain.handle('spotify/sync/getLink', async (_, playlistId: number) => {
    return await syncService.getLinkedPlaylist(playlistId);
  });

  // Link local playlist to Spotify
  ipcMain.handle(
    'spotify/sync/linkPlaylist',
    async (_, playlistId: number, spotifyPlaylistId: string, strategy?: SyncStrategy) => {
      const clientId = getSpotifyClientId();
      return await syncService.linkPlaylist(playlistId, spotifyPlaylistId, strategy, clientId);
    }
  );

  // Unlink playlist from Spotify
  ipcMain.handle('spotify/sync/unlinkPlaylist', async (_, playlistId: number) => {
    return await syncService.unlinkPlaylist(playlistId);
  });

  // Detect sync drift
  ipcMain.handle('spotify/sync/detectDrift', async (_, playlistId: number) => {
    const clientId = getSpotifyClientId();
    return await syncService.detectSyncDrift(playlistId, clientId);
  });

  // Generate 3-way sync preview plan
  ipcMain.handle(
    'spotify/sync/generatePlan',
    async (_, playlistId: number, strategy?: SyncStrategy) => {
      const clientId = getSpotifyClientId();
      return await syncService.generateSyncPlan(playlistId, strategy, clientId);
    }
  );

  // Execute 2-way sync
  ipcMain.handle(
    'spotify/sync/executeSync',
    async (_, playlistId: number, strategy?: SyncStrategy) => {
      const clientId = getSpotifyClientId();
      return await syncService.executeSync(playlistId, strategy, clientId);
    }
  );
}
