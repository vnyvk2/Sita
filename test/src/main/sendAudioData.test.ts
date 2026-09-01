import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@main/db/queries/songs', () => ({
  getPlayableSongById: vi.fn()
}));

vi.mock('@main/db/queries/history', () => ({
  addSongToPlayHistory: vi.fn()
}));

vi.mock('@main/other/discordRPC', () => ({
  setDiscordRpcActivity: vi.fn()
}));

vi.mock('../../src/main/main', () => ({
  IS_DEVELOPMENT: false,
  setCurrentSongPath: vi.fn()
}));

import { getPlayableSongById } from '@main/db/queries/songs';

import sendAudioData from '../../../src/main/core/sendAudioData';

describe('Production sendAudioData Deterministic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns clean payload with artworkPaths and no binary Buffer', async () => {
    const mockSong = {
      id: 101,
      title: 'Lossless Track',
      duration: 240,
      path: 'C:/Music/test.flac',
      isFavorite: true,
      isBlacklisted: false,
      artists: [
        {
          artist: {
            id: 1,
            name: 'Sample Artist',
            artworks: []
          }
        }
      ],
      artworks: [
        {
          artwork: {
            id: 5,
            path: 'artworks/5.webp',
            isOptimized: true
          }
        }
      ],
      albums: [
        {
          album: {
            id: 2,
            title: 'Sample Album'
          }
        }
      ]
    };

    vi.mocked(getPlayableSongById).mockResolvedValue(mockSong as any);

    const result = await sendAudioData(101, true);

    expect(result.songId).toBe(101);
    expect(result.title).toBe('Lossless Track');
    expect(result.artwork).toBeUndefined(); // Zero binary Buffer allocated
    expect(result.artworkPath).toBeDefined();
    expect(result.artworkPaths).toBeDefined();
    expect(result.artworkPaths?.artworkPath).toContain('5.webp');
  });

  it('throws SONG_NOT_FOUND when song does not exist', async () => {
    vi.mocked(getPlayableSongById).mockResolvedValue(null as any);

    await expect(sendAudioData(9999)).rejects.toThrow('SONG_NOT_FOUND');
  });
});
