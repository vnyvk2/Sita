import type { PlaylistDto } from '@common/collections/dtos';
import { SpecialPlaylists } from '@common/playlists.enum';
import { CollectionClient } from '@renderer/api/CollectionClient';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { Suspense, lazy, useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultPlaylistCover from '../../assets/images/webp/playlist_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import {
  usePinCollection,
  useUnpinCollection
} from '../../hooks/collections/useCollectionMutations';
import Button from '../Button';
import MultipleSelectionCheckbox from '../MultipleSelectionCheckbox';
import NavLink from '../NavLink';
import PlaylistCover from './PlaylistCover';
import { SpotifyPlaylistExportModal } from './SpotifyPlaylistExportModal';
import { SpotifyPlaylistSyncModal } from './SpotifyPlaylistSyncModal';

const ConfirmDeletePlaylistsPrompt = lazy(() => import('./ConfirmDeletePlaylistsPrompt'));
const RenamePlaylistPrompt = lazy(() => import('./RenamePlaylistPrompt'));
const PlaylistExportSettingsPrompt = lazy(() => import('./PlaylistExportSettingsPrompt'));
const PlaylistCoverSettingsPrompt = lazy(() => import('./PlaylistCoverSettingsPrompt'));

const getPlaylistSongIds = async (id: number): Promise<number[]> => {
  const entries = await CollectionClient.getEntries(id);
  return entries.map((e) => e.songId);
};

interface PlaylistProp extends PlaylistDto {
  index: number;
  selectAllHandler?: (_upToId?: number) => void;
}

export const Playlist = (props: PlaylistProp) => {
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);

  const {
    updateQueueData,
    updateContextMenuData,
    changePromptMenuData,
    createQueue,
    toggleMultipleSelections,
    updateMultipleSelections,
    addNewNotifications
  } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pinMutation = usePinCollection();
  const unpinMutation = useUnpinCollection();

  const [isSpotifyExportModalOpen, setIsSpotifyExportModalOpen] = useState(false);
  const [isSpotifySyncModalOpen, setIsSpotifySyncModalOpen] = useState(false);

  const openPlaylistInfoPage = useCallback(
    () =>
      navigate({
        to: '/main-player/playlists/$playlistId',
        params: { playlistId: String(props.id) }
      }),
    [navigate, props.id]
  );

  const isAMultipleSelection = useMemo(() => {
    if (!multipleSelectionsData.isEnabled) return false;
    if (multipleSelectionsData.selectionType !== 'playlist') return false;
    if (multipleSelectionsData.multipleSelections.length <= 0) return false;
    if (multipleSelectionsData.multipleSelections.some((selectionId) => selectionId === props.id))
      return true;
    return false;
  }, [multipleSelectionsData, props.id]);

  const playAllSongs = useCallback(
    (isShuffling = false) => {
      getPlaylistSongIds(props.id)
        .then((songIds) => {
          return window.api.audioLibraryControls.getSongInfo(
            songIds,
            undefined,
            undefined,
            undefined,
            true
          );
        })
        .then((songData) => {
          if (Array.isArray(songData)) {
            createQueue(
              songData.filter((song) => !song.isBlacklisted).map((song) => song.songId),
              'playlist',
              isShuffling,
              props.id,
              true,
              props.name
            );
          }
        })
        .catch((err) => console.error(err));
    },
    [createQueue, props.id, props.name]
  );

  const playAllSongsForMultipleSelections = useCallback(
    (isShuffling = false) => {
      const { multipleSelections: playlistIds } = multipleSelectionsData;

      Promise.all(playlistIds.map((id) => getPlaylistSongIds(id)))
        .then((results) => {
          const ids = results.flat();
          return window.api.audioLibraryControls.getSongInfo(
            ids,
            undefined,
            undefined,
            undefined,
            true
          );
        })
        .then((songData) => {
          if (Array.isArray(songData)) {
            const songIds = songData
              .filter((song) => !song.isBlacklisted)
              .map((song) => song.songId);
            createQueue(songIds, 'songs', isShuffling);
          }
        })
        .catch((err) => console.error(err));
    },
    [createQueue, multipleSelectionsData]
  );

  const addToQueueForMultipleSelections = useCallback(() => {
    const { multipleSelections: playlistIds } = multipleSelectionsData;

    Promise.all(playlistIds.map((id) => getPlaylistSongIds(id)))
      .then((results) => {
        const ids = results.flat();
        return window.api.audioLibraryControls.getSongInfo(ids);
      })
      .then((songData) => {
        if (Array.isArray(songData)) {
          const songIdsToAdd = songData
            .filter((song) => !song.isBlacklisted)
            .map((song) => song.songId);
          getQueuesManager().getActiveQueue().addSongIdsToEnd(songIdsToAdd);
          addNewNotifications([
            {
              id: 'newSongsToQueue',
              content: t('notifications.addedToQueue', {
                count: songData.length
              })
            }
          ]);
        }
      })
      .catch((err) => console.error(err));
  }, [addNewNotifications, multipleSelectionsData, t]);

  const contextMenus: ContextMenuItem[] = useMemo(() => {
    const { multipleSelections: playlistIds } = multipleSelectionsData;

    return [
      {
        label: t('common.play'),
        iconName: 'play_arrow',
        handlerFunction: () => {
          if (isMultipleSelectionEnabled) playAllSongsForMultipleSelections();
          else playAllSongs();
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t('common.shuffleAndPlay'),
        iconName: 'shuffle',
        handlerFunction: () => {
          if (isMultipleSelectionEnabled) playAllSongsForMultipleSelections(true);
          else playAllSongs(true);
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t('common.addToQueue'),
        iconName: 'queue_music',
        handlerFunction: () => {
          if (isMultipleSelectionEnabled) addToQueueForMultipleSelections();
          else {
            getPlaylistSongIds(props.id)
              .then((songIds) => {
                getQueuesManager().getActiveQueue().addSongIdsToEnd(songIds);
                addNewNotifications([
                  {
                    id: 'newSongsToQueue',
                    content: t('notifications.addedToQueue', {
                      count: songIds.length
                    })
                  }
                ]);
              })
              .catch(console.error);
          }
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: 'Hr',
        isContextMenuItemSeperator: true,
        handlerFunction: () => true,
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t(`playlist.${props.artworkPath ? 'changeArtwork' : 'addArtwork'}`),
        iconName: 'photo_camera',
        handlerFunction: () => {
          window.api.songUpdates
            .getImgFileLocation()
            .then((artworkPath) => {
              if (artworkPath) {
                return CollectionClient.setArtwork(props.id, artworkPath);
              }
              return undefined;
            })
            .then(() => {
              return addNewNotifications([
                {
                  content: t('playlist.playlistArtworkUpdateSuccess'),
                  icon: <span className="material-icons-round">done</span>,
                  duration: 5000,
                  id: 'PlaylistArtworkUpdateSuccessful'
                }
              ]);
            })
            .catch((err) => console.error(err));
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t('playlist.renamePlaylist'),
        iconName: 'edit',
        handlerFunction: () => {
          changePromptMenuData(true, <RenamePlaylistPrompt playlistData={props} />);
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t('playlistsPage.editCover', 'Edit Cover'),
        iconName: 'grid_view',
        handlerFunction: () => {
          CollectionClient.getEntries(props.id)
            .then((entries) => {
              const ids = (entries || []).map((e) => e.songId);
              if (ids.length === 0) return [];
              return window.api.audioLibraryControls.getSongInfo(ids);
            })
            .then((songs) => {
              changePromptMenuData(
                true,
                <PlaylistCoverSettingsPrompt playlist={props} playlistSongs={songs || []} />,
                'max-w-5xl w-full min-w-0',
                { mode: 'workspace', scrollBehavior: 'content' }
              );
            })
            .catch((err) => console.error(err));
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t(`common.${isAMultipleSelection ? 'unselect' : 'select'}`),
        iconName: 'checklist',
        handlerFunction: () => {
          if (isMultipleSelectionEnabled) {
            updateMultipleSelections(props.id, 'playlist', isAMultipleSelection ? 'remove' : 'add');
          } else toggleMultipleSelections(!isAMultipleSelection, 'playlist', [props.id]);
        }
      },
      {
        label: t('playlist.exportPlaylist'),
        iconName: 'upload',
        handlerFunction: () => {
          changePromptMenuData(
            true,
            <Suspense fallback={null}>
              <PlaylistExportSettingsPrompt playlistId={props.id} />
            </Suspense>
          );
        },
        isDisabled: isMultipleSelectionEnabled
      },
      {
        label: t(
          props.isPinned ? 'playlist.unpinPlaylist' : 'playlist.pinPlaylist',
          props.isPinned ? 'Unpin Playlist' : 'Pin Playlist'
        ),
        iconName: 'push_pin',
        handlerFunction: () => {
          if (props.isPinned) {
            unpinMutation.mutate({ playlistId: props.id });
          } else {
            pinMutation.mutate({ playlistId: props.id });
          }
        },
        isDisabled: isMultipleSelectionEnabled || SpecialPlaylists.isSpecialPlaylistId(props.id)
      },
      {
        label: t('playlist.importIntoPlaylist', 'Import M3U into Playlist'),
        iconName: 'publish',
        handlerFunction: () => window.api.collections.import({ targetPlaylistId: props.id }),
        isDisabled: isMultipleSelectionEnabled || SpecialPlaylists.isSpecialPlaylistId(props.id)
      },
      {
        label: 'Export to Spotify',
        iconName: 'ios_share',
        handlerFunction: () => setIsSpotifyExportModalOpen(true),
        isDisabled: isMultipleSelectionEnabled || SpecialPlaylists.isSpecialPlaylistId(props.id)
      },
      {
        label: 'Sync with Spotify',
        iconName: 'sync_alt',
        handlerFunction: () => setIsSpotifySyncModalOpen(true),
        isDisabled: isMultipleSelectionEnabled || SpecialPlaylists.isSpecialPlaylistId(props.id)
      },
      {
        label: t('common.info'),
        iconName: 'info',
        handlerFunction: openPlaylistInfoPage,
        isDisabled: isMultipleSelectionEnabled
      },
      {
        label: 'Hr',
        isContextMenuItemSeperator: true,
        handlerFunction: () => true,
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      },
      {
        label: t(
          `playlist.${isMultipleSelectionEnabled ? 'deleteSelectedPlaylists' : 'deletePlaylist_one'}`
        ),
        iconName: 'delete_outline',
        handlerFunction: () => {
          changePromptMenuData(
            true,
            <ConfirmDeletePlaylistsPrompt
              playlistIds={isMultipleSelectionEnabled ? playlistIds : [props.id]}
              playlistName={props.name}
            />
          );
          toggleMultipleSelections(false);
        },
        isDisabled: isMultipleSelectionEnabled
          ? false
          : props.id === SpecialPlaylists.Favorites || props.id === SpecialPlaylists.History
      }
    ];
  }, [
    addNewNotifications,
    addToQueueForMultipleSelections,
    changePromptMenuData,
    isAMultipleSelection,
    isMultipleSelectionEnabled,
    multipleSelectionsData,
    openPlaylistInfoPage,
    playAllSongs,
    playAllSongsForMultipleSelections,
    props,
    t,
    toggleMultipleSelections,
    updateMultipleSelections
  ]);

  const contextMenuItemData = useMemo(
    (): ContextMenuAdditionalData =>
      isMultipleSelectionEnabled &&
      multipleSelectionsData.selectionType === 'playlist' &&
      isAMultipleSelection
        ? {
            title: t('playlist.selectedPlaylistCount', {
              count: multipleSelectionsData.multipleSelections.length
            }),
            artworkPath: DefaultPlaylistCover
          }
        : {
            title: props.name,
            artworkPath: props.artworkPath || DefaultPlaylistCover,
            subTitle: t('common.songWithCount', { count: props.itemCount })
          },
    [
      isAMultipleSelection,
      isMultipleSelectionEnabled,
      multipleSelectionsData.multipleSelections.length,
      multipleSelectionsData.selectionType,
      props.artworkPath,
      props.name,
      props.itemCount,
      t
    ]
  );

  return (
    <>
      <NavLink
        to={'/main-player/playlists/$playlistId'}
        params={{ playlistId: String(props.id) }}
        preload={isMultipleSelectionEnabled ? false : undefined}
        className={`playlist fx-rise fx-spotlight group hover:bg-background-color-2/50 dark:hover:bg-dark-background-color-2/50 ${
          props.id
        } text-font-color-black dark:text-font-color-white mr-12 mb-8 flex h-fit max-h-52 min-h-48 w-36 flex-col justify-between rounded-md p-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 ${
          isAMultipleSelection
            ? 'bg-background-color-3! text-font-color-black! dark:bg-dark-background-color-3! dark:text-font-color-black!'
            : ''
        }`}
        data-playlist-id={props.id}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateContextMenuData(true, contextMenus, e.pageX, e.pageY, contextMenuItemData);
        }}
        onClick={(e) => {
          e.preventDefault();
          if (e.getModifierState('Shift') === true && props.selectAllHandler)
            props.selectAllHandler(props.id);
          else if (e.getModifierState('Control') === true && !isMultipleSelectionEnabled)
            toggleMultipleSelections(!isAMultipleSelection, 'playlist', [props.id]);
          else if (
            isMultipleSelectionEnabled &&
            multipleSelectionsData.selectionType === 'playlist'
          )
            updateMultipleSelections(props.id, 'playlist', isAMultipleSelection ? 'remove' : 'add');
          else openPlaylistInfoPage();
        }}
      >
        <div className="playlist-cover-and-play-btn-container relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl before:invisible before:absolute before:z-10 before:h-full before:w-full before:bg-linear-to-b before:from-[hsla(0,0%,0%,0%)] before:to-[hsla(0,0%,0%,40%)] before:opacity-0 before:transition-[visibility,opacity] before:duration-300 before:content-[''] group-focus-within:before:visible group-focus-within:before:opacity-100 group-hover:before:visible group-hover:before:opacity-100">
          {props.isPinned && (
            <div
              className="bg-background-color-1/80 text-font-color-highlight dark:bg-dark-background-color-1/80 absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-md backdrop-blur-xs"
              title={t('playlist.pinnedPlaylist', 'Pinned Playlist')}
              aria-label={t('playlist.pinnedPlaylist', 'Pinned Playlist')}
            >
              <span className="material-icons-round text-sm">push_pin</span>
            </div>
          )}
          {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'playlist' ? (
            <MultipleSelectionCheckbox
              id={props.id}
              selectionType="playlist"
              className="absolute right-3 bottom-3 z-10"
            />
          ) : (
            <Button
              className="text-font-color-white dark:text-font-color-white! absolute right-2 bottom-2 z-10 m-0! translate-y-10 scale-90 rounded-none! border-0! bg-transparent p-0! opacity-0 outline-offset-1 transition-[opacity,transform] delay-100 duration-200 ease-in-out group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 hover:bg-transparent focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
              clickHandler={() => playAllSongs()}
              iconName="play_circle"
              iconClassName="text-4xl! leading-none! text-inherit!"
            />
          )}
          <div className="playlist-cover-container h-full cursor-pointer overflow-hidden">
            <PlaylistCover
              playlist={props}
              className="aspect-square w-full transition-transform duration-300 ease-out group-focus-within:scale-[1.04] group-hover:scale-[1.04]"
              enableImgFadeIns={!isMultipleSelectionEnabled}
            />
          </div>
        </div>
        <div className="playlist-info-container mt-2">
          <Button
            className={`playlist-title m-0! block! w-full truncate rounded-none! border-0! bg-transparent p-0! text-left! text-xl! outline-offset-1 hover:bg-transparent hover:underline focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent ${
              isAMultipleSelection && 'text-font-color-black! dark:text-font-color-black!'
            }`}
            tooltipLabel={props.name}
            clickHandler={() => {
              if (
                isMultipleSelectionEnabled &&
                multipleSelectionsData.selectionType === 'playlist'
              ) {
                updateMultipleSelections(
                  props.id,
                  'playlist',
                  isAMultipleSelection ? 'remove' : 'add'
                );
              } else {
                openPlaylistInfoPage();
              }
            }}
            label={props.name}
          />
          <div className="playlist-no-of-songs text-sm font-light">
            {t('common.songWithCount', { count: props.itemCount })}
          </div>
        </div>
      </NavLink>

      <SpotifyPlaylistExportModal
        playlistId={props.id}
        playlistName={props.name}
        isOpen={isSpotifyExportModalOpen}
        onClose={() => setIsSpotifyExportModalOpen(false)}
      />

      <SpotifyPlaylistSyncModal
        playlistId={props.id}
        playlistName={props.name}
        isOpen={isSpotifySyncModalOpen}
        onClose={() => setIsSpotifySyncModalOpen(false)}
      />
    </>
  );
};
export default Playlist;
