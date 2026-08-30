import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockedSharp = vi.fn();
vi.mock('sharp', () => ({
  default: (...args: unknown[]) => mockedSharp(...args)
}));

vi.mock('@main/db/queries/history', () => ({
  addSongToPlayHistory: vi.fn()
}));

vi.mock('@main/db/queries/songs', () => ({
  getPlayableSongById: vi.fn()
}));

vi.mock('@main/other/discordRPC', () => ({
  setDiscordRpcActivity: vi.fn()
}));

vi.mock('../../../../src/main/fs/resolveFilePaths', () => ({
  parseArtistOnlineArtworks: vi.fn(() => undefined),
  parseSongArtworks: vi.fn((artworks: { artworkPath: string }[]) => ({
    artworkPath: artworks?.[0]?.artworkPath ?? 'nora://localfiles/default.webp'
  })),
  resolveSongFilePath: vi.fn((filePath: string) => `nora://localfiles/${filePath}`)
}));

vi.mock('../../../../src/main/core/getAllSongs', () => ({
  parsePaletteFromArtworks: vi.fn(() => undefined)
}));

vi.mock('../../../../src/main/main', () => ({
  setCurrentSongPath: vi.fn(),
  IS_DEVELOPMENT: false
}));

vi.mock('../../../../src/main/logger', () => ({
  default: {
    verbose: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

import { addSongToPlayHistory } from '@main/db/queries/history';
import { getPlayableSongById } from '@main/db/queries/songs';
import { setDiscordRpcActivity } from '@main/other/discordRPC';

import sendAudioData from '../../../../src/main/core/sendAudioData';

const mockedGetPlayableSongById = vi.mocked(getPlayableSongById);
const mockedAddSongToPlayHistory = vi.mocked(addSongToPlayHistory);
const mockedSetDiscordRpcActivity = vi.mocked(setDiscordRpcActivity);

describe('sendAudioData (Phase P1 Regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns audio player data without sharp decoding or artwork buffer', async () => {
    mockedGetPlayableSongById.mockResolvedValue({
      id: 42,
      title: 'High Resolution Master',
      duration: 215,
      path: 'C:/Music/Track.flac',
      isFavorite: true,
      isBlacklisted: false,
      artists: [
        {
          artist: {
            id: 7,
            name: 'Test Artist',
            artworks: []
          }
        }
      ],
      albums: [
        {
          album: {
            id: 10,
            title: 'Test Album'
          }
        }
      ],
      artworks: [
        {
          artwork: {
            artworkPath: 'nora://localfiles/C:/Music/Cover.png'
          }
        }
      ]
    } as never);

    const result = await sendAudioData(42, true);

    // 1. Invariant: No binary artwork payload sent over IPC
    expect(result.artwork).toBeUndefined();

    // 2. Invariant: artworkPath is correctly resolved for renderer <img> usage
    expect(result.artworkPath).toBe('nora://localfiles/C:/Music/Cover.png');

    // 3. Invariant: Song metadata is intact
    expect(result.songId).toBe(42);
    expect(result.title).toBe('High Resolution Master');
    expect(result.duration).toBe(215);
    expect(result.path).toBe('nora://localfiles/C:/Music/Track.flac');
    expect(result.isAFavorite).toBe(true);

    // 4. Invariant: sharp is NEVER called on the critical playback path
    expect(mockedSharp).not.toHaveBeenCalled();

    // 5. Side-effects triggered
    expect(mockedAddSongToPlayHistory).toHaveBeenCalledWith(42);
    expect(mockedSetDiscordRpcActivity).toHaveBeenCalled();
  });

  test('throws SONG_NOT_FOUND when song does not exist', async () => {
    mockedGetPlayableSongById.mockResolvedValue(null as never);

    await expect(sendAudioData(999)).rejects.toThrow('SONG_NOT_FOUND');
    expect(mockedSharp).not.toHaveBeenCalled();
  });
});
