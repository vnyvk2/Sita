import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import { useLyricsQuery } from '../../../queries/lyrics';
import LyricsMetadata from '../../LyricsPage/LyricsMetadata';
import { renderLyricsLines } from '../../LyricsPage/lyricsUtils';
import { useActiveLyricIndex } from '../../LyricsPage/useActiveLyricIndex';

type Props = {
  isLyricsVisible: boolean;
  className?: string;
  lyricsData?: SongLyrics | null;
  lyricsLoading?: boolean;
};

const LyricsContainer = (props: Props) => {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const { isLyricsVisible, className, lyricsData, lyricsLoading } = props;
  const { t } = useTranslation();

  // When parent owns the query (passes lyricsLoading), use its data directly —
  // even while undefined/pending — to avoid a duplicate subscription.
  const parentOwnsQuery = lyricsLoading !== undefined;
  const fallbackQuery = useLyricsQuery({ enabled: isLyricsVisible && !parentOwnsQuery });
  const lyrics = parentOwnsQuery ? lyricsData : fallbackQuery.data;
  const isLoadingLyrics = parentOwnsQuery ? (lyricsLoading ?? false) : fallbackQuery.isPending;
  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);
  const isAutoScrolling = (preferences?.lyricsScrollMode ?? 'auto') === 'auto';

  const handleToggleAutoScrolling = useCallback(() => {
    storage.preferences.setPreferences('lyricsScrollMode', isAutoScrolling ? 'manual' : 'auto');
  }, [isAutoScrolling]);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      isAutoScrolling,
      'full',
      activeLineIndex,
      abLoop
    );
  }, [lyrics, currentSongData.duration, isAutoScrolling, activeLineIndex, abLoop]);

  const lyricsSource = useMemo(() => {
    if (lyrics && lyrics?.lyrics) {
      const { source, link } = lyrics;

      return (
        <LyricsMetadata
          source={source}
          copyright={lyrics.lyrics.copyright}
          link={link}
          className="items-start! text-left!"
        />
      );
    }
    return undefined;
  }, [lyrics]);

  const containerClasses =
    className ||
    `mini-player-lyrics-container appear-from-bottom absolute top-0 flex h-full max-h-screen! w-full max-w-full! flex-col items-start overflow-auto pt-20 pr-[20%] pb-[25%] pl-20 transition-[filter] delay-200 select-none ${
      !isCurrentSongPlaying ? 'blur-xs brightness-50' : ''
    }`;

  const scrollToggleLabel = t(
    `currentQueuePage.${isAutoScrolling ? 'disableAutoScrolling' : 'enableAutoScrolling'}`
  );

  return (
    <div className={containerClasses} id="miniPlayerLyricsContainer">
      {isLyricsVisible && lyrics?.lyrics?.isSynced && (
        <button
          type="button"
          onClick={handleToggleAutoScrolling}
          aria-pressed={isAutoScrolling}
          aria-label={scrollToggleLabel}
          title={scrollToggleLabel}
          className="sticky top-0 z-30 -mb-8 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center self-end rounded-full bg-black/30 text-white shadow-md backdrop-blur-md transition-all hover:bg-black/50"
        >
          <span className="material-icons-round text-xl">
            {isAutoScrolling ? 'flash_off' : 'flash_on'}
          </span>
        </button>
      )}
      {isLyricsVisible && isLoadingLyrics && (
        <div className="flex h-full w-full flex-col items-center justify-center opacity-60">
          <span className="material-icons-round-outlined mb-2 animate-spin text-5xl">
            progress_activity
          </span>
          <p>{t('common.loading', 'Loading...')}</p>
        </div>
      )}
      {isLyricsVisible && !isLoadingLyrics && lyricsComponents.length > 0 && lyrics?.lyrics?.isSynced && (
        <>
          {lyricsComponents}
          {lyricsSource}
        </>
      )}
      {isLyricsVisible && !isLoadingLyrics && lyrics?.lyrics && !lyrics.lyrics.isSynced && (
        <div className="text-font-color-highlight flex h-full w-full flex-col justify-center text-2xl opacity-50">
          <span className="material-icons-round-outlined mb-2 text-5xl">brightness_alert</span>
          {t('lyricsPage.noSyncedLyrics')}
          <p className="mt-4 text-base">{t('lyricsPage.noSyncedLyricsDescription')}</p>
        </div>
      )}
      {isLyricsVisible && !isLoadingLyrics && !lyrics?.lyrics && (
        <div className="text-font-color-highlight flex h-full w-full flex-col justify-center text-2xl opacity-50">
          <span className="material-icons-round-outlined mb-2 text-5xl">brightness_alert</span>
          <p>{t('lyricsPage.noLyrics')}</p>
          <p className="mt-4 text-base">{t('lyricsPage.noLyricsDescription')}</p>
        </div>
      )}
    </div>
  );
};

export default LyricsContainer;
