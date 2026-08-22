import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { artistQuery } from '@renderer/queries/artists';
import { usePreviewAudio } from '@renderer/hooks/usePreviewAudio';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import calculateTimeFromSeconds from '@renderer/utils/calculateTimeFromSeconds';

export interface OnlineTracklistProps {
  onlineAlbumId: number;
  artistId: number;
  artistName: string;
}

export function OnlineTracklist({ onlineAlbumId, artistId, artistName }: OnlineTracklistProps) {
  const { t } = useTranslation();
  const { createQueue, updateQueueData } = useContext(AppUpdateContext);
  const { playPreview, isCurrentTrackPlaying } = usePreviewAudio();

  const { data: tracks = [], isLoading, isError } = useQuery(
    artistQuery.onlineAlbumTracks({ onlineAlbumId, artistId })
  );

  const handlePlayLocalSong = (songId: number) => {
    createQueue([songId], 'artist', false, artistId, false, artistName);
    updateQueueData(0, undefined, false, true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm opacity-60">
        <span className="material-icons-round animate-spin mr-2 text-lg">sync</span>
        {t('common.loading')}
      </div>
    );
  }

  if (isError || tracks.length === 0) {
    return (
      <div className="py-4 text-center text-sm opacity-60">
        {t('common.noTracksFound', 'No tracks available for preview')}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-font-color-dimmed/10 pt-2 dark:border-font-color-dimmed/20">
      <div className="flex flex-col space-y-1">
        {tracks.map((track, idx) => {
          const isPlayingThisPreview = isCurrentTrackPlaying(`track-${track.id}`);
          const durationStr = calculateTimeFromSeconds(track.duration || 0).timeString;

          return (
            <div
              key={track.id || idx}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-background-color-1/40 dark:hover:bg-dark-background-color-1/40"
            >
              <div className="flex items-center space-x-3 overflow-hidden">
                <span className="w-5 text-right font-mono text-xs opacity-50">
                  {track.trackPosition || idx + 1}
                </span>
                <span className="truncate font-medium text-font-color-black dark:text-font-color-white">
                  {track.title}
                </span>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <span className="text-xs opacity-60">{durationStr}</span>

                {track.isInLibrary && track.localSongId ? (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                      <span className="material-icons-round mr-1 text-sm">check</span>
                      {t('common.inLibrary', 'In Library')}
                    </span>
                    <button
                      type="button"
                      title={t('common.play')}
                      onClick={() => handlePlayLocalSong(track.localSongId!)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-background-color-2 text-font-color-highlight hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3 transition-transform hover:scale-105"
                    >
                      <span className="material-icons-round text-base">play_arrow</span>
                    </button>
                  </div>
                ) : track.previewUrl ? (
                  <button
                    type="button"
                    title={isPlayingThisPreview ? t('common.pause') : t('common.play30sPreview', '30s Preview')}
                    onClick={() => playPreview(`track-${track.id}`, track.previewUrl)}
                    className={`flex items-center space-x-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      isPlayingThisPreview
                        ? 'bg-font-color-highlight text-white dark:bg-dark-font-color-highlight'
                        : 'bg-background-color-2/80 text-font-color-highlight hover:bg-background-color-3 dark:bg-dark-background-color-2/80 dark:text-dark-font-color-highlight dark:hover:bg-dark-background-color-3'
                    }`}
                  >
                    <span className="material-icons-round text-sm">
                      {isPlayingThisPreview ? 'pause' : 'play_arrow'}
                    </span>
                    <span>30s</span>
                  </button>
                ) : (
                  <span className="text-xs opacity-40">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OnlineTracklist;
