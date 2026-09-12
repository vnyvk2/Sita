import { getQueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultArtistCover from '../../assets/images/webp/artist_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { getSelectedIdSet } from '../../contexts/MultipleSelectionContext';
import useHeartBurst from '../../hooks/useHeartBurst';
import Button from '../Button';
import HeartBurst from '../HeartBurst';
import Img from '../Img';
import MultipleSelectionCheckbox from '../MultipleSelectionCheckbox';

interface ArtistProp {
  index: number;
  className?: string;
  artistId: number;
  name: string;
  artworkPaths: ArtworkPaths;
  songIds?: number[];
  songCount?: number;
  onlineArtworkPaths?: {
    picture_small: string;
    picture_medium: string;
  };
  isAFavorite: boolean;
  selectAllHandler?: (_upToId?: number) => void;
  appearFromBottom?: boolean;
}

export const Artist = memo((props: ArtistProp) => {
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.isEnabled && state.multipleSelectionsData.selectionType === 'artist'
  );
  const isAMultipleSelection = useStore(
    store,
    useCallback(
      (state) =>
        state.multipleSelectionsData.isEnabled &&
        state.multipleSelectionsData.selectionType === 'artist' &&
        getSelectedIdSet(state.multipleSelectionsData.multipleSelections).has(props.artistId),
      [props.artistId]
    )
  );

  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    updateContextMenuData,
    createQueue,
    addNewNotifications,
    toggleMultipleSelections,
    updateMultipleSelections
  } = useContext(AppUpdateContext);

  const { appearFromBottom = true } = props;

  const [isAFavorite, setIsAFavorite] = useState(props.isAFavorite);
  const { isBursting, triggerBurst } = useHeartBurst();

  useEffect(() => {
    setIsAFavorite(props.isAFavorite);
  }, [props.isAFavorite]);

  const goToArtistInfoPage = useCallback(
    () =>
      navigate({
        to: '/main-player/artists/$artistId',
        params: { artistId: String(props.artistId) }
      }),
    [navigate, props.artistId]
  );

  const songCount = props.songCount ?? props.songIds?.length ?? 0;

  const resolveSongIds = useCallback(async (): Promise<number[]> => {
    if (props.songIds) return props.songIds;
    return window.api.artistsData.getArtistSongIds(props.artistId);
  }, [props.artistId, props.songIds]);

  const playArtistSongs = useCallback(
    async (isShuffle = false) => {
      const resolvedSongIds = await resolveSongIds();
      return window.api.audioLibraryControls
        .getSongInfo(resolvedSongIds, undefined, undefined, undefined, true)
        .then((songs) => {
          if (Array.isArray(songs))
            return createQueue(
              songs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
              'artist',
              isShuffle,
              props.artistId,
              true,
              props.name
            );
          return undefined;
        });
    },
    [createQueue, props.artistId, props.name, resolveSongIds]
  );

  const playArtistSongsForMultipleSelections = useCallback(
    (isShuffling = false) => {
      const { multipleSelections: artistIds } = store.state.multipleSelectionsData;

      return window.api.artistsData
        .getArtistData(artistIds)
        .then((res) => {
          if (Array.isArray(res.data) && res.data.length > 0) {
            const songIds = res.data
              .map((artist) => artist.songs.map((song) => song.songId))
              .flat();
            return window.api.audioLibraryControls.getSongInfo(songIds);
          }
          return undefined;
        })
        .then((songsData) => {
          if (Array.isArray(songsData) && songsData.length > 0) {
            return createQueue(
              songsData.filter((song) => !song.isBlacklisted).map((song) => song.songId),
              'artist',
              isShuffling,
              props.artistId,
              true,
              t('common.selectedArtists', 'Selected Artists')
            );
          }
          return undefined;
        });
    },
    [createQueue, props.artistId, t]
  );

  const toggleLikeArtist = useCallback(async () => {
    const nextValue = !isAFavorite;
    if (nextValue) {
      triggerBurst();
    }
    setIsAFavorite(nextValue);
    try {
      await window.api.artistsData.toggleLikeArtists([props.artistId], nextValue);
    } catch {
      setIsAFavorite(!nextValue);
    }
  }, [isAFavorite, props.artistId, triggerBurst]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const { multipleSelectionsData } = store.state;
      const isMultipleSelectionsActive =
        multipleSelectionsData.selectionType === 'artist' &&
        multipleSelectionsData.multipleSelections.length !== 1 &&
        isAMultipleSelection;

      const items: ContextMenuItem[] = [
        {
          label: isMultipleSelectionsActive ? t(`artist.playAllSongs`) : t(`common.playAll`),
          iconName: 'play_arrow',
          handlerFunction: () => {
            if (isMultipleSelectionsActive) return playArtistSongsForMultipleSelections();
            return playArtistSongs();
          }
        },
        {
          label: isMultipleSelectionsActive
            ? t(`common.shuffleAndPlayAll`)
            : t(`common.shuffleAndPlay`),
          iconName: 'shuffle',
          handlerFunction: () => {
            if (isMultipleSelectionsActive) return playArtistSongsForMultipleSelections(true);
            return playArtistSongs(true);
          }
        },
        {
          label: isMultipleSelectionsActive ? t(`common.addSongsToQueue`) : t(`common.addToQueue`),
          iconName: 'queue',
          handlerFunction: () => {
            if (isMultipleSelectionsActive) {
              const { multipleSelections: artistIds } = multipleSelectionsData;
              return window.api.artistsData.getArtistData(artistIds).then((artists) => {
                const songIds = artists.data
                  .map((artist) => artist.songs.map((song) => song.songId))
                  .flat();
                const uniqueSongIds = [...new Set(songIds)];
                getQueuesManager().getActiveQueue().addSongIdsToEnd(uniqueSongIds);
                return addNewNotifications([
                  {
                    id: `${uniqueSongIds.length}AddedToQueueFromMultiSelection`,
                    duration: 5000,
                    content: t(`notifications.addedToQueue`, {
                      count: uniqueSongIds.length
                    })
                  }
                ]);
              });
            }
            return resolveSongIds().then((resolvedIds) => {
              getQueuesManager().getActiveQueue().addSongIdsToEnd(resolvedIds);
              return addNewNotifications([
                {
                  id: 'addSongsToQueue',
                  duration: 5000,
                  content: t(`notifications.addedToQueue`, {
                    count: resolvedIds.length
                  })
                }
              ]);
            });
          }
        },
        {
          label: 'Hr',
          isContextMenuItemSeperator: true,
          handlerFunction: () => true,
          isDisabled: isMultipleSelectionsActive
        },
        {
          label: t(
            `artist.${isMultipleSelectionEnabled ? 'toggleLikeArtists' : isAFavorite ? 'dislikeArtist' : 'likeArtist'}`
          ),
          iconName: 'favorite',
          iconClassName: isMultipleSelectionEnabled
            ? 'material-icons-round-outlined mr-4 text-xl'
            : isAFavorite
              ? 'material-icons-round mr-4 text-xl text-font-color-favorite!'
              : 'material-icons-round-outlined mr-4 text-xl',
          handlerFunction: () => {
            if (isMultipleSelectionEnabled) {
              const { multipleSelections: artistIds } = multipleSelectionsData;

              return window.api.artistsData
                .toggleLikeArtists(artistIds)
                .then((res) => {
                  if (res && res.likes.length + res.dislikes.length > 0) {
                    return setIsAFavorite((prevState) => {
                      const isLiked = res.likes.includes(props.artistId);
                      const isDisliked = res.dislikes.includes(props.artistId);

                      return isLiked ? true : isDisliked ? false : prevState;
                    });
                  }
                  return undefined;
                })
                .catch((err) => console.error(err));
            }
            return toggleLikeArtist();
          }
        },
        {
          label: t(`common.info`),
          iconName: 'info',
          iconClassName: 'material-icons-round-outlined',
          handlerFunction: goToArtistInfoPage,
          isDisabled: isMultipleSelectionsActive
        },
        {
          label: t(`common.${isAMultipleSelection ? 'unselect' : 'select'}`),
          iconName: 'checklist',
          handlerFunction: () => {
            if (isMultipleSelectionEnabled) {
              return updateMultipleSelections(
                props.artistId,
                'artist',
                isAMultipleSelection ? 'remove' : 'add'
              );
            }
            return toggleMultipleSelections(!isAMultipleSelection, 'artist', [props.artistId]);
          }
        }
      ];

      const itemData: ContextMenuAdditionalData =
        isMultipleSelectionEnabled &&
        multipleSelectionsData.selectionType === 'artist' &&
        isAMultipleSelection
          ? {
              title: t(`artist.selectedArtistCount`, {
                count: multipleSelectionsData.multipleSelections.length
              }),
              artworkPath: DefaultArtistCover
            }
          : {
              title: props.name,
              artworkPath:
                props?.onlineArtworkPaths?.picture_small || props?.artworkPaths?.optimizedArtworkPath,
              artworkClassName: 'rounded-full!',
              subTitle: t(`common.songWithCount`, {
                count: songCount
              })
            };

      updateContextMenuData(true, items, e.pageX, e.pageY, itemData);
    },
    [
      addNewNotifications,
      goToArtistInfoPage,
      isAFavorite,
      isAMultipleSelection,
      isMultipleSelectionEnabled,
      playArtistSongs,
      playArtistSongsForMultipleSelections,
      props.artistId,
      props?.artworkPaths?.optimizedArtworkPath,
      props.name,
      props?.onlineArtworkPaths?.picture_small,
      resolveSongIds,
      songCount,
      t,
      toggleLikeArtist,
      toggleMultipleSelections,
      updateContextMenuData,
      updateMultipleSelections
    ]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`artist ${appearFromBottom && 'appear-from-bottom'} fx-rise fx-spotlight group hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50 mr-2 flex h-44 w-40 cursor-pointer flex-col justify-between overflow-hidden rounded-lg p-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 ${
        props.className ?? ''
      } ${isAMultipleSelection ? 'bg-background-color-3! dark:bg-dark-background-color-3!' : ''}`}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        e.preventDefault();
        if (e.getModifierState('Shift') === true && props.selectAllHandler)
          props.selectAllHandler(props.artistId);
        else if (e.getModifierState('Control') === true && !isMultipleSelectionEnabled)
          toggleMultipleSelections(!isAMultipleSelection, 'artist', [props.artistId]);
        else if (isMultipleSelectionEnabled)
          updateMultipleSelections(
            props.artistId,
            'artist',
            isAMultipleSelection ? 'remove' : 'add'
          );
        else goToArtistInfoPage();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isMultipleSelectionEnabled)
            updateMultipleSelections(
              props.artistId,
              'artist',
              isAMultipleSelection ? 'remove' : 'add'
            );
          else goToArtistInfoPage();
        }
      }}
    >
      <div className="artist-img-container relative flex h-3/4 items-center justify-center">
        {isMultipleSelectionEnabled ? (
          <MultipleSelectionCheckbox
            id={props.artistId}
            selectionType="artist"
            className="absolute right-3 bottom-3 z-10"
          />
        ) : (
          <>
            <div className="absolute top-[5%] right-[5%] z-2 flex items-center justify-center">
              <Button
                className={`bg-background-color-1/80 dark:bg-dark-background-color-1/80 m-0! rounded-full! border-0! p-1.5! shadow-md outline-offset-1 backdrop-blur-sm transition-opacity ${
                  isAFavorite
                    ? 'opacity-100'
                    : 'opacity-0 group-focus-within:opacity-75 group-hover:opacity-75 hover:opacity-100! focus-visible:opacity-100!'
                }`}
                iconName="favorite"
                iconClassName={`${
                  isAFavorite
                    ? 'material-icons-round text-font-color-favorite!'
                    : 'material-icons-round-outlined text-font-color-white'
                } ${isBursting ? 'fx-heart-pop' : ''} text-xl! leading-none!`}
                tooltipLabel={t(`common.${isAFavorite ? 'dislike' : 'like'}`)}
                clickHandler={(e) => {
                  e.stopPropagation();
                  toggleLikeArtist();
                }}
              />
              <HeartBurst isBursting={isBursting} />
            </div>
            <Button
              className="text-font-color-white! absolute right-[5%] bottom-[5%] z-1 m-0! rounded-none! border-0! bg-transparent p-0! opacity-0 outline-offset-1 transition-opacity group-focus-within:opacity-75 group-hover:opacity-75 hover:bg-transparent hover:opacity-100! focus-visible:opacity-100! focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
              iconName="play_circle"
              iconClassName="text-5xl! leading-none!"
              clickHandler={(e) => {
                e.stopPropagation();
                playArtistSongs();
              }}
            />
          </>
        )}
        <div className="artist-cover-container relative h-full overflow-hidden rounded-full before:invisible before:absolute before:h-full before:w-full before:bg-linear-to-b before:from-[hsla(0,0%,0%,0%)] before:to-[hsla(0,0%,0%,50%)] before:opacity-0 before:transition-[visibility,opacity] before:duration-300 before:content-[''] group-focus-within:before:visible group-focus-within:before:opacity-100 group-hover:before:visible group-hover:before:opacity-100">
          <Img
            thumbnail
            src={props?.onlineArtworkPaths?.picture_medium}
            fallbackSrc={props.artworkPaths.artworkPath}
            alt="Default song cover"
            className="aspect-square h-full rounded-full object-cover transition-transform duration-300 ease-out group-focus-within:scale-[1.04] group-hover:scale-[1.04]"
            enableImgFadeIns={false}
          />
        </div>
      </div>
      <div className="artist-info-container relative max-h-1/5">
        <Button
          className={`name-container !m-0 !block !w-full !max-w-full truncate !rounded-none !border-0 bg-transparent !p-0 text-center !text-lg outline-offset-1 hover:bg-transparent hover:underline focus-visible:!outline lg:text-base dark:bg-transparent dark:hover:bg-transparent ${
            isAMultipleSelection && 'text-font-color-black! dark:text-font-color-black!'
          }`}
          label={props.name === '' ? 'Unknown Artist' : props.name}
          clickHandler={goToArtistInfoPage}
        />
      </div>
    </div>
  );
});

Artist.displayName = 'Artist';
