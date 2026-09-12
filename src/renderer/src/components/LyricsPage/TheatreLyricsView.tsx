import Button from '@renderer/components/Button';
import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import LyricsAmbientBackground from './LyricsAmbientBackground';
import LyricsMetadata from './LyricsMetadata';
import TheatreLyricsPlayerBar from './TheatreLyricsPlayerBar';

interface TheatreLyricsViewProps {
  lyrics?: SongLyrics | null;
  lyricsComponents: ReactNode[];
  copyright?: string;
  isAutoScrolling?: boolean;
  onToggleAutoScrolling: () => void;
  onEditLyrics: () => void;
  onResetLyrics?: () => void;
  onClose: () => void;
}

const TheatreLyricsView = ({
  lyrics,
  lyricsComponents,
  copyright,
  isAutoScrolling = true,
  onToggleAutoScrolling,
  onEditLyrics,
  onResetLyrics,
  onClose
}: TheatreLyricsViewProps) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { t } = useTranslation();

  // Escape key closes theatre mode
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

  return createPortal(
    <div className="theatre-lyrics-view bg-background-color-1 text-font-color-black dark:bg-dark-background-color-1 dark:text-font-color-white fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden select-none">
      {/* Ambient Artwork Background */}
      {isArtworkBackground && (
        <LyricsAmbientBackground
          artworkPath={
            currentSongData.artworkPaths?.optimizedArtworkPath ?? currentSongData.artworkPath
          }
          paletteData={currentSongData.paletteData}
        />
      )}

      {/* Floating Top Header */}
      <div className="relative z-20 flex w-full items-center justify-between px-8 py-4">
        {/* Left: Exit Theatre Mode / Back Button */}
        <div className="flex items-center gap-3">
          <Button
            tooltipLabel={t('lyricsPage.exitTheatreMode', 'Exit Theatre Mode')}
            iconName="arrow_back"
            iconClassName="material-icons-round text-2xl!"
            className="exit-theatre-btn rounded-full! border-0! bg-black/30 p-2! text-white! shadow-md backdrop-blur-md transition-all hover:bg-black/50"
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
              className="rounded-full! border-0! bg-black/30 p-2! text-white! shadow-md backdrop-blur-md transition-all hover:bg-black/50"
              clickHandler={onToggleAutoScrolling}
            />
          )}

          {lyrics && (lyrics.lyrics.isTranslated || lyrics.lyrics.isRomanized) && onResetLyrics && (
            <Button
              tooltipLabel={t('lyricsPage.resetLyrics')}
              iconName="restart_alt"
              iconClassName="material-icons-round text-xl!"
              className="rounded-full! border-0! bg-black/30 p-2! text-white! shadow-md backdrop-blur-md transition-all hover:bg-black/50"
              clickHandler={onResetLyrics}
            />
          )}

          <Button
            tooltipLabel={t('lyricsPage.editLyrics')}
            iconName="edit"
            iconClassName="material-icons-round text-xl!"
            className="rounded-full! border-0! bg-black/30 p-2! text-white! shadow-md backdrop-blur-md transition-all hover:bg-black/50"
            clickHandler={onEditLyrics}
          />
        </div>
      </div>

      {/* Main Lyrics Stream */}
      <div className="lyrics-lines-container relative z-10 flex min-h-0 w-full flex-1 scrollbar-gutter-stable flex-col items-center overflow-y-auto px-8 py-[8vh] [overflow-anchor:none]!">
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
      <TheatreLyricsPlayerBar />
    </div>,
    document.body
  );
};

export default TheatreLyricsView;
