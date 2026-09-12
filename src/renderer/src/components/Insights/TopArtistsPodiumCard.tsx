import { memo } from 'react';

import DefaultArtistCover from '../../assets/images/webp/artist_cover_default.webp';
import type { TopArtistItem } from '../../queries/analytics';

interface TopArtistsPodiumCardProps {
  topArtists: TopArtistItem[];
}

export const TopArtistsPodiumCard = memo(({ topArtists }: TopArtistsPodiumCardProps) => {
  const top3 = topArtists.slice(0, 3);
  const remaining = topArtists.slice(3, 8);

  return (
    <div className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-all">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <span className="material-icons-round text-lg">person_pin</span>
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
              Top Artists
            </span>
          </div>
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
            Podium
          </span>
        </div>

        {topArtists.length === 0 ? (
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed py-12 text-center text-xs italic">
            No artist listening history recorded yet.
          </div>
        ) : (
          <div>
            {/* Top 3 Visual Podium */}
            <div className="flex items-end justify-center gap-2 pt-2 pb-4">
              {/* #2 Rank */}
              {top3[1] && (
                <div className="flex max-w-[100px] flex-1 flex-col items-center text-center">
                  <div className="relative mb-1">
                    <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-slate-400/60 p-0.5 shadow-sm">
                      <img
                        src={top3[1].artworkPaths?.artworkPath || DefaultArtistCover}
                        alt={top3[1].name}
                        className="h-full w-full rounded-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-[10px] font-bold text-white shadow">
                      2
                    </span>
                  </div>
                  <div className="text-font-color-black dark:text-font-color-white w-full truncate text-xs font-medium">
                    {top3[1].name}
                  </div>
                  <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
                    {top3[1].playCount} plays
                  </div>
                </div>
              )}

              {/* #1 Rank (Center & Larger) */}
              {top3[0] && (
                <div className="-mt-2 flex max-w-[120px] flex-1 flex-col items-center text-center">
                  <div className="relative mb-1">
                    <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-amber-400 p-0.5 shadow-md">
                      <img
                        src={top3[0].artworkPaths?.artworkPath || DefaultArtistCover}
                        alt={top3[0].name}
                        className="h-full w-full rounded-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-amber-950 shadow">
                      👑
                    </span>
                  </div>
                  <div className="text-font-color-black dark:text-font-color-white w-full truncate text-xs font-bold">
                    {top3[0].name}
                  </div>
                  <div className="text-[11px] font-medium text-amber-500">
                    {top3[0].playCount} plays
                  </div>
                </div>
              )}

              {/* #3 Rank */}
              {top3[2] && (
                <div className="flex max-w-[100px] flex-1 flex-col items-center text-center">
                  <div className="relative mb-1">
                    <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-amber-700/60 p-0.5 shadow-sm">
                      <img
                        src={top3[2].artworkPaths?.artworkPath || DefaultArtistCover}
                        alt={top3[2].name}
                        className="h-full w-full rounded-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[10px] font-bold text-white shadow">
                      3
                    </span>
                  </div>
                  <div className="text-font-color-black dark:text-font-color-white w-full truncate text-xs font-medium">
                    {top3[2].name}
                  </div>
                  <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
                    {top3[2].playCount} plays
                  </div>
                </div>
              )}
            </div>

            {/* Rows 4..8 */}
            {remaining.length > 0 && (
              <div className="border-background-color-2/40 mt-2 flex flex-col gap-1 border-t pt-2">
                {remaining.map((artist, i) => (
                  <div
                    key={artist.artistId}
                    className="hover:bg-background-color-2/40 dark:hover:bg-dark-background-color-2/40 flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed w-3 text-[11px]">
                        {i + 4}
                      </span>
                      <span className="text-font-color-black dark:text-font-color-white truncate font-medium">
                        {artist.name}
                      </span>
                    </div>
                    <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed shrink-0 text-[11px] font-semibold">
                      {artist.playCount} plays
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

TopArtistsPodiumCard.displayName = 'TopArtistsPodiumCard';
