import { Album } from '@renderer/components/AlbumsPage/Album';
import DuplicateArtistsSuggestion from '@renderer/components/ArtistInfoPage/DuplicateArtistsSuggestion';
import SeparateArtistsSuggestion from '@renderer/components/ArtistInfoPage/SeparateArtistsSuggestion';
import Button from '@renderer/components/Button';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import TitleContainer from '@renderer/components/TitleContainer';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useResizeObserver from '@renderer/hooks/useResizeObserver';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { albumQuery } from '@renderer/queries/albums';
import { artistQuery } from '@renderer/queries/artists';
import { songQuery } from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import calculateTimeFromSeconds from '@renderer/utils/calculateTimeFromSeconds';
import storage from '@renderer/utils/localStorage';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface LibraryTabProps {
  artistData: Artist;
  sortingOrder: SongSortTypes;
  onSortingOrderChange: (order: SongSortTypes) => void;
}

export function LibraryTab({
  artistData,
  sortingOrder,
  onSortingOrderChange
}: LibraryTabProps) {
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { createQueue, updateContextMenuData, toggleMultipleSelections, updateQueueData } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [isAllAlbumsVisible, setIsAllAlbumsVisible] = useState(false);
  const [isAllSongsVisible, setIsAllSongsVisible] = useState(false);

  useEffect(() => {
    storage.sortingStates.setSortingStates('artistDetailPage', sortingOrder);
  }, [sortingOrder]);

  const songsContainerRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver(songsContainerRef);

  const CONTAINER_PADDING = 30;
  const relevantWidth = useMemo(() => width - CONTAINER_PADDING, [width]);
  const noOfVisibleAlbums = useMemo(() => Math.floor(relevantWidth / 250) || 4, [relevantWidth]);

  const { data: songs = [] } = useQuery({
    ...songQuery.allSongInfo({
      songIds: artistData.songs.map((song) => song.songId) || [],
      sortType: sortingOrder,
      filterType: 'notSelected'
    }),
    enabled: !!artistData?.songs && artistData.songs.length > 0
  });

  const { data: albums = [] } = useQuery({
    ...albumQuery.allAlbumInfo({
      albumIds: artistData.albums?.map((album) => album.albumId) || []
    }),
    enabled: !!artistData?.albums && artistData.albums.length > 0,
    select: (data) => data.data
  });

  const { mutate: toggleLike } = useMutation({
    mutationFn: () =>
      window.api.artistsData.toggleLikeArtists([artistData.artistId], !artistData.isAFavorite),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: artistQuery._def });
    }
  });

  const artistSongsDuration = useMemo(
    () =>
      calculateTimeFromSeconds(songs.reduce((prev, current) => prev + current.duration, 0))
        .timeString,
    [songs]
  );

  const selectAllHandlerForAlbums = useSelectAllHandler(albums, 'album', 'albumId');

  const albumComponents = useMemo(
    () =>
      albums
        .filter((_, i) => (isAllAlbumsVisible ? true : i < noOfVisibleAlbums))
        .map((album, index) => {
          return (
            <Album
              index={index}
              key={album.albumId}
              albumId={album.albumId}
              artists={album.artists}
              artworkPaths={album.artworkPaths}
              songs={album.songs}
              title={album.title}
              year={album.year}
              className={bodyBackgroundImage ? '[&_:not(.icon)]:text-font-color-white!' : ''}
              selectAllHandler={selectAllHandlerForAlbums}
            />
          );
        }),
    [albums, bodyBackgroundImage, isAllAlbumsVisible, noOfVisibleAlbums, selectAllHandlerForAlbums]
  );

  const selectAllHandlerForSongs = useSelectAllHandler(songs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = songs.filter((song) => !song.isBlacklisted).map((song) => song.songId);
      createQueue(queueSongIds, 'artist', false, artistData?.artistId, false, artistData?.name);
      updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [artistData?.artistId, artistData?.name, createQueue, updateQueueData, songs]
  );

  const handlePlayAllArtistSongs = useCallback(() => {
    const queueSongIds = songs.filter((song) => !song.isBlacklisted).map((song) => song.songId);
    if (queueSongIds.length > 0) {
      createQueue(queueSongIds, 'artist', false, artistData?.artistId, true, artistData?.name);
    }
  }, [artistData?.artistId, artistData?.name, createQueue, songs]);

  const songComponents = useMemo(
    () =>
      songs
        .filter((_, i) => (isAllSongsVisible ? true : i < 5))
        .map((song, index) => {
          return (
            <Song
              key={song.songId}
              index={index}
              isIndexingSongs={preferences?.isSongIndexingEnabled}
              title={song.title}
              artists={song.artists}
              album={song.album}
              duration={song.duration}
              songId={song.songId}
              artworkPaths={song.artworkPaths}
              path={song.path}
              isAFavorite={song.isAFavorite}
              year={song.year}
              isBlacklisted={song.isBlacklisted}
              selectAllHandler={selectAllHandlerForSongs}
              onPlayClick={handleSongPlayBtnClick}
            />
          );
        }),
    [
      handleSongPlayBtnClick,
      isAllSongsVisible,
      preferences?.isSongIndexingEnabled,
      selectAllHandlerForSongs,
      songs
    ]
  );

  return (
    <div ref={songsContainerRef} className="w-full">
      <div className="artist-img-and-info-container relative mb-12 flex flex-row items-center pl-8 *:z-10">
        <div className="artist-img-container relative mr-10 flex max-h-60 items-center justify-center lg:hidden">
          <Img
            src={artistData?.onlineArtworkPaths?.picture_medium}
            fallbackSrc={artistData?.artworkPaths?.artworkPath}
            className="aspect-square! h-60 w-60 rounded-full object-cover shadow-lg"
            loading="eager"
            alt="Artist Cover"
            onContextMenu={(e) =>
              (artistData?.onlineArtworkPaths?.picture_xl ||
                artistData?.onlineArtworkPaths?.picture_medium) &&
              updateContextMenuData(
                true,
                [
                  {
                    label: t('common.saveArtwork'),
                    class: 'save',
                    iconName: 'image',
                    iconClassName: 'material-icons-round-outlined',
                    handlerFunction: () => {
                      const artworkPath =
                        artistData?.onlineArtworkPaths?.picture_xl ||
                        artistData?.onlineArtworkPaths?.picture_medium;

                      if (artworkPath)
                        window.api.songUpdates.saveArtworkToSystem(artworkPath, artistData.name);
                    }
                  }
                ],
                e.pageX,
                e.pageY
              )
            }
          />
          <Button
            className="bg-background-color-1 text-font-color-highlight hover:bg-background-color-1 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-2 absolute -bottom-5 m-0! flex rounded-full border-0! p-3! shadow-xl -outline-offset-[6px] focus-visible:outline!"
            tooltipLabel={t(
              `artistInfoPage.${artistData?.isAFavorite ? `dislikeArtist` : `likeArtist`}`,
              {
                name: artistData?.name
              }
            )}
            iconName="favorite"
            iconClassName={`text-4xl! leading-none! ${
              artistData?.isAFavorite
                ? 'material-icons-round text-[#FF2D55]!'
                : 'material-icons-round-outlined'
            }`}
            clickHandler={() => {
              if (artistData) toggleLike();
            }}
          />
        </div>
        <div
          className={`artist-info-container relative ${
            bodyBackgroundImage
              ? 'text-font-color-white'
              : 'text-font-color-black dark:text-font-color-white'
          } *:z-10`}
        >
          <div className="artist-name text-font-color-highlight dark:text-dark-font-color-highlight mb-2 text-5xl font-bold">
            {artistData?.name || t('common.unknownArtist')}
          </div>
          {artistData?.songs && (
            <div className="artist-no-of-songs text-sm opacity-80">
              {t('common.albumWithCount', {
                count: artistData?.albums?.length || 0
              })}{' '}
              &bull; {t('common.songWithCount', { count: artistData.songs.length })}
            </div>
          )}
          {songs.length > 0 && (
            <div className="artist-total-songs-duration text-sm opacity-80">{artistSongsDuration}</div>
          )}
          <div className="artist-actions-container mt-4 flex items-center">
            <Button
              className="play-all-btn text-sm font-normal"
              label={t('common.playAll')}
              iconName="play_arrow"
              clickHandler={handlePlayAllArtistSongs}
              isDisabled={songs.length === 0}
            />
          </div>
        </div>
      </div>

      {artistData && (
        <>
          <SeparateArtistsSuggestion name={artistData.name} artistId={artistData.artistId} />
          <DuplicateArtistsSuggestion name={artistData.name} artistId={artistData.artistId} />
        </>
      )}

      {albums && albums.length > 0 && (
        <MainContainer
          className="main-container albums-list-container relative *:z-10"
          focusable
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 'a') {
              e.stopPropagation();
              selectAllHandlerForAlbums();
            }
          }}
        >
          <>
            <TitleContainer
              key="appearsInAlbums"
              title={t('artistInfoPage.appearsInAlbums')}
              titleClassName="text-2xl! text-font-color-black dark:text-font-color-white"
              className={`title-container ${
                bodyBackgroundImage
                  ? 'text-font-color-white'
                  : 'text-font-color-black dark:text-font-color-white'
              } mt-1 mb-4 text-2xl`}
              otherItems={[
                isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'album' ? (
                  <p
                    key="selectedAlbumCount"
                    className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm"
                  >
                    {t('common.selectionWithCount', {
                      count: multipleSelectionsData.multipleSelections.length
                    })}
                  </p>
                ) : (
                  <p
                    key="totalAlbumCount"
                    className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm"
                  >
                    {t('common.albumWithCount', { count: albums.length })}{' '}
                    {albums.length > noOfVisibleAlbums &&
                      !isAllAlbumsVisible &&
                      `(${t('common.shownWithCount', {
                        count: noOfVisibleAlbums || 0
                      })})`}
                  </p>
                )
              ]}
              buttons={[
                {
                  label: t('common.showAll'),
                  iconName: 'apps',
                  className: 'show-all-btn text-sm font-normal',
                  clickHandler: () => setIsAllAlbumsVisible(true),
                  isVisible: albums.length > noOfVisibleAlbums && !isAllAlbumsVisible
                }
              ]}
            />
            <div className="albums-container flex flex-wrap overflow-x-hidden">
              {albumComponents}
            </div>
          </>
        </MainContainer>
      )}

      {songs && songs.length > 0 && (
        <MainContainer
          className="main-container songs-list-container relative h-full pb-4 *:z-10"
          focusable
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 'a') {
              e.stopPropagation();
              selectAllHandlerForSongs();
            }
          }}
        >
          <>
            <TitleContainer
              key="appearsInSongs"
              title={t('artistInfoPage.appearsInSongs')}
              titleClassName="text-2xl! text-font-color-black dark:text-font-color-white"
              className={`title-container ${
                bodyBackgroundImage
                  ? 'text-font-color-white'
                  : 'text-font-color-black dark:text-font-color-white'
              } mt-1 mb-4 pr-4 text-2xl`}
              otherItems={[
                <p
                  key="appearsInSongsCount"
                  className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm"
                >
                  {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'songs'
                    ? t('common.selectionWithCount', {
                        count: multipleSelectionsData.multipleSelections.length
                      })
                    : `${t('common.songWithCount', { count: songs.length })} ${
                        songs.length > 5 && !isAllSongsVisible
                          ? `(${t('common.shownWithCount', { count: 5 })})`
                          : ''
                      }`}
                </p>
              ]}
              buttons={[
                {
                  tooltipLabel: t('common.moreOptions'),
                  className:
                    'more-options-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0 bg-background-color-1/40! dark:bg-dark-background-color-1/40!',
                  iconName: 'more_horiz',
                  clickHandler: (e) => {
                    e.stopPropagation();
                    const button = e.currentTarget;
                    const { x, y } = button.getBoundingClientRect();
                    updateContextMenuData(
                      true,
                      [
                        {
                          label: t('common.shuffleAndPlay'),
                          iconName: 'shuffle',
                          handlerFunction: () =>
                            createQueue(
                              songs
                                .filter((song) => !song.isBlacklisted)
                                .map((song) => song.songId),
                              'artist',
                              true,
                              artistData?.artistId,
                              true,
                              artistData?.name
                            )
                        },
                        {
                          label: t('common.playAll'),
                          iconName: 'play_arrow',
                          handlerFunction: () =>
                            createQueue(
                              songs
                                .filter((song) => !song.isBlacklisted)
                                .map((song) => song.songId),
                              'artist',
                              false,
                              artistData?.artistId,
                              true,
                              artistData?.name
                            )
                        },
                        ...(isMultipleSelectionEnabled &&
                        multipleSelectionsData.selectionType === 'songs'
                          ? [
                              {
                                iconName: 'select_all',
                                handlerFunction: () => selectAllHandlerForSongs(),
                                label: t('common.selectAll')
                              }
                            ]
                          : []),
                        {
                          iconName: isMultipleSelectionEnabled ? 'remove_done' : 'checklist',
                          handlerFunction: () =>
                            toggleMultipleSelections(!isMultipleSelectionEnabled, 'songs'),
                          label: t(
                            `common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`
                          )
                        }
                      ],
                      x + 10,
                      y + 50
                    );
                  }
                },
                {
                  label: t('common.showAll'),
                  iconName: 'apps',
                  className:
                    'show-all-btn text-sm font-normal bg-background-color-1/40! dark:bg-dark-background-color-1/40!',
                  clickHandler: () => setIsAllSongsVisible(true),
                  isVisible: songs.length > 5 && !isAllSongsVisible
                }
              ]}
              dropdowns={[
                {
                  name: 'ArtistInfoPageSongsSortDropdown',
                  value: sortingOrder,
                  options: songSortOptions,
                  onChange: (e) => {
                    const order = e.currentTarget.value as SongSortTypes;
                    onSortingOrderChange(order);
                  }
                }
              ]}
            />
            <div className="songs-container">{songComponents}</div>
          </>
        </MainContainer>
      )}
    </div>
  );
}

export default LibraryTab;
