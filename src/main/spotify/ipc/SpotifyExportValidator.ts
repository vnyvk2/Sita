import { eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { playlists } from '../../db/schema';
import { SpotifyTokenStore } from '../auth/SpotifyTokenStore';

export interface ValidatedExportRequest {
  playlistId: number;
  playlistName: string;
  description?: string;
  isPublic: boolean;
  revision: string;
}

export class SpotifyExportValidator {
  /** Helper to determine required Spotify OAuth scopes based on target visibility. */
  public static getRequiredExportScopes(isPublic: boolean): string[] {
    return isPublic ? ['playlist-modify-public'] : ['playlist-modify-private'];
  }

  /**
   * Validates untrusted renderer parameters and verifies DB existence, revision consistency, active
   * Spotify authorization scopes, and non-empty playlist invariant.
   */
  public static async validateExportRequest(request: unknown): Promise<ValidatedExportRequest> {
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid export request: payload must be an object.');
    }

    const payload = request as Record<string, unknown>;

    // 1. Structural Validation
    const playlistId = Number(payload.playlistId);
    if (!Number.isInteger(playlistId) || playlistId <= 0) {
      throw new Error('Invalid export request: playlistId must be a positive integer.');
    }

    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new Error('Invalid export request: playlist name cannot be empty.');
    }
    const playlistName = payload.name.trim();

    const description =
      typeof payload.description === 'string' ? payload.description.trim() : undefined;
    const isPublic = Boolean(payload.isPublic);

    if (typeof payload.revision !== 'string' || !payload.revision.trim()) {
      throw new Error('Invalid export request: revision string is required.');
    }
    const submittedRevision = payload.revision.trim();

    // 2. Database Existence & Revision Check
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
      with: {
        entries: {
          columns: { id: true }
        }
      }
    });

    if (!playlist) {
      throw new Error(`Playlist with ID ${playlistId} not found in Nora database.`);
    }

    const currentRevision = playlist.updatedAt.toISOString();
    if (submittedRevision !== currentRevision) {
      throw new Error(
        `Stale playlist revision. The playlist was modified in Nora since the export preview was generated. Please refresh.`
      );
    }

    // 3. Minimum Entry Count Invariant
    if (!playlist.entries || playlist.entries.length === 0) {
      throw new Error('Cannot export empty playlist: playlist has no songs.');
    }

    // 4. Authorization & Scope Validation
    const requiredScopes = this.getRequiredExportScopes(isPublic);
    const hasScopes = await SpotifyTokenStore.hasRequiredScopes(requiredScopes);
    if (!hasScopes) {
      const scopeDesc = isPublic ? 'public playlist modification' : 'private playlist modification';
      throw new Error(
        `Spotify integration lacks required permissions for ${scopeDesc}. Please reconnect your account.`
      );
    }

    return {
      playlistId,
      playlistName,
      description,
      isPublic,
      revision: currentRevision
    };
  }
}
