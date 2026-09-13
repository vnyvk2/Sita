import LyricsAmbientBackground from '@renderer/components/LyricsPage/LyricsAmbientBackground';
import { renderLyricsLines } from '@renderer/components/LyricsPage/lyricsUtils';
import NoLyrics from '@renderer/components/LyricsPage/NoLyrics';
import { useActiveLyricIndex } from '@renderer/components/LyricsPage/useActiveLyricIndex';
import useSkipLyricsLines from '@renderer/hooks/useSkipLyricsLines';
import { useLyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

export const LyricsPanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const { data: lyrics, isPending: isLoadingLyrics } = useLyricsQuery({
    enabled: Boolean(currentSongData.songId)
  });

  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(lyrics ?? null);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      true,
      'drawer',
      activeLineIndex,
      abLoop
    );
  }, [currentSongData.duration, lyrics, activeLineIndex, abLoop]);

  const handleExpandToPage = () => {
    navigate({
      to: '/main-player/lyrics',
      search: { from: '/main-player' }
    });
  };

  const hasLyrics = lyricsComponents.length > 0;

  return (
    <div className="lyrics-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white relative flex h-full w-full flex-col overflow-hidden">
      {/* Dynamic Ambient Artwork Background */}
      {preferences?.lyricsBackground === 'artwork' && currentSongData.artworkPath && (
        <LyricsAmbientBackground
          artworkPath={
            currentSongData.artworkPaths?.optimizedArtworkPath ?? currentSongData.artworkPath
          }
          paletteData={currentSongData.paletteData}
        />
      )}

      {/* Sub-header with track name and full-page expand action */}
      <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 relative z-10 flex shrink-0 items-center justify-between border-b border-stone-200/50 px-3 py-2 dark:border-stone-800/50">
        <div className="flex min-w-0 flex-col pr-2">
          <span className="text-font-color-black dark:text-font-color-white truncate text-xs font-semibold">
            {currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}
          </span>
          <span className="text-font-color-dimmed truncate text-[10px]">
            {Array.isArray(currentSongData.artists)
              ? currentSongData.artists.map((a) => a.name).join(', ')
              : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={handleExpandToPage}
          title={t('lyricsPage.expandToFullPage', 'Expand to full page')}
          className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-stone-200 dark:hover:bg-stone-700"
        >
          <span className="material-symbols-rounded text-sm">open_in_new</span>
        </button>
      </div>

      {/* Lyrics lines stream */}
      <div className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto p-4">
        {isLoadingLyrics ? (
          <div className="text-font-color-dimmed flex h-full w-full items-center justify-center p-6 text-center">
            <span className="material-symbols-rounded mb-2 animate-spin text-2xl">
              progress_activity
            </span>
          </div>
        ) : hasLyrics ? (
          <div className="lyrics-container flex flex-col items-center py-6 text-center">
            {lyricsComponents}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <NoLyrics
              iconName="release_alert"
              title={t('lyricsPage.noLyrics', 'No lyrics available')}
              description={t(
                'lyricsPage.noLyricsDescription',
                'Could not find lyrics for this track.'
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
});

LyricsPanel.displayName = 'LyricsPanel';
export default LyricsPanel;
