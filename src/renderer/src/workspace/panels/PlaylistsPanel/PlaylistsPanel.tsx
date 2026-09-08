import type { PlaylistDto } from '@common/collections/dtos';
import { CollectionClient } from '@renderer/api/CollectionClient';
import PlaylistCover from '@renderer/components/PlaylistsPage/PlaylistCover';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import {
  usePinCollection,
  useUnpinCollection
} from '@renderer/hooks/collections/useCollectionMutations';
import { useRootCollections } from '@renderer/hooks/collections/useCollectionQueries';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { lazy, memo, useCallback, useContext, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

const NewPlaylistPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/NewPlaylistPrompt')
);

export const PlaylistsPanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activePlaylistPath = useLocation({
    select: (loc) => (loc.pathname.startsWith('/main-player/playlists/') ? loc.pathname : null)
  });

  const { createQueue, changePromptMenuData } = useContext(AppUpdateContext);
  const { data: playlists = [], isLoading } = useRootCollections();

  const pinMutation = usePinCollection();
  const unpinMutation = useUnpinCollection();

  const [searchQuery, setSearchQuery] = useState('');

  const openNewPlaylistPrompt = useCallback(() => {
    changePromptMenuData(true, <NewPlaylistPrompt currentPlaylists={playlists} />);
  }, [changePromptMenuData, playlists]);

  const filteredPlaylists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, searchQuery]);

  const pinnedPlaylists = useMemo(
    () => filteredPlaylists.filter((p) => p.isPinned),
    [filteredPlaylists]
  );

  const unpinnedPlaylists = useMemo(
    () => filteredPlaylists.filter((p) => !p.isPinned),
    [filteredPlaylists]
  );

  const handlePlaylistClick = useCallback(
    (playlistId: number) => {
      navigate({
        to: '/main-player/playlists/$playlistId',
        params: { playlistId: playlistId.toString() }
      });
    },
    [navigate]
  );

  const handlePlayPlaylist = useCallback(
    (e: React.MouseEvent, playlist: PlaylistDto) => {
      e.stopPropagation();
      CollectionClient.getEntries(playlist.id)
        .then((entries) => {
          const songIds = entries.map((entry) => entry.songId);
          if (songIds.length > 0) {
            createQueue(songIds, 'playlist', false, playlist.id, true, playlist.name);
          }
        })
        .catch((err) => console.error('[PlaylistsPanel] Failed to play playlist:', err));
    },
    [createQueue]
  );

  const handleTogglePin = useCallback(
    (e: React.MouseEvent, playlist: PlaylistDto) => {
      e.stopPropagation();
      if (playlist.isPinned) {
        unpinMutation.mutate({ playlistId: playlist.id });
      } else {
        pinMutation.mutate({ playlistId: playlist.id });
      }
    },
    [pinMutation, unpinMutation]
  );

  const renderPlaylistItem = (playlist: PlaylistDto) => {
    const isCurrentRoute = activePlaylistPath === `/main-player/playlists/${playlist.id}`;

    return (
      <li
        key={playlist.id}
        role="button"
        tabIndex={0}
        onClick={() => handlePlaylistClick(playlist.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlePlaylistClick(playlist.id);
          }
        }}
        title={`${playlist.name} (${playlist.itemCount} ${t('common.songs', 'songs')})`}
        className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-all select-none ${
          isCurrentRoute
            ? 'bg-accent/15 text-accent dark:bg-accent/20 font-medium'
            : 'text-font-color-black dark:text-font-color-white hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
        }`}
      >
        {/* Cover Art / Icon */}
        <div className="bg-background-color-2 dark:bg-dark-background-color-2 relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md shadow-xs">
          {playlist.artworkPath ? (
            <PlaylistCover playlist={playlist} className="h-full w-full object-cover" />
          ) : (
            <span className="material-symbols-rounded text-font-color-dimmed text-base">
              {playlist.playlistType === 'smart' ? 'auto_awesome' : 'queue_music'}
            </span>
          )}

          {/* Quick Play Overlay Button */}
          <button
            type="button"
            onClick={(e) => handlePlayPlaylist(e, playlist)}
            title={t('player.play', 'Play')}
            className="bg-accent/90 absolute inset-0 hidden cursor-pointer items-center justify-center text-white backdrop-blur-[1px] transition-transform group-hover:flex hover:scale-105 active:scale-95"
          >
            <span className="material-symbols-rounded text-base">play_arrow</span>
          </button>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 truncate">
          <p className="truncate text-xs leading-tight font-medium">{playlist.name}</p>
          <span className="text-font-color-dimmed truncate text-[10px] leading-tight">
            {playlist.itemCount} {t('common.songs', 'songs')}
          </span>
        </div>

        {/* Pin action button */}
        <button
          type="button"
          onClick={(e) => handleTogglePin(e, playlist)}
          title={playlist.isPinned ? t('playlist.unpin', 'Unpin') : t('playlist.pin', 'Pin')}
          className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
            playlist.isPinned
              ? 'text-accent opacity-90 hover:opacity-100'
              : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white opacity-0 group-hover:opacity-100'
          }`}
        >
          <span className="material-symbols-rounded text-sm">
            {playlist.isPinned ? 'push_pin' : 'keep'}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="playlists-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-stone-200/50 px-3 py-2 dark:border-stone-800/50">
        <div className="flex items-center justify-between pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-rounded text-accent text-base">
              featured_play_list
            </span>
            <span className="text-xs font-semibold">{t('common.playlist_other', 'Playlists')}</span>
            <span className="text-font-color-dimmed bg-background-color-2/60 dark:bg-dark-background-color-2/60 rounded-full px-1.5 py-0.2 text-[10px]">
              {playlists.length}
            </span>
          </div>

          <button
            type="button"
            onClick={openNewPlaylistPrompt}
            title={t('playlistsPage.createPlaylist', 'Create Playlist')}
            className="hover:bg-background-color-2 text-font-color-dimmed hover:text-font-color-black dark:hover:bg-dark-background-color-2 dark:hover:text-font-color-white flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors"
          >
            <span className="material-symbols-rounded text-base">add</span>
          </button>
        </div>

        {/* Search Filter Input */}
        {playlists.length > 3 && (
          <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 mt-1 flex items-center rounded-md border border-stone-200/60 px-2 py-1 dark:border-stone-800/60">
            <span className="material-symbols-rounded text-font-color-dimmed mr-1.5 text-xs">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search', 'Filter playlists...')}
              className="placeholder:text-font-color-dimmed/60 w-full bg-transparent text-[11px] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-4 w-4 cursor-pointer items-center justify-center"
              >
                <span className="material-symbols-rounded text-xs">close</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Playlists List */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="text-font-color-dimmed flex h-full w-full items-center justify-center p-6 text-center">
            <span className="material-symbols-rounded animate-spin text-2xl">
              progress_activity
            </span>
          </div>
        ) : filteredPlaylists.length === 0 ? (
          <div className="text-font-color-dimmed flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <span className="material-symbols-rounded mb-2 text-3xl opacity-60">
              queue_music
            </span>
            <p className="text-xs">
              {searchQuery
                ? t('searchPage.noResults', 'No playlists match your search')
                : t('playlistsPage.noPlaylists', 'No playlists yet')}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={openNewPlaylistPrompt}
                className="bg-accent mt-3 flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white shadow-xs transition-transform hover:scale-105"
              >
                <span className="material-symbols-rounded text-sm">add</span>
                <span>{t('playlistsPage.createPlaylist', 'Create Playlist')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Pinned Playlists Section */}
            {pinnedPlaylists.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <div className="text-font-color-dimmed flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                  <span className="material-symbols-rounded text-xs">push_pin</span>
                  <span>{t('playlist.pinned', 'Pinned')}</span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {pinnedPlaylists.map(renderPlaylistItem)}
                </ul>
              </div>
            )}

            {/* Unpinned Playlists Section */}
            {unpinnedPlaylists.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {pinnedPlaylists.length > 0 && (
                  <div className="text-font-color-dimmed px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                    <span>{t('common.all', 'All Playlists')}</span>
                  </div>
                )}
                <ul className="flex flex-col gap-0.5">
                  {unpinnedPlaylists.map(renderPlaylistItem)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

PlaylistsPanel.displayName = 'PlaylistsPanel';
export default PlaylistsPanel;
