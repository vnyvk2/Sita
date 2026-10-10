import LyricsAmbientBackground from '@renderer/components/LyricsPage/LyricsAmbientBackground';
import { renderLyricsLines } from '@renderer/components/LyricsPage/lyricsUtils';
import NoLyrics from '@renderer/components/LyricsPage/NoLyrics';
import { useActiveLyricIndex } from '@renderer/components/LyricsPage/useActiveLyricIndex';
import useSkipLyricsLines from '@renderer/hooks/useSkipLyricsLines';
import { useLyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { PanelHeaderSlot } from '../../engine/PanelHeaderSlot';
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

  const isSynced = Boolean(lyrics?.lyrics?.isSynced);
  const activeLineIndex = useActiveLyricIndex(lyrics ?? null);
  const isAutoScrolling = (preferences?.lyricsScrollMode ?? 'auto') === 'auto';

  const handleToggleAutoScrolling = useCallback(() => {
    storage.preferences.setPreferences('lyricsScrollMode', isAutoScrolling ? 'manual' : 'auto');
  }, [isAutoScrolling]);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      isAutoScrolling,
      'drawer',
      activeLineIndex,
      abLoop
    );
  }, [currentSongData.duration, isAutoScrolling, lyrics, activeLineIndex, abLoop]);

  const artistsString = useMemo(() => {
    return Array.isArray(currentSongData.artists)
      ? currentSongData.artists.map((a) => a.name).join(', ')
      : '';
  }, [currentSongData.artists]);

  const handleExpandToPage = useCallback(() => {
    navigate({
      to: '/main-player/lyrics',
      search: { from: '/main-player' }
    });
  }, [navigate]);

  const hasLyrics = lyricsComponents.length > 0;

  const headerInfo = useMemo(
    () => (
      <span
        className="truncate text-[11px]"
        title={`${currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}${artistsString ? ` — ${artistsString}` : ''}`}
      >
        <span className="text-font-color-black dark:text-font-color-white font-semibold">
          {currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}
        </span>
        {artistsString && <span className="text-font-color-dimmed"> — {artistsString}</span>}
      </span>
    ),
    [currentSongData.title, artistsString, t]
  );

  const scrollToggleLabel = t(
    `currentQueuePage.${isAutoScrolling ? 'disableAutoScrolling' : 'enableAutoScrolling'}`
  );

  const headerActions = useMemo(
    () =>
      isSynced ? (
        <button
          type="button"
          onClick={handleToggleAutoScrolling}
          aria-pressed={isAutoScrolling}
          aria-label={scrollToggleLabel}
          title={scrollToggleLabel}
          className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-700/60"
        >
          <span className="material-icons-round text-[13px] leading-none">
            {isAutoScrolling ? 'flash_off' : 'flash_on'}
          </span>
        </button>
      ) : null,
    [isSynced, handleToggleAutoScrolling, isAutoScrolling, scrollToggleLabel]
  );

  const headerMenu = useCallback(
    () => [
      ...(isSynced
        ? [
            {
              label: scrollToggleLabel,
              icon: isAutoScrolling ? 'flash_off' : 'flash_on',
              handler: handleToggleAutoScrolling
            }
          ]
        : []),
      {
        label: t('lyricsPage.expandToFullPage', 'Expand to full page'),
        icon: 'open_in_new',
        handler: handleExpandToPage
      }
    ],
    [isSynced, scrollToggleLabel, isAutoScrolling, handleToggleAutoScrolling, handleExpandToPage, t]
  );

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

      <PanelHeaderSlot info={headerInfo} actions={headerActions} menu={headerMenu} />

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
