import type { PlaylistDto } from '@common/collections/dtos';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useRootCollections } from '@renderer/hooks/collections/useCollectionQueries';
import { Link, useLocation } from '@tanstack/react-router';
import { Suspense, lazy, memo, useCallback, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import PlaylistCover from '../PlaylistsPage/PlaylistCover';

const NewPlaylistPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/NewPlaylistPrompt')
);

interface SidebarPlaylistsSectionProps {
  className?: string;
}

export const SidebarPlaylistsSection = memo(({ className = '' }: SidebarPlaylistsSectionProps) => {
  const { t } = useTranslation();
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { pathname } = useLocation();

  const { data: playlists = [] } = useRootCollections();

  const pinnedPlaylists = useMemo(() => playlists.filter((p) => p.isPinned), [playlists]);

  const unpinnedPlaylists = useMemo(() => playlists.filter((p) => !p.isPinned), [playlists]);

  const openNewPlaylistPrompt = useCallback(() => {
    changePromptMenuData(true, <NewPlaylistPrompt currentPlaylists={playlists} />);
  }, [changePromptMenuData, playlists]);

  const renderPlaylistItem = useCallback(
    (playlist: PlaylistDto) => {
      const targetPath = `/main-player/playlists/${playlist.id}`;
      const isActive = pathname === targetPath;

      return (
        <Link
          key={playlist.id}
          to="/main-player/playlists/$playlistId"
          params={{ playlistId: playlist.id.toString() }}
          title={`${playlist.name} (${playlist.itemCount} ${t('common.songs', 'songs')})`}
          className={`group/item hover:bg-background-color-1 dark:hover:bg-dark-background-color-1 flex h-10 w-[95%] min-w-[3rem] shrink-0 cursor-pointer items-center rounded-r-2xl bg-transparent pr-2 pl-3.5 outline-offset-2 transition-all duration-200 ${
            isActive
              ? 'bg-background-color-3! dark:bg-dark-background-color-3! text-font-color-black! font-semibold shadow-sm'
              : 'text-font-color-black/80 dark:text-font-color-white/80'
          }`}
        >
          {/* Cover Artwork or Fallback Icon */}
          <div className="bg-background-color-2 dark:bg-dark-background-color-1 relative mr-3.5 flex h-7 w-7 min-w-[1.75rem] shrink-0 items-center justify-center overflow-hidden rounded-md shadow-xs">
            {playlist.artworkPath ? (
              <PlaylistCover playlist={playlist} className="h-full w-full object-cover" />
            ) : (
              <span className="material-icons-round text-font-color-black/60 dark:text-font-color-white/60 group-hover/item:text-font-color-black dark:group-hover/item:text-font-color-white text-lg leading-none">
                {playlist.playlistType === 'smart' ? 'auto_awesome' : 'queue_music'}
              </span>
            )}
          </div>

          {/* Playlist Info (Visible on Sidebar Hover) */}
          <div className="flex min-w-0 flex-1 items-center justify-between overflow-hidden">
            <div className="flex min-w-0 flex-col overflow-hidden">
              <span className="truncate text-sm leading-tight font-medium">{playlist.name}</span>
              <span className="text-font-color-black/50 dark:text-font-color-white/50 truncate text-[11px] leading-tight">
                {playlist.itemCount} {t('common.songs', 'songs')}
              </span>
            </div>

            {playlist.isPinned && (
              <span
                className="material-icons-round text-font-color-black/40 dark:text-font-color-white/40 ml-1 shrink-0 text-sm"
                title={t('playlist.pinned', 'Pinned')}
              >
                push_pin
              </span>
            )}
          </div>
        </Link>
      );
    },
    [pathname, t]
  );

  return (
    <div
      className={`sidebar-playlists-section relative flex min-h-0 flex-1 flex-col overflow-x-hidden ${className}`}
    >
      {/* Header Bar */}
      <div className="text-font-color-black/50 dark:text-font-color-white/50 flex h-8 shrink-0 items-center justify-between px-4 text-xs font-semibold tracking-wider uppercase select-none">
        <span className="truncate">{t('common.playlist_other', 'Playlists')}</span>
        <button
          type="button"
          onClick={openNewPlaylistPrompt}
          title={t('playlistsPage.createPlaylist', 'Create Playlist')}
          className="hover:bg-background-color-1 text-font-color-black/70 hover:text-font-color-black dark:text-font-color-white/70 dark:hover:bg-dark-background-color-1 dark:hover:text-font-color-white flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-colors"
        >
          <span className="material-icons-round text-base leading-none">add</span>
        </button>
      </div>

      {/* Scrollable Playlists Container */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto pt-1 pb-2">
        {/* Empty State */}
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <span className="material-icons-round text-font-color-black/30 dark:text-font-color-white/30 mb-1 text-2xl">
              playlist_add
            </span>
            <button
              type="button"
              onClick={openNewPlaylistPrompt}
              className="bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 mt-2 flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-xs hover:opacity-90"
            >
              <span className="material-icons-round text-sm">add</span>
              <span>{t('playlistsPage.createPlaylist', 'Create Playlist')}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Pinned Playlists Group */}
            {pinnedPlaylists.length > 0 && (
              <div className="mb-2 flex flex-col gap-0.5">
                <div className="text-font-color-black/40 dark:text-font-color-white/40 px-4 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none">
                  {t('playlist.pinned', 'Pinned')}
                </div>
                {pinnedPlaylists.map(renderPlaylistItem)}
              </div>
            )}

            {/* Other / All Playlists Group */}
            {unpinnedPlaylists.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {pinnedPlaylists.length > 0 && (
                  <div className="text-font-color-black/40 dark:text-font-color-white/40 px-4 py-0.5 text-[10px] font-bold tracking-wider uppercase select-none">
                    {t('common.allPlaylists', 'All Playlists')}
                  </div>
                )}
                {unpinnedPlaylists.map(renderPlaylistItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

SidebarPlaylistsSection.displayName = 'SidebarPlaylistsSection';
export default SidebarPlaylistsSection;
