import { getQueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultGenreCover from '../../assets/images/webp/genre-cover-default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { getSelectedIdSet } from '../../contexts/MultipleSelectionContext';
import Button from '../Button';
import Img from '../Img';
import MultipleSelectionCheckbox from '../MultipleSelectionCheckbox';
import NavLink from '../NavLink';

interface GenreProp {
  index: number;
  genreId: number;
  title: string;
  songIds?: number[];
  songCount?: number;
  artworkPaths: ArtworkPaths;
  paletteData?: PaletteData;
  className?: string;
  selectAllHandler?: (_upToId?: number) => void;
}

const Genre = memo((props: GenreProp) => {
  const { genreId, songIds, title, artworkPaths, paletteData, className, selectAllHandler } = props;
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.isEnabled && state.multipleSelectionsData.selectionType === 'genre'
  );
  const isAMultipleSelection = useStore(
    store,
    useCallback(
      (state) =>
        state.multipleSelectionsData.isEnabled &&
        state.multipleSelectionsData.selectionType === 'genre' &&
        getSelectedIdSet(state.multipleSelectionsData.multipleSelections).has(genreId),
      [genreId]
    )
  );

  const {
    createQueue,
    addNewNotifications,
    updateContextMenuData,
    toggleMultipleSelections,
    updateMultipleSelections
  } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goToGenreInfoPage = useCallback(
    () =>
      navigate({
        to: '/main-player/genres/$genreId',
        params: { genreId: String(genreId) }
      }),
    [genreId, navigate]
  );

  const backgroundColor = useMemo(() => {
    const swatch = paletteData?.DarkVibrant;
    if (swatch?.hsl) {
      const { hsl } = swatch;

      return `hsl(${hsl[0] * 360} ${hsl[1] * 100}% ${hsl[2] * 100}%)`;
    }
    return undefined;
  }, [paletteData?.DarkVibrant]);

  const resolvedSongCount = props.songCount ?? songIds?.length ?? 0;

  const resolveSongIds = useCallback(async (): Promise<number[]> => {
    if (songIds) return songIds;
    return window.api.genresData.getGenreSongIds(genreId);
  }, [genreId, songIds]);

  const playGenreSongs = useCallback(
    async (isShuffle = false) => {
      const resolvedSongIds = await resolveSongIds();
      return window.api.audioLibraryControls
        .getSongInfo(resolvedSongIds, undefined, undefined, undefined, true)
        .then((songs) => {
          if (Array.isArray(songs))
            return createQueue(
              songs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
              'genre',
              isShuffle,
              genreId,
              true,
              title
            );
          return undefined;
        });
    },
    [createQueue, genreId, resolveSongIds, title]
  );

  const playGenreSongsForMultipleSelections = useCallback(
    (isShuffle = false) => {
      const { multipleSelections: genreIds } = store.state.multipleSelectionsData;
      window.api.genresData
        .getGenresData(genreIds)
        .then((genres) => {
          if (Array.isArray(genres.data) && genres.data.length > 0) {
            const genreSongIds = genres.data
              .map((genre) => genre.songs.map((song) => song.songId))
              .flat();

            return window.api.audioLibraryControls.getSongInfo(
              genreSongIds,
              undefined,
              undefined,
              undefined,
              true
            );
          }
          return undefined;
        })
        .then((songs) => {
          if (Array.isArray(songs))
            return createQueue(
              songs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
              'songs',
              isShuffle,
              undefined,
              true
            );
          return undefined;
        })
        .catch((err) => console.error(err));
    },
    [createQueue]
  );

  const addToQueueForMultipleSelections = useCallback(() => {
    const { multipleSelections: genreIds } = store.state.multipleSelectionsData;
    window.api.genresData
      .getGenresData(genreIds)
      .then((genres) => {
        if (Array.isArray(genres.data) && genres.data.length > 0) {
          const genreSongIds = genres.data
            .map((genre) => genre.songs.map((song) => song.songId))
            .flat();

          return window.api.audioLibraryControls.getSongInfo(
            genreSongIds,
            undefined,
            undefined,
            undefined,
            true
          );
        }
        return undefined;
      })
      .then((songs) => {
        if (Array.isArray(songs)) {
          const songIdsToAdd = songs
            .filter((song) => !song.isBlacklisted)
            .map((song) => song.songId);
          getQueuesManager().getActiveQueue().addSongIdsToEnd(songIdsToAdd);
          addNewNotifications([
            {
              id: 'newSongsToQueue',
              duration: 5000,
              content: t(`notifications.addedToQueue`, {
                count: songs.length
              })
            }
          ]);
        }
        return undefined;
      })
      .catch((err) => console.error(err));
  }, [addNewNotifications, t]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const { multipleSelectionsData } = store.state;
      const isMultipleSelectionsActive =
        multipleSelectionsData.selectionType === 'genre' &&
        multipleSelectionsData.multipleSelections.length !== 1 &&
        isAMultipleSelection;

      const items: ContextMenuItem[] = [
        {
          label: t(`common.${isMultipleSelectionsActive ? 'playAll' : 'play'}`),
          iconName: 'play_arrow',
          handlerFunction: () => {
            if (isMultipleSelectionsActive) playGenreSongsForMultipleSelections();
            else playGenreSongs();
            toggleMultipleSelections(false);
          }
        },
        {
          label: isMultipleSelectionsActive
            ? t(`common.shuffleAndPlayAll`)
            : t(`common.shuffleAndPlay`),
          iconName: 'shuffle',
          handlerFunction: () => {
            if (isMultipleSelectionsActive) playGenreSongsForMultipleSelections(true);
            else playGenreSongs(true);
            toggleMultipleSelections(false);
          }
        },
        {
          label: t(`common.addToQueue`),
          iconName: 'queue',
          handlerFunction: () => {
            if (isMultipleSelectionsActive) addToQueueForMultipleSelections();
            else {
              return resolveSongIds().then((resolvedSongIds) => {
                getQueuesManager().getActiveQueue().addSongIdsToEnd(resolvedSongIds);
                addNewNotifications([
                  {
                    id: 'newSongsToQueue',
                    duration: 5000,
                    content: t(`notifications.addedToQueue`, {
                      count: resolvedSongIds.length
                    })
                  }
                ]);
                toggleMultipleSelections(false);
                return undefined;
              });
            }
            toggleMultipleSelections(false);
            return undefined;
          }
        },
        {
          label: 'Hr',
          isContextMenuItemSeperator: true,
          handlerFunction: () => true
        },
        {
          label: t(`common.${isAMultipleSelection ? 'unselect' : 'select'}`),
          iconName: 'checklist',
          handlerFunction: () => {
            if (isMultipleSelectionEnabled) {
              return updateMultipleSelections(
                genreId,
                'genre',
                isAMultipleSelection ? 'remove' : 'add'
              );
            }
            return toggleMultipleSelections(!isAMultipleSelection, 'genre', [genreId]);
          }
        },
        {
          label: t(`common.info`),
          iconName: 'info',
          iconClassName: 'material-icons-round-outlined',
          handlerFunction: goToGenreInfoPage,
          isDisabled: isMultipleSelectionsActive
        }
      ];

      const itemData: ContextMenuAdditionalData =
        isMultipleSelectionEnabled &&
        multipleSelectionsData.selectionType === 'genre' &&
        isAMultipleSelection
          ? {
              title: t(`genre.selectedGenreCount`, {
                count: multipleSelectionsData.multipleSelections.length
              }),
              artworkPath: DefaultGenreCover
            }
          : {
              title,
              artworkPath: artworkPaths?.optimizedArtworkPath,
              subTitle: t('common.songWithCount', { count: resolvedSongCount })
            };

      updateContextMenuData(true, items, e.pageX, e.pageY, itemData);
    },
    [
      addNewNotifications,
      addToQueueForMultipleSelections,
      artworkPaths?.optimizedArtworkPath,
      genreId,
      goToGenreInfoPage,
      isAMultipleSelection,
      isMultipleSelectionEnabled,
      playGenreSongs,
      playGenreSongsForMultipleSelections,
      resolveSongIds,
      resolvedSongCount,
      t,
      title,
      toggleMultipleSelections,
      updateContextMenuData,
      updateMultipleSelections
    ]
  );

  return (
    <NavLink
      to="/main-player/genres/$genreId"
      params={{ genreId: String(genreId) }}
      preload={isMultipleSelectionEnabled ? false : undefined}
      className={`genre fx-rise group bg-background-color-2/70 hover:bg-background-color-2! dark:bg-dark-background-color-2/70 dark:hover:bg-dark-background-color-2! text-background-color-2 dark:text-dark-background-color-2 relative mr-10 mb-6 flex h-36 w-72 cursor-pointer items-center gap-4 overflow-hidden rounded-2xl p-4 backdrop-blur-md transition-[border,border-color,translate] duration-200 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 ${className} ${
        isMultipleSelectionEnabled && 'border-4 border-transparent'
      } ${isAMultipleSelection && 'border-font-color-highlight! dark:border-dark-font-color-highlight!'}`}
      style={{
        backgroundColor
      }}
      onClick={(e) => {
        e.preventDefault();
        const currentSelections = store.state.multipleSelectionsData;
        if (e.getModifierState('Shift') === true && selectAllHandler) selectAllHandler(genreId);
        else if (e.getModifierState('Control') === true && !isMultipleSelectionEnabled)
          toggleMultipleSelections(!isAMultipleSelection, 'genre', [genreId]);
        else if (isMultipleSelectionEnabled && currentSelections.selectionType === 'genre')
          updateMultipleSelections(genreId, 'genre', isAMultipleSelection ? 'remove' : 'add');
        else goToGenreInfoPage();
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="genre-artwork-container w-2/5 max-w-[100px]">
        <Img
          src={artworkPaths.artworkPath}
          className="aspect-square rounded-md shadow-2xl"
          alt="Artwork cover"
          enableImgFadeIns={!isMultipleSelectionEnabled}
        />
      </div>
      <div className="genre-info-container w-3/5 grow-0">
        <Button
          className="genre-title text-font-color-white dark:text-font-color-white m-0! block! w-full truncate rounded-none! border-0! bg-transparent p-0! text-left! text-2xl! outline-offset-1 hover:bg-transparent focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
          label={title}
          clickHandler={goToGenreInfoPage}
        />
        <div className="genre-no-of-songs text-font-color-white/75 dark:text-font-color-white/75 text-sm">
          {t(`common.songWithCount`, {
            count: songIds.length
          })}
        </div>
        {isMultipleSelectionEnabled && (
          <MultipleSelectionCheckbox id={genreId} selectionType="genre" className="z-10 mt-2!" />
        )}
      </div>
    </NavLink>
  );
});

Genre.displayName = 'Genre';

export default Genre;

