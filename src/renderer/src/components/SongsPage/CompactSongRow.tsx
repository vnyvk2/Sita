/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useStore } from '@tanstack/react-store';
import {
  type ForwardedRef,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useSongSelection } from '../../contexts/MultipleSelectionContext';
import useHeartBurst from '../../hooks/useHeartBurst';
import { useQueueOperations } from '../../hooks/useQueueOperations';
import { songCacheKeys } from '../../queries/songs';
import { queryClient } from '../../queryClient';
import { store } from '../../store/store';
import Button from '../Button';
import HeartBurst from '../HeartBurst';
import MultipleSelectionCheckbox from '../MultipleSelectionCheckbox';
import NavLink from '../NavLink';
import HighlightedText from '../SearchPage/HighlightedText';
import type { SongProp } from './StandardSongRow';

export const CompactSongRow = memo(
  forwardRef((props: SongProp, ref: ForwardedRef<HTMLDivElement>) => {
    const {
      songId,
      duration,
      isBlacklisted = false,
      title,
      additionalContextMenuItems,
      artists,
      album,
      style,
      selectAllHandler,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provided = {} as any,
      isDragging = false,
      onPlayClick,
      highlightText,
      className = ''
    } = props;

    // Granular store subscriptions: only subscribe to primitives relevant to this specific song
    const isCurrentSong = useStore(store, (state) => state.currentSongData?.songId === songId);
    const isSongPlaying = useStore(
      store,
      (state) =>
        state.currentSongData?.songId === songId && Boolean(state.player.isCurrentSongPlaying)
    );
    const currentSongFavorite = useStore(store, (state) =>
      state.currentSongData?.songId === songId ? state.currentSongData.isAFavorite : undefined
    );

    const { isSelected: isAMultipleSelection, isEnabled: isMultipleSelectionEnabled } =
      useSongSelection(songId);

    const {
      playSong,
      updateContextMenuData,
      toggleIsFavorite,
      toggleMultipleSelections,
      updateMultipleSelections
    } = useContext(AppUpdateContext);
    const { t } = useTranslation();

    // Queue operations for context menu actions
    const { addToNext, addToEnd } = useQueueOperations();

    const clickTimeoutRef = useRef<NodeJS.Timeout>(undefined);
    const likeMutationSeqRef = useRef(0);
    const { isBursting, triggerBurst } = useHeartBurst();

    const [optimisticFavorite, setOptimisticFavorite] = useState<{
      songId: number;
      isFavorite: boolean;
    } | null>(null);

    useEffect(() => {
      setOptimisticFavorite(null);
    }, [props.isAFavorite, songId]);

    const isAFavorite =
      isCurrentSong && currentSongFavorite !== undefined
        ? currentSongFavorite
        : optimisticFavorite && optimisticFavorite.songId === songId
          ? optimisticFavorite.isFavorite
          : props.isAFavorite;

    const handlePlayBtnClick = useCallback(
      (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (onPlayClick) return onPlayClick(songId);
        return playSong(songId);
      },
      [onPlayClick, playSong, songId]
    );

    const toggleSingleSongFavorite = useCallback(() => {
      const nextFav = !isAFavorite;
      const currentSeq = ++likeMutationSeqRef.current;

      setOptimisticFavorite({ songId, isFavorite: nextFav });
      if (nextFav) triggerBurst();

      queryClient.setQueriesData<SongData[]>({ queryKey: songCacheKeys.windowsRoot }, (old) => {
        if (!Array.isArray(old)) return old;
        let changed = false;
        const updated = old.map((s) => {
          if (s && s.songId === songId) {
            changed = true;
            return { ...s, isAFavorite: nextFav };
          }
          return s;
        });
        return changed ? updated : old;
      });

      if (isCurrentSong) {
        toggleIsFavorite(nextFav, true);
      }

      window.api.playerControls
        .toggleLikeSongs([songId], nextFav)
        .then((res) => {
          if (likeMutationSeqRef.current !== currentSeq) return;
          if (res && res.likes.length + res.dislikes.length === 0) {
            setOptimisticFavorite({ songId, isFavorite: !nextFav });
          } else {
            queryClient.invalidateQueries({ queryKey: ['songs', 'favorites'] });
          }
        })
        .catch(() => {
          if (likeMutationSeqRef.current !== currentSeq) return;
          setOptimisticFavorite({ songId, isFavorite: !nextFav });
        });
    }, [isAFavorite, isCurrentSong, songId, toggleIsFavorite, triggerBurst]);

    // Duration formatting
    const { minutes, seconds } = useMemo(() => {
      const totalSec = Math.floor(duration);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return {
        minutes: String(min),
        seconds: sec < 10 ? `0${sec}` : String(sec)
      };
    }, [duration]);

    // Artists element
    const songArtists = useMemo(() => {
      if (Array.isArray(artists) && artists.length > 0) {
        return artists.map((artist, idx) => (
          <span key={artist.artistId}>
            <NavLink
              to="/main-player/artists/$artistId"
              params={{ artistId: String(artist.artistId) }}
              className="hover:underline focus-visible:outline!"
            >
              {artist.name}
            </NavLink>
            {idx < artists.length - 1 && ', '}
          </span>
        ));
      }
      return t('common.unknownArtist');
    }, [artists, t]);

    // Context menu builder
    const getContextMenuItems = useCallback(async (): Promise<ContextMenuItem[]> => {
      const items: ContextMenuItem[] = [
        {
          label: isSongPlaying ? t('common.pause') : t('common.play'),
          iconName: isSongPlaying ? 'pause' : 'play_arrow',
          handlerFunction: () => handlePlayBtnClick()
        },
        {
          label: t('common.playNext'),
          iconName: 'play_arrow',
          handlerFunction: () => addToNext([songId])
        },
        {
          label: t('common.addToQueue'),
          iconName: 'queue',
          handlerFunction: () => addToEnd([songId])
        },
        {
          label: isAFavorite ? t('song.unlikeSong') : t('song.likeSong'),
          iconName: 'favorite',
          handlerFunction: toggleSingleSongFavorite
        }
      ];

      if (additionalContextMenuItems) {
        items.push(...additionalContextMenuItems);
      }

      return items;
    }, [
      isSongPlaying,
      t,
      handlePlayBtnClick,
      addToNext,
      songId,
      addToEnd,
      isAFavorite,
      toggleSingleSongFavorite,
      additionalContextMenuItems
    ]);

    return (
      <div
        style={{ ...style, height: 38 }}
        className={`compact-song-row group relative flex h-[38px] max-h-[38px] min-h-[38px] w-full items-center select-none text-xs transition-none border-b border-background-color-2/30 dark:border-dark-background-color-2/30 cursor-pointer ${
          isCurrentSong
            ? 'bg-accent/8 dark:bg-accent/12'
            : isAMultipleSelection
              ? 'bg-accent/15 dark:bg-accent/20'
              : 'hover:bg-background-color-2/60 dark:hover:bg-dark-background-color-2/40'
        } ${isDragging ? 'shadow-lg opacity-85 z-20' : ''} ${className}`}
        {...provided.draggableProps}
        onContextMenu={async (e) => {
          e.preventDefault();
          const { pageX, pageY } = e;
          const items = await getContextMenuItems();
          updateContextMenuData(true, items, pageX, pageY);
        }}
        onClick={(e) => {
          e.preventDefault();
          if (e.getModifierState('Shift') === true && selectAllHandler) selectAllHandler(songId);
          else if (e.getModifierState('Control') === true && !isMultipleSelectionEnabled)
            toggleMultipleSelections(!isAMultipleSelection, 'songs', [songId]);
          else if (isMultipleSelectionEnabled)
            updateMultipleSelections(songId, 'songs', isAMultipleSelection ? 'remove' : 'add');
        }}
        onDoubleClick={() => {
          if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
          handlePlayBtnClick();
        }}
        ref={ref}
      >
        {/* Left 28px indicator slot with horizontal-only drag hit area */}
        <div
          className="compact-indicator-slot relative flex h-[38px] w-[28px] shrink-0 items-center justify-center px-1.5 -mx-1.5"
          {...(provided.dragHandleProps ? provided.dragHandleProps : {})}
        >
          {isMultipleSelectionEnabled ? (
            <MultipleSelectionCheckbox id={songId} selectionType="songs" className="m-0" />
          ) : isBlacklisted ? (
            <span
              className="material-icons-round text-base opacity-60 text-font-color-dimmed"
              title={t('notifications.songBlacklisted', { title })}
            >
              block
            </span>
          ) : isCurrentSong ? (
            <>
              {/* MusicBee style: musical note when playing, pause bars when paused */}
              <span className="material-icons-round text-accent text-sm leading-none group-hover:hidden">
                {isSongPlaying ? 'music_note' : 'pause'}
              </span>
              <button
                type="button"
                onClick={handlePlayBtnClick}
                className="hidden group-hover:flex items-center justify-center text-accent hover:scale-110 transition-transform cursor-pointer"
                title={isSongPlaying ? t('common.pause') : t('common.play')}
              >
                <span className="material-icons-round text-base leading-none">
                  {isSongPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handlePlayBtnClick}
              className="hidden group-hover:flex items-center justify-center text-font-color-black dark:text-font-color-white hover:scale-110 transition-transform cursor-pointer"
              title={t('common.play')}
            >
              <span className="material-icons-round text-base leading-none">play_arrow</span>
            </button>
          )}
        </div>

        {/* Title column */}
        <div className="flex flex-1 min-w-0 items-center pl-3 pr-2">
          <NavLink
            to="/main-player/songs/$songId"
            params={{ songId: String(songId) }}
            title={title}
            className={`song-title truncate text-xs outline-offset-1 focus-visible:outline! ${
              isCurrentSong
                ? 'text-accent font-semibold'
                : 'text-font-color-black dark:text-font-color-white font-medium hover:underline'
            }`}
            disabled={isMultipleSelectionEnabled}
          >
            {highlightText ? <HighlightedText text={title} highlight={highlightText} /> : title}
          </NavLink>
        </div>

        {/* Artist column */}
        <div
          className={`song-artists w-[22%] min-w-0 pl-3 pr-2 truncate text-xs ${
            isCurrentSong ? 'text-accent/90' : 'text-font-color-dimmed'
          }`}
        >
          {songArtists}
        </div>

        {/* Album column */}
        <div className="song-album w-[20%] min-w-0 pl-3 pr-2 truncate text-xs text-font-color-dimmed sm:hidden md:hidden lg:flex">
          {album?.name ? (
            <NavLink
              to="/main-player/albums/$albumId"
              params={{ albumId: String(album?.albumId) }}
              disabled={album?.albumId === undefined || isMultipleSelectionEnabled}
              className="truncate hover:underline focus-visible:outline!"
              title={album.name}
            >
              {album.name}
            </NavLink>
          ) : (
            <span className="opacity-60">{t('common.unknownAlbum')}</span>
          )}
        </div>

        {/* Duration column */}
        <div className="song-duration min-w-[4rem] text-right pr-3 font-mono text-xs text-font-color-dimmed opacity-75">
          {minutes}:{seconds}
        </div>

        {/* Actions column */}
        <div className="song-actions min-w-[4.5rem] shrink-0 flex items-center justify-end gap-1 pr-2">
          <Button
            className="m-0! rounded-none! border-0! bg-transparent p-0! text-inherit! outline-offset-1 focus-visible:outline! dark:bg-transparent cursor-pointer"
            iconName="favorite"
            iconClassName={`${
              isAFavorite ? 'material-icons-round' : 'material-icons-round-outlined'
            } ${isBursting ? 'fx-heart-pop' : ''} leading-none! text-base! font-light! ${
              isAFavorite ? 'text-font-color-favorite!' : 'text-font-color-dimmed opacity-60 hover:opacity-100'
            }`}
            tooltipLabel={t(`song.${isAFavorite ? 'likedThisSong' : 'dislikedThisSong'}`)}
            clickHandler={(e) => {
              e.stopPropagation();
              toggleSingleSongFavorite();
            }}
          />
          <HeartBurst isBursting={isBursting} />

          <Button
            className="m-0! rounded-none! border-0! bg-transparent p-0! text-font-color-dimmed opacity-60 hover:opacity-100 outline-offset-1 focus-visible:outline! dark:bg-transparent cursor-pointer"
            iconName="more_horiz"
            iconClassName="text-base leading-none"
            tooltipLabel={t('common.moreOptions')}
            clickHandler={async (e) => {
              e.stopPropagation();
              const pageX = 'pageX' in e ? e.pageX : undefined;
              const pageY = 'pageY' in e ? e.pageY : undefined;
              const items = await getContextMenuItems();
              updateContextMenuData(true, items, pageX, pageY);
            }}
          />
        </div>
      </div>
    );
  })
);

CompactSongRow.displayName = 'CompactSongRow';
export default CompactSongRow;
