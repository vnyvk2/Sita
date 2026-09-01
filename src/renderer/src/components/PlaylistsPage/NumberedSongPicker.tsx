import { useMemo } from 'react';

import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import type { CoverSlotIndex } from '../../types/playlistCover';
import Img from '../Img';

type Props = {
  playlistSongs: SongData[];
  selectedSongIds: number[];
  maxSize: number;
  activeSlotIndex?: CoverSlotIndex | null;
  onToggleSong: (songId: number) => void;
};

const NumberedSongPicker = ({
  playlistSongs,
  selectedSongIds,
  maxSize,
  activeSlotIndex = null,
  onToggleSong
}: Props) => {
  const selectedSet = new Set(selectedSongIds);

  const uniquePlaylistSongs = useMemo(() => {
    const map = new Map<number, SongData>();
    for (const song of playlistSongs) {
      if (song && song.songId !== undefined && !map.has(song.songId)) {
        map.set(song.songId, song);
      }
    }
    return Array.from(map.values());
  }, [playlistSongs]);

  const getPositionBadge = (songId: number) => {
    const idx = selectedSongIds.indexOf(songId);
    if (idx === -1) return null;
    const badges = ['①', '②', '③', '④'];
    return badges[idx] || `${idx + 1}`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="numbered-song-picker mb-6">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-semibold text-neutral-300">
          Selected Cover Songs ({selectedSongIds.length} / {maxSize})
        </label>
        <span className="text-xs text-neutral-500">Order determines quadrant position</span>
      </div>

      <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/60 p-2">
        {uniquePlaylistSongs.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-500">No songs in playlist</div>
        ) : (
          uniquePlaylistSongs.map((song) => {
            const isSelected = selectedSet.has(song.songId);
            const badge = getPositionBadge(song.songId);
            const isMaxReached =
              activeSlotIndex === null && !isSelected && selectedSongIds.length >= maxSize;

            return (
              <div
                key={song.songId}
                onClick={() => !isMaxReached && onToggleSong(song.songId)}
                className={`group flex items-center justify-between rounded-lg p-2 transition-all duration-150 ${
                  isSelected
                    ? 'cursor-pointer border border-neutral-700 bg-neutral-800/90 text-white shadow-sm'
                    : isMaxReached
                      ? 'cursor-not-allowed border border-transparent bg-neutral-900/20 text-neutral-600 opacity-50'
                      : 'cursor-pointer border border-transparent bg-neutral-900/40 text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {/* Position Badge or Checkbox */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold">
                    {isSelected ? (
                      <span className="text-base text-amber-400">{badge}</span>
                    ) : (
                      <span className="material-icons-round text-base text-neutral-600 group-hover:text-neutral-400">
                        add_circle_outline
                      </span>
                    )}
                  </div>

                  {/* Artwork Thumbnail */}
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-neutral-800">
                    <Img
                      src={song.artworkPaths?.artworkPath || DefaultImgCover}
                      fallbackSrc={DefaultImgCover}
                      alt={song.title}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {/* Song Metadata */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-tight font-medium text-white">
                      {song.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">
                      {Array.isArray(song.artists)
                        ? song.artists.map((a) => (typeof a === 'string' ? a : a.name)).join(', ')
                        : 'Unknown Artist'}
                    </p>
                  </div>
                </div>

                {/* Duration */}
                <span className="ml-3 shrink-0 text-xs text-neutral-500">
                  {formatDuration(song.duration)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NumberedSongPicker;
