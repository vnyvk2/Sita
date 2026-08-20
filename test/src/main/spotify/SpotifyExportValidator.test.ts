import { describe, expect, it, vi } from 'vitest';

import { db } from '../../../../src/main/db/db';
import { SpotifyTokenStore } from '../../../../src/main/spotify/auth/SpotifyTokenStore';
import { SpotifyExportValidator } from '../../../../src/main/spotify/ipc/SpotifyExportValidator';

describe('SpotifyExportValidator (Anti-Tampering & Security Boundary)', () => {
  it('should reject malformed or non-object payloads', async () => {
    await expect(SpotifyExportValidator.validateExportRequest(null)).rejects.toThrow(
      'Invalid export request: payload must be an object.'
    );
    await expect(SpotifyExportValidator.validateExportRequest('string')).rejects.toThrow(
      'Invalid export request: payload must be an object.'
    );
  });

  it('should reject invalid playlistId, empty name, or missing revision', async () => {
    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: -1,
        name: 'Test',
        revision: '2026-08-20'
      })
    ).rejects.toThrow('playlistId must be a positive integer.');

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 1,
        name: '   ',
        revision: '2026-08-20'
      })
    ).rejects.toThrow('playlist name cannot be empty.');

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 1,
        name: 'Valid Name',
        revision: ''
      })
    ).rejects.toThrow('revision string is required.');
  });

  it('should reject if playlist does not exist in Nora database', async () => {
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue(undefined as any);

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 9999,
        name: 'Non Existent',
        revision: '2026-08-20T10:00:00.000Z'
      })
    ).rejects.toThrow('Playlist with ID 9999 not found in Nora database.');
  });

  it('should reject if submitted revision is stale compared to DB updatedAt', async () => {
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 12,
      name: 'Rock Classics',
      updatedAt: new Date('2026-08-20T12:00:00.000Z'),
      entries: [{ id: 1 }, { id: 2 }]
    } as any);

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 12,
        name: 'Rock Classics',
        revision: '2026-08-20T11:00:00.000Z' // Stale preview revision
      })
    ).rejects.toThrow('Stale playlist revision');
  });

  it('should reject empty playlist with 0 entries', async () => {
    const updatedAt = new Date('2026-08-20T12:00:00.000Z');
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 15,
      name: 'Empty Nora Playlist',
      updatedAt,
      entries: []
    } as any);

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 15,
        name: 'Empty Nora Playlist',
        revision: updatedAt.toISOString()
      })
    ).rejects.toThrow('Cannot export empty playlist: playlist has no songs.');
  });

  it('should reject if user lacks required scope for requested visibility (private vs public)', async () => {
    const updatedAt = new Date('2026-08-20T12:00:00.000Z');
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 16,
      name: 'Pop Hits',
      updatedAt,
      entries: [{ id: 101 }]
    } as any);

    // Mock token store missing scopes
    vi.spyOn(SpotifyTokenStore, 'hasRequiredScopes').mockResolvedValue(false);

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 16,
        name: 'Pop Hits',
        isPublic: false,
        revision: updatedAt.toISOString()
      })
    ).rejects.toThrow('Spotify integration lacks required permissions for private playlist modification');

    await expect(
      SpotifyExportValidator.validateExportRequest({
        playlistId: 16,
        name: 'Pop Hits',
        isPublic: true,
        revision: updatedAt.toISOString()
      })
    ).rejects.toThrow('Spotify integration lacks required permissions for public playlist modification');
  });

  it('should accept valid export request when all invariants and permissions match', async () => {
    const updatedAt = new Date('2026-08-20T12:00:00.000Z');
    vi.spyOn(db.query.playlists, 'findFirst').mockResolvedValue({
      id: 20,
      name: 'Jazz Vibes',
      description: 'Cool jazz collection',
      updatedAt,
      entries: [{ id: 201 }, { id: 202 }]
    } as any);

    vi.spyOn(SpotifyTokenStore, 'hasRequiredScopes').mockResolvedValue(true);

    const validated = await SpotifyExportValidator.validateExportRequest({
      playlistId: 20,
      name: 'Jazz Vibes Spotify',
      description: 'Exported from Nora',
      isPublic: false,
      revision: updatedAt.toISOString()
    });

    expect(validated.playlistId).toBe(20);
    expect(validated.playlistName).toBe('Jazz Vibes Spotify');
    expect(validated.description).toBe('Exported from Nora');
    expect(validated.isPublic).toBe(false);
    expect(validated.revision).toBe(updatedAt.toISOString());
  });
});
