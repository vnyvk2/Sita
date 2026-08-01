import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';

type Props = {
  playlistSongs: SongData[];
  selectedSongIds: number[];
  maxSize: number;
  onToggleSong: (songId: number) => void;
};

const NumberedSongPicker = ({ playlistSongs, selectedSongIds, maxSize, onToggleSong }: Props) => {
  const selectedSet = new Set(selectedSongIds);

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
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold text-neutral-300">
          Selected Cover Songs ({selectedSongIds.length} / {maxSize})
        </label>
        <span className="text-xs text-neutral-500">Order determines quadrant position</span>
      </div>

      <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-xl bg-neutral-900/60 p-2 border border-neutral-800">
        {playlistSongs.length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-500">No songs in playlist</div>
        ) : (
          playlistSongs.map((song) => {
            const isSelected = selectedSet.has(song.songId);
            const badge = getPositionBadge(song.songId);

            return (
              <div
                key={song.songId}
                onClick={() => onToggleSong(song.songId)}
                className={`group flex items-center justify-between p-2 rounded-lg transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-neutral-800/90 border border-neutral-700 text-white shadow-sm'
                    : 'bg-neutral-900/40 border border-transparent text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Position Badge or Checkbox */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-bold text-sm">
                    {isSelected ? (
                      <span className="text-amber-400 text-base">{badge}</span>
                    ) : (
                      <span className="material-icons-round text-neutral-600 text-base group-hover:text-neutral-400">
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
                    <p className="truncate text-sm font-medium text-white leading-tight">{song.title}</p>
                    <p className="truncate text-xs text-neutral-400 mt-0.5">
                      {Array.isArray(song.artists)
                        ? song.artists.map((a) => (typeof a === 'string' ? a : a.name)).join(', ')
                        : 'Unknown Artist'}
                    </p>
                  </div>
                </div>

                {/* Duration */}
                <span className="text-xs text-neutral-500 shrink-0 ml-3">
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
