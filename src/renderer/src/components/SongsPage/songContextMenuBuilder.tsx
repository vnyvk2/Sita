/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import type { TFunction } from 'i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';
import { buildSongPlaylistMenuItem } from './songPlaylistMenu';
import {
  resolveAutoTagSongs,
  updateMissingArtworkForSongs,
  updateMissingLyricsForSongs,
  type SongDataForAutoTag
} from '../../utils/autoTagUtils';
import { songCacheKeys, songQuery } from '../../queries/songs';
import { queryClient } from '../../queryClient';
import { store } from '../../store/store';

const BlacklistSongConfirmPrompt = lazy(() => import('./BlacklistSongConfirmPrompt'));
const DeleteSongsFromSystemConfrimPrompt = lazy(
  () => import('./DeleteSongsFromSystemConfrimPrompt')
);

export interface SongContextMenuInput {
  songId: number;
  title: string;
  artists?: { name: string; artistId: number }[];
  album?: { name: string; albumId: number };
  duration: number;
  year?: number;
  path: string;
  isBlacklisted?: boolean;
  genres?: { genreId: number | string; name: string }[];
  discNo?: number;
  trackNo?: number | string;
  isAFavorite: boolean;
  isCurrentSong: boolean;
  artworkPaths?: ArtworkPaths;
  isAMultipleSelection: boolean;
  isMultipleSelectionEnabled: boolean;
  additionalContextMenuItems?: ContextMenuItem[];
}

export interface SongContextMenuServices {
  t: TFunction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (options: any) => void;
  addNewNotifications: (notifications: AppNotification[]) => void;
  changePromptMenuData: (show: boolean, content?: React.ReactNode) => void;
  toggleMultipleSelections: (
    isEnabled?: boolean,
    selectionType?: QueueTypes,
    addSelections?: number[],
    replaceSelections?: boolean
  ) => void;
  updateMultipleSelections?: (id: number, selectionType: QueueTypes, type: 'add' | 'remove') => void;
  createQueue: (
    songIds: number[],
    queueType: QueueTypes,
    isShuffleQueue?: boolean,
    queueId?: string | number,
    startPlaying?: boolean,
    queueTitle?: string,
    initialPosition?: number
  ) => void;
  addToNext: (songIds: number[]) => void;
  addToEnd: (songIds: number[]) => void;
  toggleIsFavorite: (isFavorite: boolean, onlyChangeCurrentSongData?: boolean) => void;
  playSong?: (songId: number, isStartPlay?: boolean) => void;
  handlePlayBtnClick?: () => void;
  toggleSingleSongFavorite?: () => void;
  openAutoTagDialog?: (
    songs: unknown[],
    albumName?: string,
    artistName?: string,
    workflow?: import('../../hooks/useMetadataWorkflow').WorkflowType
  ) => void;
  openTrackIdentifyDialog?: (songs: SongDataForAutoTag[]) => void;
  openGenreStyleDialog?: (songs: SongDataForAutoTag[]) => void;
  doNotShowBlacklistSongConfirm?: boolean;
}

export async function buildSongContextMenuItems(
  song: SongContextMenuInput,
  services: SongContextMenuServices,
  isCompact: boolean = false
): Promise<ContextMenuItem[]> {
  const {
    songId,
    title,
    artists,
    album,
    duration,
    year,
    path,
    isBlacklisted = false,
    genres,
    discNo,
    trackNo,
    isAFavorite,
    isCurrentSong,
    artworkPaths,
    isAMultipleSelection,
    additionalContextMenuItems
  } = song;

  const {
    t,
    navigate,
    addNewNotifications,
    changePromptMenuData,
    toggleMultipleSelections,
    updateMultipleSelections,
    createQueue,
    addToNext,
    addToEnd,
    toggleIsFavorite,
    playSong,
    handlePlayBtnClick = () => {
      if (playSong) playSong(songId);
    },
    toggleSingleSongFavorite,
    openAutoTagDialog,
    openTrackIdentifyDialog,
    openGenreStyleDialog,
    doNotShowBlacklistSongConfirm
  } = services;

  const goToSongInfoPage = () =>
    navigate({ to: '/main-player/songs/$songId', params: { songId: String(songId) } });

  const state = store.state;
  const currentSelections = state.multipleSelectionsData;
  const isMultiSelectionActive =
    currentSelections.isEnabled &&
    currentSelections.selectionType === 'songs' &&
    currentSelections.multipleSelections.length !== 1 &&
    isAMultipleSelection;

  const songIds = currentSelections.multipleSelections;

  const playlistMenuItem = await buildSongPlaylistMenuItem({
    songIds: isMultiSelectionActive ? songIds : [songId],
    title,
    t,
    addNewNotifications,
    changePromptMenuData,
    toggleMultipleSelections
  });

  const onToggleSingleFavorite = () => {
    if (toggleSingleSongFavorite) {
      toggleSingleSongFavorite();
      return;
    }
    const nextFav = !isAFavorite;
    if (isCurrentSong) {
      toggleIsFavorite(nextFav, true);
    }
    window.api.playerControls
      .toggleLikeSongs([songId], nextFav)
      .then((res) => {
        if (res && (res.likes.length > 0 || res.dislikes.length > 0)) {
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
          queryClient.invalidateQueries({ queryKey: ['songs', 'favorites'] });
        }
      })
      .catch((err) => {
        console.error(err);
        addNewNotifications([
          {
            id: `toggleLikeError-${songId}`,
            content: t('song.toggleLikeFailed'),
            iconName: 'error',
            duration: 5000
          }
        ]);
      });
  };

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
              icon: isCompact ? undefined : (
                <Img
                  src={artworkPaths?.optimizedArtworkPath || DefaultSongCover}
                  loading="lazy"
                  alt="Song Artwork"
                />
              ),
              iconName: isCompact ? 'add' : undefined
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
      iconName: 'favorite',
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
                  id: 'toggleLikeError-multi',
                  content: t('song.toggleLikeFailed'),
                  iconName: 'error',
                  duration: 5000
                }
              ]);
            });
        } else {
          onToggleSingleFavorite();
        }
        toggleMultipleSelections(false);
      }
    },
    playlistMenuItem,
    {
      label: t(`common.${isAMultipleSelection ? 'unselect' : 'select'}`),
      iconName: 'checklist',
      handlerFunction: () => {
        if (updateMultipleSelections) {
          updateMultipleSelections(songId, 'songs', isAMultipleSelection ? 'remove' : 'add');
        } else {
          toggleMultipleSelections(!isAMultipleSelection, 'songs', [songId]);
        }
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
      label: isMultiSelectionActive
        ? t('song.editSongsTags', {
            count: store.state.multipleSelectionsData.multipleSelections.length,
            defaultValue: `Edit Tags (${store.state.multipleSelectionsData.multipleSelections.length} tracks)`
          })
        : t('song.editSongTags'),
      class: 'edit',
      iconName: 'edit',
      handlerFunction: () => {
        if (isMultiSelectionActive) {
          navigate({
            to: '/main-player/songs/batch-edit',
            search: { songIds: store.state.multipleSelectionsData.multipleSelections }
          });
        } else {
          navigate({
            to: '/main-player/songs/$songId/edit',
            params: { songId: String(songId) }
          });
        }
      }
    },
    {
      label: 'Auto Tag Album',
      class: 'auto-tag-album',
      iconName: 'album',
      handlerFunction: async () => {
        if (openAutoTagDialog) {
          let targetSongs: SongDataForAutoTag[] = [
            {
              songId,
              title,
              artists,
              album,
              genres,
              trackNo: typeof trackNo === 'number' ? trackNo : undefined,
              discNo,
              year,
              path,
              duration
            }
          ];
          if (isMultiSelectionActive) {
            const resolved = await resolveAutoTagSongs(songIds);
            if (resolved.length > 0) targetSongs = resolved;
          }
          openAutoTagDialog(
            targetSongs,
            album?.name ?? targetSongs[0]?.album?.name ?? title,
            artists?.[0]?.name ?? targetSongs[0]?.artists?.[0]?.name,
            'album'
          );
        }
      }
    },
    {
      label: 'Auto Tag Track',
      class: 'auto-tag-track',
      iconName: 'audiotrack',
      handlerFunction: null,
      innerContextMenus: [
        {
          label: 'Identify Track and Update Tags',
          iconName: 'fingerprint',
          handlerFunction: async () => {
            if (openTrackIdentifyDialog) {
              let targetSongs: SongDataForAutoTag[] = [
                {
                  songId,
                  title,
                  artists,
                  album,
                  genres,
                  trackNo: typeof trackNo === 'number' ? trackNo : undefined,
                  discNo,
                  year,
                  path,
                  duration
                }
              ];
              if (isMultiSelectionActive) {
                const resolved = await resolveAutoTagSongs(songIds);
                if (resolved.length > 0) targetSongs = resolved;
              }
              openTrackIdentifyDialog(targetSongs);
            }
          }
        },
        {
          label: 'Update Only Genres & Styles',
          iconName: 'label',
          handlerFunction: async () => {
            if (openGenreStyleDialog) {
              let targetSongs: SongDataForAutoTag[] = [
                {
                  songId,
                  title,
                  artists,
                  album,
                  genres,
                  trackNo: typeof trackNo === 'number' ? trackNo : undefined,
                  discNo,
                  year,
                  path,
                  duration
                }
              ];
              if (isMultiSelectionActive) {
                const resolved = await resolveAutoTagSongs(songIds);
                if (resolved.length > 0) targetSongs = resolved;
              }
              openGenreStyleDialog(targetSongs);
            }
          }
        },
        {
          label: 'Update Missing Artwork',
          iconName: 'image',
          handlerFunction: async () => {
            let targetSongs: SongDataForAutoTag[] = [
              {
                songId,
                title,
                artists,
                album,
                genres,
                trackNo: typeof trackNo === 'number' ? trackNo : undefined,
                discNo,
                year,
                path,
                duration
              }
            ];
            if (isMultiSelectionActive) {
              const resolved = await resolveAutoTagSongs(songIds);
              if (resolved.length > 0) targetSongs = resolved;
            }
            addNewNotifications([
              {
                id: `artwork-update-${Date.now()}`,
                content: `Updating artwork for ${targetSongs.length} track${targetSongs.length > 1 ? 's' : ''}...`,
                iconName: 'image',
                duration: 4000
              }
            ]);
            const stats = await updateMissingArtworkForSongs(targetSongs);
            addNewNotifications([
              {
                id: `artwork-done-${Date.now()}`,
                content: `Artwork update complete: ${stats.updated} updated, ${stats.skipped} skipped.`,
                iconName: stats.updated > 0 ? 'check_circle' : 'info',
                duration: 5000
              }
            ]);
          }
        },
        {
          label: 'Update Missing Lyrics',
          iconName: 'lyrics',
          handlerFunction: async () => {
            let targetSongs: SongDataForAutoTag[] = [
              {
                songId,
                title,
                artists,
                album,
                genres,
                trackNo: typeof trackNo === 'number' ? trackNo : undefined,
                discNo,
                year,
                path,
                duration
              }
            ];
            if (isMultiSelectionActive) {
              const resolved = await resolveAutoTagSongs(songIds);
              if (resolved.length > 0) targetSongs = resolved;
            }
            addNewNotifications([
              {
                id: `lyrics-update-${Date.now()}`,
                content: `Searching missing lyrics for ${targetSongs.length} track${targetSongs.length > 1 ? 's' : ''}...`,
                iconName: 'lyrics',
                duration: 4000
              }
            ]);
            const stats = await updateMissingLyricsForSongs(targetSongs);
            addNewNotifications([
              {
                id: `lyrics-done-${Date.now()}`,
                content: `Lyrics update complete: ${stats.updated} updated, ${stats.skipped} skipped.`,
                iconName: stats.updated > 0 ? 'check_circle' : 'info',
                duration: 5000
              }
            ]);
          }
        },
        {
          label: 'Infer Tags from Filename',
          iconName: 'description',
          handlerFunction: () => {
            const targetIds = isMultiSelectionActive ? songIds : [songId];
            navigate({
              to: '/main-player/songs/batch-edit',
              search: { songIds: targetIds }
            });
          }
        }
      ]
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
            <BlacklistSongConfirmPrompt title={title} songIds={[songId]} />
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
}

export function buildSongContextMenuData(
  song: Pick<SongContextMenuInput, 'title' | 'artists' | 'artworkPaths' | 'isAMultipleSelection' | 'isMultipleSelectionEnabled'>,
  services: Pick<SongContextMenuServices, 't'>,
  isCompact: boolean = false
): ContextMenuAdditionalData {
  const state = store.state;
  const currentSelections = state.multipleSelectionsData;
  const isMultiSelectionActive =
    song.isMultipleSelectionEnabled &&
    currentSelections.selectionType === 'songs' &&
    currentSelections.multipleSelections.length !== 1 &&
    song.isAMultipleSelection;

  if (isMultiSelectionActive) {
    return {
      title: services.t('song.selectedSongCount', {
        count: currentSelections.multipleSelections.length
      }),
      artworkPath: isCompact ? undefined : DefaultSongCover
    };
  }

  return {
    title: song.title || services.t('common.unknownTitle'),
    subTitle: song.artists?.map((artist) => artist.name).join(', ') ?? services.t('common.unknownArtist'),
    artworkPath: isCompact ? undefined : (song.artworkPaths?.optimizedArtworkPath || DefaultSongCover)
  };
}
