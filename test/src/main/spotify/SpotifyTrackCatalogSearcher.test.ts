import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalTrackIdentity } from '../../../../src/main/metadata/identity/CanonicalTrackIdentity';
import { SpotifyApiClient } from '../../../../src/main/spotify/api/SpotifyApiClient';
import type { SpotifyTrackInput } from '../../../../src/main/spotify/api/types';
import { SpotifyTrackCatalogSearcher } from '../../../../src/main/spotify/export/SpotifyTrackCatalogSearcher';

describe('SpotifyTrackCatalogSearcher (3-Tier & Hardened Match Hierarchy)', () => {
  let apiClient: SpotifyApiClient;
  let searcher: SpotifyTrackCatalogSearcher;

  beforeEach(() => {
    apiClient = new SpotifyApiClient();
    searcher = new SpotifyTrackCatalogSearcher(apiClient);
  });

  it('should prioritize Tier 1 ISRC search and accept authoritative match even with variant disagreement', async () => {
    const searchTracksSpy = vi
      .spyOn(apiClient, 'searchTracks')
      .mockImplementation(async (_token, query) => {
        if (query === 'isrc:USRC17607839') {
          return [
            {
              id: 'sp_authoritative_1',
              uri: 'spotify:track:sp_authoritative_1',
              name: 'Hotel California',
              artists: [{ name: 'Eagles' }],
              duration_ms: 391000,
              external_ids: { isrc: 'USRC17607839' },
              type: 'track'
            }
          ];
        }
        return [];
      });

    const localTrack: CanonicalTrackIdentity = {
      id: 101,
      title: 'Hotel California (Live at The Forum)',
      artists: ['Eagles'],
      durationSecs: 390,
      isrc: 'USRC17607839',
      recordingVariant: 'LIVE'
    };

    const resolution = await searcher.resolveTrack('test-token', localTrack, 1);

    expect(resolution.status).toBe('MATCHED');
    expect(resolution.spotifyUri).toBe('spotify:track:sp_authoritative_1');
    expect(resolution.matchResult?.isAuthoritative).toBe(true);
    expect(resolution.diagnostics).toContain('AUTHORITATIVE_ID_VARIANT_DISAGREEMENT');
    expect(searchTracksSpy).toHaveBeenCalledWith('test-token', 'isrc:USRC17607839', 10);
  });

  it('should fall back to Tier 2 (field-specific query) when ISRC is missing and match high confidence studio track', async () => {
    const searchTracksSpy = vi
      .spyOn(apiClient, 'searchTracks')
      .mockImplementation(async (_token, query) => {
        if (query.includes('track:comfortably numb') && query.includes('artist:pink floyd')) {
          return [
            {
              id: 'sp_pf_1',
              uri: 'spotify:track:sp_pf_1',
              name: 'Comfortably Numb',
              artists: [{ name: 'Pink Floyd' }],
              duration_ms: 382000,
              type: 'track'
            }
          ];
        }
        return [];
      });

    const localTrack: CanonicalTrackIdentity = {
      id: 102,
      title: 'Comfortably Numb',
      artists: ['Pink Floyd'],
      durationSecs: 382
    };

    const resolution = await searcher.resolveTrack('test-token', localTrack, 2);

    expect(resolution.status).toBe('MATCHED');
    expect(resolution.spotifyUri).toBe('spotify:track:sp_pf_1');
    expect(resolution.matchResult?.score).toBeGreaterThanOrEqual(80);
    expect(searchTracksSpy).toHaveBeenCalled();
  });

  it('should strictly reject non-authoritative candidate with variant penalty >= 30 as VARIANT_CONFLICT', async () => {
    vi.spyOn(apiClient, 'searchTracks').mockImplementation(async () => {
      return [
        {
          id: 'sp_live_only',
          uri: 'spotify:track:sp_live_only',
          name: 'Yesterday - Live at Abbey Road',
          artists: [{ name: 'The Beatles' }],
          duration_ms: 135000,
          recordingVariant: 'LIVE',
          type: 'track'
        }
      ];
    });

    const localStudioTrack: CanonicalTrackIdentity = {
      id: 103,
      title: 'Yesterday',
      artists: ['The Beatles'],
      durationSecs: 125,
      recordingVariant: 'STUDIO'
    };

    const resolution = await searcher.resolveTrack('test-token', localStudioTrack, 3);

    expect(resolution.status).toBe('VARIANT_CONFLICT');
    expect(resolution.spotifyUri).toBeUndefined();
    expect(resolution.diagnostics).toContain('VARIANT_CONFLICT');
  });

  it('should classify network or 429 search failures as SEARCH_FAILED instead of NOT_IN_CATALOG', async () => {
    vi.spyOn(apiClient, 'searchTracks').mockRejectedValue(new Error('Rate limit exceeded (429)'));

    const localTrack: CanonicalTrackIdentity = {
      id: 104,
      title: 'Bohemian Rhapsody',
      artists: ['Queen'],
      durationSecs: 354
    };

    const resolution = await searcher.resolveTrack('test-token', localTrack, 4);

    expect(resolution.status).toBe('SEARCH_FAILED');
    expect(resolution.diagnostics).toContain('SEARCH_ERROR');
  });

  it('should classify empty search results as NOT_IN_CATALOG', async () => {
    vi.spyOn(apiClient, 'searchTracks').mockResolvedValue([]);

    const localTrack: CanonicalTrackIdentity = {
      id: 105,
      title: 'Completely Obscure Local Track',
      artists: ['Local Garage Band'],
      durationSecs: 180
    };

    const resolution = await searcher.resolveTrack('test-token', localTrack, 5);

    expect(resolution.status).toBe('NOT_IN_CATALOG');
    expect(resolution.diagnostics).toContain('NO_SEARCH_RESULTS');
  });
});
