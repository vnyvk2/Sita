import { SYNCED_LYRICS_REGEX } from '@common/isLyricsSynced';
import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import i18n from '../../i18n';
import { useLyricsQuery } from '../../queries/lyrics';
import { CloseIcon } from '../Icons/WindowIcons';
import Img from '../Img';
import { useActiveLyricIndex } from '../LyricsPage/useActiveLyricIndex';

type Props = {
  isLyricsVisible: boolean;
  onClose: () => void;
};

const getLyricPlainText = (text?: string | SyncedLyricsLineWord[]): string => {
  if (!text) return '';
  if (typeof text === 'string') {
    const match = SYNCED_LYRICS_REGEX.exec(text);
    SYNCED_LYRICS_REGEX.lastIndex = 0;
    if (match?.groups?.lyric) return match.groups.lyric.trim();
    return text;
  }
  return text.map((word) => word.text).join(' ').trim();
};

const CompactLyricsPanel = (props: Props) => {
  const { isLyricsVisible, onClose } = props;

  const currentSongData = useStore(store, (state) => state.currentSongData);

  const { updateSongPosition } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const { data: lyrics } = useLyricsQuery({ enabled: isLyricsVisible });
  const rawActiveIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);
  const currentLineIndex = rawActiveIndex ?? -1;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll isolated to the lyrics viewport (does NOT scroll parent containers)
  useEffect(() => {
    if (isUserScrollingRef.current) return;
    if (currentLineIndex >= 0 && scrollContainerRef.current) {
      const lineEl = lineRefs.current.get(currentLineIndex);
      if (lineEl) {
        const container = scrollContainerRef.current;
        const targetScrollTop =
          lineEl.offsetTop - container.clientHeight / 2 + lineEl.clientHeight / 2;
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        } else {
          container.scrollTop = Math.max(0, targetScrollTop);
        }
      }
    }
  }, [currentLineIndex]);

  // Handle user manual scroll via wheel/touch with temporary pause on auto-scroll
  const handleUserInteraction = useCallback(() => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  const parsedLyrics = useMemo(
    () => lyrics?.lyrics?.parsedLyrics ?? [],
    [lyrics?.lyrics?.parsedLyrics]
  );
  const isSynced = lyrics?.lyrics?.isSynced ?? false;

  const handleLineClick = (start?: number) => {
    if (typeof start === 'number' && updateSongPosition) {
      updateSongPosition(start);
    }
  };

  return (
    <div
      data-testid="compact-lyrics-panel"
      className="compact-lyrics-panel relative flex h-[160px] min-h-[160px] w-full flex-col justify-between overflow-hidden bg-black/75 select-none border-t border-white/10 [-webkit-app-region:no-drag]"
    >
      {/* ── Layer 1: Ambient Blurred Artwork Background (z-0) ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <Img
          src={currentSongData.artworkPath}
          fallbackSrc={DefaultSongCover}
          alt="Album Art Ambient Background"
          className="h-full w-full object-cover blur-2xl brightness-[0.35] scale-125 transition-[filter,transform] duration-500"
        />
        <div className="absolute inset-0 bg-black/45 backdrop-blur-md" />
      </div>

      {/* ── Layer 2: Floating Close Button (z-30) ── */}
      <button
        type="button"
        className="absolute top-2 right-2 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-black/40 text-font-color-white/70 transition-colors hover:bg-[#e81123] hover:text-white"
        onClick={onClose}
        title={t('common.close', 'Close')}
      >
        <CloseIcon className="h-2 w-2" />
      </button>

      {/* ── Layer 3: Lyrics Scrollable Viewport (Strict min-h-0 flex-1 container at z-10) ── */}
      <div
        ref={scrollContainerRef}
        onWheel={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto px-4 py-6 scrollbar-none text-center select-none"
      >
        {/* ── Synced Lyrics List ── */}
        {lyrics && isSynced && parsedLyrics.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 py-4">
            {parsedLyrics.map((line, idx) => {
              const isActive = idx === currentLineIndex;
              const text = getLyricPlainText(line.originalText);
              if (!text) return null;
              return (
                <div
                  key={idx}
                  ref={(el) => {
                    if (el) lineRefs.current.set(idx, el);
                    else lineRefs.current.delete(idx);
                  }}
                  onClick={() => handleLineClick(line.start)}
                  className={`max-w-full cursor-pointer px-2 transition-all duration-200 ${
                    isActive
                      ? 'text-sm font-semibold text-font-color-highlight scale-105 drop-shadow-sm py-1'
                      : 'text-[11px] font-normal text-font-color-white/50 hover:text-font-color-white/90 py-0.5'
                  }`}
                >
                  {text}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Unsynced Plain-Text Scrollable List ── */}
        {lyrics && !isSynced && parsedLyrics.length > 0 && (
          <div className="flex flex-col items-center gap-1 py-4">
            {parsedLyrics.map((line, idx) => (
              <div
                key={idx}
                className="max-w-full py-0.5 text-xs text-font-color-white/80 leading-relaxed"
              >
                {getLyricPlainText(line.originalText)}
              </div>
            ))}
          </div>
        )}

        {/* ── Loading / Empty States ── */}
        {lyrics === null && (
          <div className="flex h-full min-h-[90px] items-center justify-center text-xs text-font-color-white/60">
            {t('lyricsPage.loadingLyrics', 'Loading lyrics...')}
          </div>
        )}

        {lyrics !== null && parsedLyrics.length === 0 && (
          <div className="flex h-full min-h-[90px] items-center justify-center text-xs text-font-color-white/60">
            {t('lyricsPage.noLyrics', 'No lyrics available')}
          </div>
        )}
      </div>

      {/* ── Layer 4: Pinned Attribution Footer (z-10 outside scrolling viewport) ── */}
      {lyrics?.source && (
        <div className="relative z-10 text-[9px] text-font-color-white/40 text-center select-none truncate py-1 border-t border-white/5 bg-black/20">
          {lyrics.source}
        </div>
      )}
    </div>
  );
};

export default CompactLyricsPanel;

