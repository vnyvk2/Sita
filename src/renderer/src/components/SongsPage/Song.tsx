/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { type DraggableProvided } from '@hello-pangea/dnd';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  lazy,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef
} from 'react';
import { useTranslation } from 'react-i18next';

import { appPreferences } from '../../../../../package.json';
import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useQueueOperations } from '../../hooks/useQueueOperations';
import { songQuery } from '../../queries/songs';
import { queryClient } from '../../queryClient';
import { store } from '../../store/store';
import Button from '../Button';
import Img from '../Img';
import MultipleSelectionCheckbox from '../MultipleSelectionCheckbox';
import NavLink from '../NavLink';
import HighlightedText from '../SearchPage/HighlightedText';
import SongArtist from './SongArtist';

const AddSongsToPlaylistsPrompt = lazy(() => import('./AddSongsToPlaylistsPrompt'));
const BlacklistSongConfrimPrompt = lazy(() => import('./BlacklistSongConfirmPrompt'));
const DeleteSongsFromSystemConfrimPrompt = lazy(
  () => import('./DeleteSongsFromSystemConfrimPrompt')
);

interface SongProp {
  songId: number;
  artworkPaths: ArtworkPaths;
  title: string;
  artists?: { name: string; artistId: number }[];
  album?: { name: string; albumId: number };
  duration: number;
  year?: number;
  path: string;
  isBlacklisted?: boolean;
  additionalContextMenuItems?: ContextMenuItem[];
  index: number;
  trackNo?: number | string;
  isIndexingSongs: boolean;
  isAFavorite: boolean;
  className?: string;
  onPlayClick?: (currSongId: number) => void;
  style?: CSSProperties;
  isDraggable?: boolean;
  provided?: DraggableProvided;
  selectAllHandler?: (_upToId?: number) => void;
  /** When provided, highlights the matching portion of the title in search results */
  highlightText?: string;
}

const Song = memo(
  forwardRef((props: SongProp, ref: ForwardedRef<HTMLDivElement>) => {
    const {
      index,
      songId,
      duration,
      artworkPaths,
      isIndexingSongs,
      isBlacklisted = false,
      path,
      title,
      additionalContextMenuItems,
      artists,
      album,
      style,
      year,
      trackNo,
      selectAllHandler,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provided = {} as any,
      onPlayClick,
      highlightText
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
    const bodyBackgroundImage = useStore(store, (state) => Boolean(state.bodyBackgroundImage));
    const isMultipleSelectionEnabled = useStore(
      store,
      (state) =>
        state.multipleSelectionsData.isEnabled &&
        state.multipleSelectionsData.selectionType === 'songs'
    );
    const isAMultipleSelection = useStore(
      store,
      (state) =>
        state.multipleSelectionsData.isEnabled &&
        state.multipleSelectionsData.selectionType === 'songs' &&
        state.multipleSelectionsData.multipleSelections.includes(songId)
    );
    const showTrackNumberAsSongIndex = useStore(store, (state) =>
      Boolean(state.localStorage?.preferences?.showTrackNumberAsSongIndex)
    );
    const doNotShowBlacklistSongConfirm = useStore(store, (state) =>
      Boolean(state.localStorage?.preferences?.doNotShowBlacklistSongConfirm)
    );

    const {
      playSong,
      updateContextMenuData,
      changePromptMenuData,
      addNewNotifications,
      toggleIsFavorite,
      toggleMultipleSelections,
      updateMultipleSelections,
      createQueue,
      openAutoTagDialog
    } = useContext(AppUpdateContext);
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Queue operations for context menu actions
    const { addToNext, addToEnd } = useQueueOperations();

    const clickTimeoutRef = useRef<NodeJS.Timeout>(undefined);
    // Monotonic counter to prevent race conditions on rapid successive favorite toggles
    const likeMutationSeqRef = useRef(0);

    // Single source of truth: derived strictly from player state or cached song props,
    // avoiding row-local useState that could carry over during Virtuoso row recycling.
    const isAFavorite =
      isCurrentSong && currentSongFavorite !== undefined ? currentSongFavorite : props.isAFavorite;

    const handlePlayBtnClick = useCallback(() => {
      if (onPlayClick) return onPlayClick(songId);
      return playSong(songId);
    }, [onPlayClick, playSong, songId]);

    // Unified single-song favorite mutation handler shared by direct button and context menu
    const toggleSingleSongFavorite = useCallback(() => {
      const nextFav = !isAFavorite;
      const currentSeq = ++likeMutationSeqRef.current;

      // Optimistically update React Query cache so the source of truth is immediately updated
      queryClient.setQueriesData<PaginatedResult<SongData, SongSortTypes>>(
        { queryKey: songQuery.all._def },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((s) => (s.songId === songId ? { ...s, isAFavorite: nextFav } : s))
          };
        }
      );

      if (isCurrentSong) {
        toggleIsFavorite(nextFav, true);
      }

      window.api.playerControls
        .toggleLikeSongs([songId], nextFav)
        .then((res) => {
          // If a newer click occurred while this request was in flight, do not overwrite with stale rollback
          if (likeMutationSeqRef.current !== currentSeq) return;

          if (res && res.likes.length + res.dislikes.length === 0) {
            // Revert cache if DB rejected
            queryClient.setQueriesData<PaginatedResult<SongData, SongSortTypes>>(
              { queryKey: songQuery.all._def },
              (old) => {
                if (!old?.data) return old;
                return {
                  ...old,
                  data: old.data.map((s) =>
                    s.songId === songId ? { ...s, isAFavorite: !nextFav } : s
                  )
                };
              }
            );
            if (isCurrentSong) {
              toggleIsFavorite(!nextFav, true);
            }
          }
        })
        .catch((err) => {
          // If a newer click occurred while this request was in flight, ignore failure of superseded mutation
          if (likeMutationSeqRef.current !== currentSeq) return;

          console.error(err);
          // Revert cache on error
          queryClient.setQueriesData<PaginatedResult<SongData, SongSortTypes>>(
            { queryKey: songQuery.all._def },
            (old) => {
              if (!old?.data) return old;
              return {
                ...old,
                data: old.data.map((s) =>
                  s.songId === songId ? { ...s, isAFavorite: !nextFav } : s
                )
              };
            }
          );
          if (isCurrentSong) {
            toggleIsFavorite(!nextFav, true);
          }
          addNewNotifications([
            {
              id: `toggleLikeError-${songId}`,
              content: t('song.toggleLikeFailed'),
              iconName: 'error',
              duration: 5000
            }
          ]);
        });
    }, [addNewNotifications, isAFavorite, isCurrentSong, songId, t, toggleIsFavorite]);

    const { minutes, seconds } = useMemo(() => {
      const addZero = (num: number) => {
        if (num < 10) return `0${num}`;
        return num.toString();
      };

      const min = Math.floor((duration || 0) / 60);
      const sec = Math.floor((duration || 0) % 60);

      return {
        minutes: Number.isNaN(min) ? undefined : addZero(min),
        seconds: Number.isNaN(sec) ? undefined : addZero(sec)
      };
    }, [duration]);

    const songArtists = useMemo(() => {
      if (Array.isArray(artists) && artists.length > 0) {
        return artists
          .map((artist, i) => {
            const arr = [
              <SongArtist
                key={artist.artistId}
                artistId={artist.artistId}
                name={artist.name}
                className={`${(isCurrentSong || isAMultipleSelection) && 'dark:text-font-color-black!'}`}
              />
            ];

            if ((artists?.length ?? 1) - 1 !== i) {
              arr.push(
                <span key={`comma-${artist.artistId}-${i}`} className="mr-1">
                  ,
                </span>
              );
            }

            return arr;
          })
          .flat();
      }
      return <span className="text-xs font-normal">{t('common.unknownArtist')}</span>;
    }, [artists, isCurrentSong, isAMultipleSelection, t]);

    const goToSongInfoPage = useCallback(
      () => navigate({ to: '/main-player/songs/$songId', params: { songId: String(songId) } }),
      [navigate, songId]
    );

    // Context menu construction is called on-demand only during `onContextMenu`.
    // We intentionally inspect `store.state` at invocation time to avoid subscribing
    // all 25+ mounted rows to the whole multipleSelections array.
    const getContextMenuItems = useCallback((): ContextMenuItem[] => {
      const state = store.state;
      const currentSelections = state.multipleSelectionsData;
      const isMultiSelectionActive =
        currentSelections.isEnabled &&
        currentSelections.selectionType === 'songs' &&
        currentSelections.multipleSelections.length !== 1 &&
        isAMultipleSelection;

      const songIds = currentSelections.multipleSelections;

      const items: ContextMenuItem[] = [
        {
          label: 'Hr',
          isContextMenuItemSeperator: true,
          handlerFunction: () => true,
          isDisabled: additionalContextMenuItems === undefined
        },
        {
          label: t('common.play'),
          handlerFunction: () => {
            handlePlayBtnClick();
            toggleMultipleSelections(false);
          },
          iconName: 'play_arrow',
          isDisabled: isMultiSelectionActive
        },
        {
          label: t('common.createAQueue'),
          handlerFunction: () => {
            createQueue(songIds, 'songs', false, undefined, true);
            toggleMultipleSelections(false);
          },
          iconName: 'queue_music',
          isDisabled: !isMultiSelectionActive
        },
        {
          label: t(`common.${isMultiSelectionActive ? 'playNextAll' : 'playNext'}`),
          iconName: 'shortcut',
          handlerFunction: () => {
            if (isMultiSelectionActive) {
              addToNext(songIds);
              addNewNotifications([
                {
                  id: `${title}PlayNext`,
                  content: t('notifications.playingNextSongsWithCount', {
                    count: songIds.length
                  }),
                  iconName: 'shortcut'
                }
              ]);
            } else {
              addToNext([songId]);
              addNewNotifications([
                {
                  id: `${title}PlayNext`,
                  content: t('notifications.playingNext', { title }),
                  iconName: 'shortcut'
                }
              ]);
            }
            toggleMultipleSelections(false);
          }
        },
        {
          label: t('common.addToQueue'),
          iconName: 'queue',
          handlerFunction: () => {
            if (isMultiSelectionActive) {
              addToEnd(songIds);
              addNewNotifications([
                {
                  id: `${songIds.length}AddedToQueueFromMultiSelection`,
                  content: t('notifications.addedToQueue', {
                    count: songIds.length
                  }),
                  iconName: 'add'
                }
              ]);
            } else {
              addToEnd([songId]);
              addNewNotifications([
                {
                  id: `${title}AddedToQueue`,
                  content: t('notifications.addedToQueue', {
                    count: 1
                  }),
                  icon: (
                    <Img
                      src={artworkPaths?.optimizedArtworkPath || DefaultSongCover}
                      loading="lazy"
                      alt="Song Artwork"
                    />
                  )
                }
              ]);
            }
            toggleMultipleSelections(false);
          }
        },
        {
          label: isMultiSelectionActive
            ? t('song.toggleLikeSongs')
            : t(`song.${isAFavorite ? 'unlikeSong' : 'likeSong'}`),
          iconName: `favorite`,
          iconClassName: isMultiSelectionActive
            ? 'material-icons-round-outlined mr-4 text-xl'
            : isAFavorite
              ? 'material-icons-round mr-4 text-xl'
              : 'material-icons-round-outlined mr-4 text-xl',
          handlerFunction: () => {
            if (isMultiSelectionActive) {
              const targetIds = [...songIds];
              window.api.playerControls
                .toggleLikeSongs(targetIds)
                .then((res) => {
                  if (res && (res.likes.length > 0 || res.dislikes.length > 0)) {
                    const likedSet = new Set(res.likes);
                    const dislikedSet = new Set(res.dislikes);
                    queryClient.setQueriesData<PaginatedResult<SongData, SongSortTypes>>(
                      { queryKey: songQuery.all._def },
                      (old) => {
                        if (!old?.data) return old;
                        return {
                          ...old,
                          data: old.data.map((s) => {
                            if (likedSet.has(s.songId)) return { ...s, isAFavorite: true };
                            if (dislikedSet.has(s.songId)) return { ...s, isAFavorite: false };
                            return s;
                          })
                        };
                      }
                    );
                    if (isCurrentSong) {
                      if (res.likes.includes(songId)) toggleIsFavorite(true, true);
                      else if (res.dislikes.includes(songId)) toggleIsFavorite(false, true);
                    }
                  }
                })
                .catch((err) => {
                  console.error(err);
                  addNewNotifications([
                    {
                      id: `toggleLikeError-multi`,
                      content: t('song.toggleLikeFailed'),
                      iconName: 'error',
                      duration: 5000
                    }
                  ]);
                });
            } else {
              toggleSingleSongFavorite();
            }
            toggleMultipleSelections(false);
          }
        },
        {
          label: t('song.addToPlaylists'),
          iconName: 'playlist_add',
          handlerFunction: () => {
            changePromptMenuData(
              true,
              <AddSongsToPlaylistsPrompt
                songIds={isAMultipleSelection ? songIds : [songId]}
                title={title}
              />
            );
            toggleMultipleSelections(false);
          }
        },
        {
          label: t(`common.${isAMultipleSelection ? 'unselect' : 'select'}`),
          iconName: 'checklist',
          handlerFunction: () => {
            if (isMultipleSelectionEnabled) {
              updateMultipleSelections(songId, 'songs', isAMultipleSelection ? 'remove' : 'add');
            } else toggleMultipleSelections(!isAMultipleSelection, 'songs', [songId]);
          }
        },
        {
          label: 'Hr',
          isContextMenuItemSeperator: true,
          handlerFunction: () => true,
          isDisabled: isMultiSelectionActive
        },
        {
          label: t('song.showInFileExplorer'),
          class: 'reveal-file-explorer',
          iconName: 'folder_open',
          handlerFunction: () => window.api.songUpdates.revealSongInFileExplorer(songId),
          isDisabled: isMultiSelectionActive
        },
        {
          label: t('common.info'),
          class: 'info',
          iconName: 'info',
          iconClassName: 'material-icons-round-outlined',
          handlerFunction: goToSongInfoPage,
          isDisabled: isMultiSelectionActive
        },
        {
          label: t('song.goToAlbum'),
          iconName: 'album',
          handlerFunction: () =>
            album &&
            navigate({
              to: '/main-player/albums/$albumId',
              params: { albumId: String(album.albumId) }
            }),
          isDisabled: !album
        },
        {
          label: t('song.editSongTags'),
          class: 'edit',
          iconName: 'edit',
          handlerFunction: () =>
            navigate({
              to: '/main-player/songs/$songId/edit',
              params: { songId: String(songId) }
            }),
          isDisabled: isMultiSelectionActive
        },
        {
          label: 'Auto Tag Track',
          class: 'auto-tag-track',
          iconName: 'audiotrack',
          handlerFunction: () => {
            if (openAutoTagDialog) {
              openAutoTagDialog(
                [{ songId, title, artist: artists?.[0]?.name, album: album?.name, path }],
                title,
                artists?.[0]?.name,
                'track'
              );
            }
          }
        },
        {
          label: 'Auto Tag Album',
          class: 'auto-tag-album',
          iconName: 'album',
          handlerFunction: () => {
            if (openAutoTagDialog) {
              openAutoTagDialog(
                [{ songId, title, artist: artists?.[0]?.name, album: album?.name, path }],
                album?.name ?? title,
                artists?.[0]?.name,
                'album'
              );
            }
          }
        },
        {
          label: t('song.reparseSong'),
          class: 'sync',
          iconName: 'sync',
          handlerFunction: () => window.api.songUpdates.reParseSong(path),
          isDisabled: isMultiSelectionActive
        },
        {
          label: 'Hr',
          isContextMenuItemSeperator: true,
          handlerFunction: () => true,
          isDisabled: isMultiSelectionActive
        },
        {
          label: t(`song.${isBlacklisted ? 'deblacklist' : 'blacklistSong'}`, {
            count: 1
          }),
          iconName: isBlacklisted ? 'settings_backup_restore' : 'block',
          handlerFunction: () => {
            if (isBlacklisted)
              window.api.audioLibraryControls
                .restoreBlacklistedSongs([songId])
                .catch((err) => console.error(err));
            else if (doNotShowBlacklistSongConfirm)
              window.api.audioLibraryControls
                .blacklistSongs([songId])
                .then(() =>
                  addNewNotifications([
                    {
                      id: `${title}Blacklisted`,
                      duration: 5000,
                      content: t('notifications.songBlacklisted', { title }),
                      iconName: 'block'
                    }
                  ])
                )
                .catch((err) => console.error(err));
            else
              changePromptMenuData(
                true,
                <BlacklistSongConfrimPrompt title={title} songIds={[songId]} />
              );
            return toggleMultipleSelections(false);
          },
          isDisabled: isMultiSelectionActive
        },
        {
          label: t('song.delete'),
          iconName: 'delete',
          handlerFunction: () => {
            changePromptMenuData(
              true,
              <DeleteSongsFromSystemConfrimPrompt
                songIds={isMultiSelectionActive ? songIds : [songId]}
              />
            );
            toggleMultipleSelections(false);
          }
        }
      ];

      if (additionalContextMenuItems) items.unshift(...additionalContextMenuItems);
      return items;
    }, [
      isAMultipleSelection,
      additionalContextMenuItems,
      t,
      handlePlayBtnClick,
      toggleMultipleSelections,
      createQueue,
      addToNext,
      title,
      addNewNotifications,
      songId,
      addToEnd,
      artworkPaths,
      isAFavorite,
      isCurrentSong,
      toggleIsFavorite,
      changePromptMenuData,
      isMultipleSelectionEnabled,
      updateMultipleSelections,
      goToSongInfoPage,
      album,
      navigate,
      openAutoTagDialog,
      artists,
      path,
      isBlacklisted,
      doNotShowBlacklistSongConfirm,
      toggleSingleSongFavorite
    ]);

    return (
      <div
        style={style}
        data-index={index}
        {...provided?.draggableProps}
        {...provided?.dragHandleProps}
        className={`${songId} group relative mr-4 mb-2 flex h-13 w-[98%] overflow-hidden rounded-lg p-[0.2rem] px-2 -outline-offset-2 transition-[background,color,opacity] ease-in-out focus-visible:outline! ${
          isCurrentSong || isAMultipleSelection
            ? bodyBackgroundImage
              ? `bg-background-color-3/70 text-font-color-black dark:bg-dark-background-color-3/70 shadow-lg backdrop-blur-md`
              : 'bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 shadow-lg'
            : bodyBackgroundImage
              ? `bg-background-color-2/70 hover:bg-background-color-2! dark:bg-dark-background-color-2/70 dark:hover:bg-dark-background-color-2! backdrop-blur-md`
              : `odd:bg-background-color-2/70 hover:!bg-background-color-2 dark:odd:bg-dark-background-color-2/50 dark:hover:!bg-dark-background-color-2 ${
                  (index + 1) % 2 === 1
                    ? 'bg-background-color-2/70! dark:bg-dark-background-color-2/50!'
                    : 'bg-background-color-1! dark:bg-dark-background-color-1!'
                }`
        } ${!isAMultipleSelection && isBlacklisted && 'opacity-30!'}`}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const state = store.state;
          const currentSelections = state.multipleSelectionsData;
          const contextMenuItemData: ContextMenuAdditionalData =
            isMultipleSelectionEnabled &&
            currentSelections.selectionType === 'songs' &&
            isAMultipleSelection
              ? {
                  title: t('song.selectedSongCount', {
                    count: currentSelections.multipleSelections.length
                  }),
                  artworkPath: DefaultSongCover
                }
              : {
                  title: title || t('common.unknownTitle'),
                  subTitle:
                    artists?.map((artist) => artist.name).join(', ') ?? t('common.unknownArtist'),
                  artworkPath: artworkPaths?.optimizedArtworkPath || DefaultSongCover
                };
          updateContextMenuData(true, getContextMenuItems(), e.pageX, e.pageY, contextMenuItemData);
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
        <div
          className={`song-cover-and-play-btn-container flex w-[clamp(6rem,15%,9rem)] shrink-0 items-center justify-center ${
            !isIndexingSongs && !showTrackNumberAsSongIndex && 'w-[clamp(4rem,10%,6rem)]!'
          }`}
        >
          {isMultipleSelectionEnabled ? (
            <div className="bg-background-color-1 text-font-color-highlight dark:bg-dark-background-color-1 dark:text-dark-background-color-3 relative mx-1 flex h-fit items-center rounded-lg p-1">
              <MultipleSelectionCheckbox id={songId} selectionType="songs" />
            </div>
          ) : isBlacklisted ? (
            <div
              className={`relative mr-2 flex h-full items-center justify-center ${
                index < 10
                  ? 'min-w-7'
                  : index < 100
                    ? 'min-w-10'
                    : index < 1000
                      ? 'min-w-12'
                      : 'min-w-15'
              }`}
              title={t('notifications.songBlacklisted', { title })}
            >
              <span
                className={`material-icons-round text-font-color-black dark:text-font-color-white mx-2 text-2xl ${
                  isCurrentSong && 'dark:text-font-color-black!'
                } `}
              >
                block
              </span>
            </div>
          ) : isIndexingSongs || showTrackNumberAsSongIndex ? (
            <div
              className={`bg-background-color-1 text-font-color-highlight group-even:bg-background-color-2/75 group-hover:bg-background-color-1 dark:bg-dark-background-color-1 dark:text-dark-background-color-3 dark:group-even:bg-dark-background-color-2/50 dark:group-hover:bg-dark-background-color-1 relative mx-1 flex items-center justify-center rounded-2xl px-3 py-1 text-center ${
                index < 10
                  ? 'min-w-7'
                  : index < 100
                    ? 'min-w-10'
                    : index < 1000
                      ? 'min-w-12'
                      : 'min-w-15'
              }`}
            >
              <span className="min-w-2 text-sm leading-tight font-medium">
                {trackNo ?? (isIndexingSongs ? index + 1 : '--')}
              </span>
            </div>
          ) : (
            ''
          )}
          <div
            className={`song-cover-container relative mr-4 ml-2 flex h-[90%] min-w-12 flex-row items-center justify-center overflow-hidden rounded-md ${
              (isIndexingSongs || isMultipleSelectionEnabled || isBlacklisted) && 'sm:hidden'
            }`}
          >
            <div className="play-btn-container absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
              <Button
                className="m-0! rounded-none! border-0! bg-transparent p-0! outline-offset-1 transition-colors! hover:bg-transparent focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
                iconClassName={`text-3xl! text-font-color-white/0 leading-none! ${
                  isCurrentSong && 'text-font-color-white/100'
                } group-focus-within:text-font-color-white/100 group-hover:text-font-color-white/100 ${
                  isSongPlaying && 'text-font-color-white/75!'
                }`}
                clickHandler={handlePlayBtnClick}
                iconName={isSongPlaying ? 'pause_circle' : 'play_circle'}
              />
            </div>
            <Img
              src={artworkPaths?.optimizedArtworkPath || DefaultSongCover}
              loading="eager"
              alt="Song cover"
              className={`aspect-square max-h-full min-w-full object-contain py-[0.1rem] transition-[filter]! duration-300 group-focus-within:brightness-50 group-hover:brightness-50 ${
                isSongPlaying ? 'brightness-50' : ''
              }`}
              enableImgFadeIns={false}
            />
          </div>
        </div>
        <div
          className={`song-info-container text-font-color-black dark:text-font-color-white grid grow grid-cols-[35%_2fr_1fr_minmax(4rem,5rem)_minmax(4.5rem,6.5rem)] items-center gap-3 sm:grid-cols-[45%_1fr_minmax(4.5rem,6rem)] sm:gap-2 lg:grid-cols-[40%_1fr_minmax(4rem,5rem)_minmax(4.5rem,6.5rem)] lg:gap-0! ${
            (isCurrentSong || isAMultipleSelection) && 'dark:text-font-color-black!'
          }`}
        >
          <NavLink
            to="/main-player/songs/$songId"
            params={{ songId: String(songId) }}
            title={title}
            className="song-title truncate text-base font-normal outline-offset-1 transition-none focus-visible:outline!"
            disabled={isMultipleSelectionEnabled}
          >
            {window.api.properties.isInDevelopment && `(${songId})`}{' '}
            {highlightText ? <HighlightedText text={title} highlight={highlightText} /> : title}
          </NavLink>
          <div className="song-artists w-full truncate text-xs font-normal transition-none">
            {songArtists}
          </div>
          <div className="song-album w-full truncate text-xs transition-none sm:hidden md:hidden lg:hidden">
            {album?.name ? (
              <NavLink
                to="/main-player/albums/$albumId"
                params={{ albumId: String(album?.albumId) }}
                disabled={album?.albumId === undefined || isMultipleSelectionEnabled}
                className="cursor-pointer -outline-offset-1 hover:underline focus-visible:outline!"
                title={album.name}
              >
                {album.name}
              </NavLink>
            ) : (
              t('common.unknownAlbum')
            )}
          </div>
          <div className="song-year flex items-center justify-center text-center text-xs transition-none sm:hidden">
            {window.api.properties.isInDevelopment && appPreferences.showSongIdInsteadOfSongYear
              ? songId
              : (year ?? '----')}
          </div>
          <div className="song-duration flex w-full! items-center justify-between pr-4 pl-2 text-center transition-none sm:pr-1">
            <Button
              className="mt-1 mr-0! rounded-none! border-0! bg-transparent p-0! text-inherit! outline-offset-1 focus-visible:outline! dark:bg-transparent"
              iconName="favorite"
              iconClassName={`${
                isAFavorite ? 'material-icons-round' : 'material-icons-round-outlined'
              } leading-none! text-xl! font-light! md:hidden ${
                isAFavorite
                  ? isCurrentSong || isAMultipleSelection
                    ? 'text-font-color-black! dark:text-font-color-black!'
                    : 'text-font-color-highlight! dark:text-dark-background-color-3!'
                  : isCurrentSong || isAMultipleSelection
                    ? 'text-font-color-black! dark:text-font-color-black!'
                    : 'text-font-color-highlight! dark:text-dark-background-color-3!'
              }`}
              tooltipLabel={t(`song.${isAFavorite ? 'likedThisSong' : 'dislikedThisSong'}`)}
              clickHandler={(e) => {
                e.stopPropagation();
                toggleSingleSongFavorite();
              }}
            />
            <span className="">
              {minutes ?? '--'}:{seconds ?? '--'}
            </span>
          </div>
        </div>
      </div>
    );
  })
);

Song.displayName = 'Song';
export default Song;
