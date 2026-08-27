import { store } from '@renderer/store/store';
import { linkOptions } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ErrorBoundary from '../ErrorBoundary';
import InsightsIcon from './InsightsIcon';
import LibraryDiagnosticsPanel from './LibraryDiagnosticsPanel';
import LibrarySchedulerStatus from './LibrarySchedulerStatus';
import SideBarItem from './SideBarItem';

const Sidebar = memo(() => {
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);
  const visibleSideTabs = useStore(
    store,
    (state) => state.localStorage.preferences?.visibleSideTabs
  );

  const { t } = useTranslation();

  const linkData = useMemo(
    () =>
      linkOptions([
        {
          to: '/main-player/home',
          id: 'Home',
          parentClassName: 'home',
          icon: 'home',
          content: t('sideBar.home'),
          isActive: true
        },
        {
          to: '/main-player/search',
          id: 'Search',
          parentClassName: 'search',
          icon: 'search',
          content: t('sideBar.search'),
          isActive: false
        },
        {
          to: '/main-player/online',
          id: 'Online',
          parentClassName: 'online',
          icon: 'cloud_download',
          content: t('sideBar.online', { defaultValue: 'Online' }),
          isActive: false
        },
        {
          to: '/main-player/songs',
          id: 'Songs',
          parentClassName: 'songs',
          icon: 'music_note',
          content: t('common.song_other'),
          isActive: false
        },
        {
          to: '/main-player/playlists',
          id: 'Playlists',
          parentClassName: 'playlists',
          icon: 'queue_music',
          content: t('common.playlist_other'),
          isActive: false
        },
        {
          to: '/main-player/folders',
          id: 'Folders',
          parentClassName: 'folders',
          icon: 'folder',
          content: t('common.folder_other'),
          isActive: false
        },
        {
          to: '/main-player/artists',
          id: 'Artists',
          parentClassName: 'artists',
          icon: 'people',
          content: t('common.artist_other'),
          isActive: false
        },
        {
          to: '/main-player/albums',
          id: 'Albums',
          parentClassName: 'albums',
          icon: 'album',
          content: t('common.album_other'),
          isActive: false
        },
        {
          to: '/main-player/genres',
          id: 'Genres',
          parentClassName: 'genres',
          icon: 'track_changes',
          content: t('common.genre_other'),
          isActive: false
        },
        {
          to: '/main-player/insights',
          id: 'Insights',
          parentClassName: 'insights',
          icon: 'auto_graph',
          customIcon: <InsightsIcon className="mr-5" />,
          content: t('sideBar.insights', { defaultValue: 'Insights' }),
          isActive: false
        },
        {
          to: '/main-player/settings',
          id: 'Settings',
          parentClassName: 'settings',
          icon: 'settings',
          content: t('settingsPage.settings'),
          isActive: false
        }
      ]),
    [t]
  );

  const filteredLinkData = useMemo(() => {
    return linkData.filter((link) => {
      if (link.id === 'Folders' && visibleSideTabs?.folders === false) return false;
      if (link.id === 'Artists' && visibleSideTabs?.artists === false) return false;
      if (link.id === 'Albums' && visibleSideTabs?.albums === false) return false;
      if (link.id === 'Genres' && visibleSideTabs?.genres === false) return false;
      if (link.id === 'Insights' && visibleSideTabs?.insights === false) return false;
      return true;
    });
  }, [linkData, visibleSideTabs]);

  const sideBarItems = useMemo(
    () =>
      filteredLinkData.map((link) => (
        <SideBarItem
          to={link.to}
          key={link.id}
          parentClassName={link.parentClassName}
          icon={link.icon}
          customIcon={'customIcon' in link ? link.customIcon : undefined}
          content={link.content}
        />
      )),
    [filteredLinkData]
  );

  return (
    <nav
      className={`side-bar relative z-20 order-1 flex !h-full w-[30%] !max-w-[18rem] grow flex-col rounded-tr-2xl transition-[width] ${
        bodyBackgroundImage
          ? 'bg-side-bar-background/50 dark:bg-dark-background-color-2/50 backdrop-blur-md'
          : 'bg-side-bar-background dark:bg-dark-background-color-2'
      } delay-200 md:hover:w-60 lg:absolute lg:w-14 lg:hover:w-[30%] lg:hover:shadow-2xl`}
    >
      <ErrorBoundary>
        <ul className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden pt-4 pb-2">
          {sideBarItems}
        </ul>
        <LibrarySchedulerStatus />
      </ErrorBoundary>
      <LibraryDiagnosticsPanel />
    </nav>
  );
});

Sidebar.displayName = 'Sidebar';
export default Sidebar;
