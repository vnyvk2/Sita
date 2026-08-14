import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '../Button';
import FocusedLyricsPlayerBar from './FocusedLyricsPlayerBar';
import LyricsAmbientBackground from './LyricsAmbientBackground';
import LyricsMetadata from './LyricsMetadata';

interface FocusedLyricsViewProps {
  lyrics?: SongLyrics | null;
  lyricsComponents: ReactNode[];
  copyright?: string;
  isAutoScrolling?: boolean;
  onToggleAutoScrolling: () => void;
  onEditLyrics: () => void;
  onResetLyrics?: () => void;
  onClose: () => void;
}

const FocusedLyricsView = ({
  lyrics,
  lyricsComponents,
  copyright,
  isAutoScrolling = true,
  onToggleAutoScrolling,
  onEditLyrics,
  onResetLyrics,
  onClose
}: FocusedLyricsViewProps) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { t } = useTranslation();

  // Escape key closes focused view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isArtworkBackground = preferences?.lyricsBackground === 'artwork';

  return (
    <div className="focused-lyrics-view fixed inset-0 z-40 flex h-screen w-screen flex-col overflow-hidden bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white select-none">
      {/* Optional Ambient Artwork Background */}
      {isArtworkBackground && (
        <LyricsAmbientBackground
          artworkPath={currentSongData.artworkPath}
          paletteData={currentSongData.paletteData}
        />
      )}

      {/* Floating Top Header */}
      <div className="relative z-20 flex w-full items-center justify-between px-8 py-4">
        {/* Left: Collapse / Back Button */}
        <div className="flex items-center gap-3">
          <Button
            tooltipLabel={t('lyricsPage.collapseLyrics', 'Collapse lyrics')}
            iconName="arrow_back"
            iconClassName="material-icons-round text-2xl!"
            className="collapse-lyrics-btn rounded-full! border-0! bg-black/30 hover:bg-black/50 text-white! p-2! shadow-md backdrop-blur-md transition-all"
            clickHandler={onClose}
          />
          <div className="flex flex-col">
            <span className="max-w-xs truncate text-sm font-semibold tracking-wide text-white drop-shadow-xs">
              {currentSongData.title}
            </span>
            {currentSongData.artists && currentSongData.artists.length > 0 && (
              <span className="max-w-xs truncate text-xs text-white/70">
                {currentSongData.artists.map((a) => a.name).join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2">
          {lyrics?.lyrics?.isSynced && (
            <Button
              tooltipLabel={t(
                `currentQueuePage.${isAutoScrolling ? 'disableAutoScrolling' : 'enableAutoScrolling'}`
              )}
              iconName={isAutoScrolling ? 'flash_off' : 'flash_on'}
              iconClassName="material-icons-round text-xl!"
              className="rounded-full! border-0! bg-black/30 hover:bg-black/50 text-white! p-2! shadow-md backdrop-blur-md transition-all"
              clickHandler={onToggleAutoScrolling}
            />
          )}

          {lyrics && (lyrics.lyrics.isTranslated || lyrics.lyrics.isRomanized) && onResetLyrics && (
            <Button
              tooltipLabel={t('lyricsPage.resetLyrics')}
              iconName="restart_alt"
              iconClassName="material-icons-round text-xl!"
              className="rounded-full! border-0! bg-black/30 hover:bg-black/50 text-white! p-2! shadow-md backdrop-blur-md transition-all"
              clickHandler={onResetLyrics}
            />
          )}

          <Button
            tooltipLabel={t('lyricsPage.editLyrics')}
            iconName="edit"
            iconClassName="material-icons-round text-xl!"
            className="rounded-full! border-0! bg-black/30 hover:bg-black/50 text-white! p-2! shadow-md backdrop-blur-md transition-all"
            clickHandler={onEditLyrics}
          />
        </div>
      </div>

      {/* Main Lyrics Stream */}
      <div className="lyrics-lines-container relative z-10 min-h-0 flex-1 w-full scrollbar-gutter-stable flex-col items-center overflow-y-auto px-8 py-[8vh] [overflow-anchor:none]!">
        {lyricsComponents}
        {lyrics && (
          <LyricsMetadata
            source={lyrics.source}
            link={lyrics.link}
            copyright={copyright}
            isTranslated={lyrics.lyrics.isTranslated}
          />
        )}
      </div>

      {/* Floating Bottom Player Bar */}
      <FocusedLyricsPlayerBar />
    </div>
  );
};

export default FocusedLyricsView;
