import React, { memo, useContext } from 'react';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import type { TopTrackItem } from '../../queries/analytics';

interface TopTracksLeaderboardCardProps {
  topTracks: TopTrackItem[];
}

function formatDuration(durationSeconds: number): string {
  const mins = Math.floor(durationSeconds / 60);
  const secs = Math.floor(durationSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const TopTracksLeaderboardCard = memo(({ topTracks }: TopTracksLeaderboardCardProps) => {
  const { playSong, createQueue } = useContext(AppUpdateContext);

  const handlePlayTrack = (songId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (createQueue && topTracks.length > 0) {
      createQueue(
        topTracks.map((t) => t.songId),
        'songs',
        false,
        undefined,
        false,
        'Top Tracks'
      );
      playSong(songId, true);
    } else if (playSong) {
      playSong(songId, true);
    }
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-background-color-2/70 bg-background-color-1/80 p-5 shadow-sm backdrop-blur-md dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 transition-all hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <span className="material-icons-round text-lg">leaderboard</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Top Tracks
            </span>
          </div>
          <span className="text-xs font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">
            Top {topTracks.length}
          </span>
        </div>

        {topTracks.length === 0 ? (
          <div className="py-12 text-center text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
            No track listening history recorded yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[300px] pr-1">
            {topTracks.map((track, idx) => {
              const artistNames = track.artists.map((a) => a.name).join(', ') || 'Unknown Artist';
              const rank = idx + 1;
              const isTop3 = rank <= 3;
              const rankColor =
                rank === 1
                  ? 'text-amber-500 font-bold'
                  : rank === 2
                  ? 'text-slate-400 font-bold'
                  : rank === 3
                  ? 'text-amber-700 dark:text-amber-600 font-bold'
                  : 'text-font-color-dimmed dark:text-dark-font-color-dimmed';

              const coverSrc = track.artworkPaths?.artworkPath || DefaultSongCover;

              return (
                <div
                  key={track.songId}
                  onClick={(e) => handlePlayTrack(track.songId, e)}
                  className="group flex items-center justify-between gap-3 rounded-xl p-2 transition-all hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/40 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-4 text-center text-xs ${rankColor}`}>{rank}</span>
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                      <img
                        src={coverSrc}
                        alt={track.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="material-icons-round text-base text-white">play_arrow</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-font-color-black dark:text-font-color-white group-hover:text-font-color-highlight dark:group-hover:text-dark-font-color-highlight">
                        {track.title}
                      </div>
                      <div className="truncate text-[11px] text-font-color-dimmed dark:text-dark-font-color-dimmed">
                        {artistNames}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div className="text-[11px] font-semibold text-font-color-black dark:text-font-color-white">
                      {track.playCount} <span className="text-[10px] font-normal text-font-color-dimmed dark:text-dark-font-color-dimmed">plays</span>
                    </div>
                    <div className="text-[11px] text-font-color-dimmed dark:text-dark-font-color-dimmed w-9">
                      {formatDuration(track.duration)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

TopTracksLeaderboardCard.displayName = 'TopTracksLeaderboardCard';
