import { SpecialPlaylists } from '@common/playlists.enum';
import type { PlaylistDto } from '@common/collections/dtos';
import type { TFunction } from 'i18next';

import { CollectionClient } from '../../api/CollectionClient';
import { collectionKeys } from '../../api/collectionKeys';
import { rootCollectionsOptions } from '../../hooks/collections/useCollectionQueries';
import { songPlaylistsQuery } from '../../queries/songPlaylists';
import { queryClient } from '../../queryClient';

interface BuildSongPlaylistMenuParams {
  songIds: number[];
  title?: string;
  t: TFunction;
  addNewNotifications: (notifications: AppNotification[]) => void;
  changePromptMenuData: (open: boolean, content?: React.ReactNode) => void;
  toggleMultipleSelections?: (enabled: boolean) => void;
}

/**
 * Builds an on-demand MusicBee-style "Include in Playlist" context menu item with submenus. Single
 * song: renders checkboxes indicating membership and toggles membership on click. Multi-song:
 * renders playlist options to add all selected songs to that playlist.
 */
export async function buildSongPlaylistMenuItem(
  params: BuildSongPlaylistMenuParams
): Promise<ContextMenuItem> {
  const { songIds, title, t, addNewNotifications, changePromptMenuData, toggleMultipleSelections } =
    params;

  // 1. Fetch user-created root playlists (cached globally by TanStack Query)
  let playlists: PlaylistDto[] = [];
  try {
    playlists = await queryClient.ensureQueryData(rootCollectionsOptions('aToZ'));
  } catch (err) {
    console.error('Failed to fetch playlists for context menu', err);
  }

  const userPlaylists = (playlists || []).filter(
    (p) => !SpecialPlaylists.isSpecialPlaylistId(p.id)
  );

  const isSingleSong = songIds.length === 1;
  const singleSongId = songIds[0];

  // 2. If single song, fetch its playlist membership lazily
  let memberPlaylistIds: number[] = [];
  if (isSingleSong && singleSongId !== undefined) {
    try {
      memberPlaylistIds = await queryClient.ensureQueryData(
        songPlaylistsQuery.membership(singleSongId)
      );
    } catch (err) {
      console.error('Failed to fetch song playlist membership', err);
    }
  }

  // 3. Build inner submenu items
  const innerContextMenus: ContextMenuItem[] = userPlaylists.map((playlist) => {
    const isIncluded = isSingleSong && memberPlaylistIds.includes(playlist.id);

    return {
      label: playlist.name,
      iconName: isSingleSong
        ? isIncluded
          ? 'check_box'
          : 'check_box_outline_blank'
        : 'playlist_add',
      iconClassName: isSingleSong
        ? isIncluded
          ? 'material-icons-round text-font-color-highlight dark:text-dark-background-color-3'
          : 'material-icons-round-outlined opacity-60'
        : 'material-icons-round-outlined opacity-60',
      handlerFunction: async () => {
        if (toggleMultipleSelections) toggleMultipleSelections(false);

        if (isSingleSong && singleSongId !== undefined) {
          const nextIncluded = !isIncluded;

          // Optimistically update single-song membership in React Query cache
          queryClient.setQueryData<number[]>(
            songPlaylistsQuery.membership(singleSongId).queryKey,
            (old = []) =>
              nextIncluded ? [...old, playlist.id] : old.filter((id) => id !== playlist.id)
          );

          try {
            if (isIncluded) {
              const entries = await CollectionClient.getEntries(playlist.id);
              const matchingEntries = entries.filter((e) => e.songId === singleSongId);
              if (matchingEntries.length > 0) {
                await CollectionClient.removeSongs({
                  playlistId: playlist.id,
                  entryIds: matchingEntries.map((e) => e.id)
                });
              }
              addNewNotifications([
                {
                  id: `removed-from-${playlist.id}-${singleSongId}`,
                  iconName: 'playlist_remove',
                  duration: 4000,
                  content: t('notifications.songRemovedFromPlaylist', {
                    title: title || 'Song',
                    playlist: playlist.name,
                    defaultValue: `Removed "${title || 'Song'}" from "${playlist.name}"`
                  })
                }
              ]);
            } else {
              await CollectionClient.addSongs({
                playlistId: playlist.id,
                songIds: [singleSongId]
              });
              addNewNotifications([
                {
                  id: `added-to-${playlist.id}-${singleSongId}`,
                  iconName: 'playlist_add',
                  duration: 4000,
                  content: t('notifications.songAddedToPlaylist', {
                    title: title || 'Song',
                    playlist: playlist.name,
                    defaultValue: `Added "${title || 'Song'}" to "${playlist.name}"`
                  })
                }
              ]);
            }
          } catch (err) {
            console.error('Failed to toggle playlist membership:', err);
            // Rollback optimistic cache update on error
            queryClient.setQueryData<number[]>(
              songPlaylistsQuery.membership(singleSongId).queryKey,
              (old = []) =>
                isIncluded ? [...old, playlist.id] : old.filter((id) => id !== playlist.id)
            );
            addNewNotifications([
              {
                id: `playlist-toggle-error-${playlist.id}`,
                iconName: 'error',
                duration: 5000,
                content: t('notifications.playlistUpdateFailed', {
                  defaultValue: 'Failed to update playlist.'
                })
              }
            ]);
          } finally {
            // Invalidate this song's playlist membership cache as well as playlist detail/entries
            queryClient.invalidateQueries({
              queryKey: songPlaylistsQuery.membership(singleSongId).queryKey
            });
            queryClient.invalidateQueries({ queryKey: collectionKeys.detail(playlist.id) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.entries(playlist.id) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.children(null) });
          }
        } else {
          // Multi-selection: add all selected songs to this playlist
          try {
            await CollectionClient.addSongs({
              playlistId: playlist.id,
              songIds
            });
            addNewNotifications([
              {
                id: `added-multi-to-${playlist.id}`,
                iconName: 'playlist_add',
                duration: 4000,
                content: t('addSongsToPlaylistsPrompt.songsAddedToPlaylists', {
                  count: songIds.length,
                  playlistCount: 1,
                  defaultValue: `Added ${songIds.length} songs to "${playlist.name}"`
                })
              }
            ]);
            // Invalidate membership for all affected songs
            for (const id of songIds) {
              queryClient.invalidateQueries({
                queryKey: songPlaylistsQuery.membership(id).queryKey
              });
            }
            queryClient.invalidateQueries({ queryKey: collectionKeys.detail(playlist.id) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.entries(playlist.id) });
            queryClient.invalidateQueries({ queryKey: collectionKeys.children(null) });
          } catch (err) {
            console.error('Failed to add multiple songs to playlist:', err);
          }
        }
      }
    };
  });

  // Add separator and "More options..." dialog prompt
  innerContextMenus.push(
    {
      label: 'Hr',
      isContextMenuItemSeperator: true,
      handlerFunction: null
    },
    {
      label: t('song.addToPlaylistsPrompt', { defaultValue: 'More options...' }),
      iconName: 'playlist_add_circle',
      handlerFunction: async () => {
        const { default: AddSongsToPlaylistsPrompt } = await import('./AddSongsToPlaylistsPrompt');
        changePromptMenuData(true, <AddSongsToPlaylistsPrompt songIds={songIds} title={title} />);
        if (toggleMultipleSelections) toggleMultipleSelections(false);
      }
    }
  );

  return {
    label: t('song.includeInPlaylist', { defaultValue: 'Include in Playlist' }),
    iconName: 'playlist_add',
    innerContextMenus,
    handlerFunction: null
  };
}
