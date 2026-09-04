import { store } from '@renderer/store/store';
import { linkOptions, useLocation } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ErrorBoundary from '../ErrorBoundary';
import LibraryDiagnosticsPanel from './LibraryDiagnosticsPanel';
import LibrarySchedulerStatus from './LibrarySchedulerStatus';
import SideBarItem from './SideBarItem';
import SidebarPlaylistsSection from './SidebarPlaylistsSection';
import SidebarResizer from './SidebarResizer';

const Sidebar = memo(() => {
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);
  const visibleSideTabs = useStore(
    store,
    (state) => state.localStorage.preferences?.visibleSideTabs
  );

  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isPlaylistOpened = useMemo(() => {
    return (
      pathname.startsWith('/main-player/playlists/') &&
      pathname !== '/main-player/playlists' &&
      pathname !== '/main-player/playlists/'
    );
  }, [pathname]);

  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nora:sidebar-playlist-split-ratio');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.2 && parsed <= 0.8) return parsed;
      }
    } catch {
      // ignore
    }
    return 0.5;
  });

  const [isMovableActive, setIsMovableActive] = useState<boolean>(false);
  const navContainerRef = useRef<HTMLDivElement | null>(null);

  const handleResize = useCallback((newRatio: number) => {
    setSplitRatio(newRatio);
    try {
      localStorage.setItem('nora:sidebar-playlist-split-ratio', newRatio.toFixed(3));
    } catch {
      // ignore
    }
  }, []);

  const handleReset = useCallback(() => {
    setSplitRatio(0.5);
    try {
      localStorage.setItem('nora:sidebar-playlist-split-ratio', '0.5');
    } catch {
      // ignore
    }
  }, []);

  const toggleMovable = useCallback(() => {
    setIsMovableActive((prev) => !prev);
  }, []);

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
          icon: 'style',
          content: t('common.genre_other'),
          isActive: false
        },
        {
          to: '/main-player/insights',
          id: 'Insights',
          parentClassName: 'insights',
          icon: 'auto_graph',
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
        {isPlaylistOpened ? (
          <div
            ref={navContainerRef}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {/* Top Section: Navigation Buttons */}
            <ul
              style={{ flex: `0 0 ${splitRatio * 100}%` }}
              className="relative flex min-h-0 flex-col gap-1 overflow-x-hidden overflow-y-auto pt-4 pb-1"
            >
              {sideBarItems}
            </ul>

            {/* Movable Divider (Diagram 3) */}
            <SidebarResizer
              containerRef={navContainerRef}
              onResize={handleResize}
              onReset={handleReset}
              isMovableActive={isMovableActive}
              onToggleMovable={toggleMovable}
            />

            {/* Bottom Section: Playlists (Diagram 2/3) */}
            <SidebarPlaylistsSection className="min-h-0 flex-1" />
          </div>
        ) : (
          <ul className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden pt-4 pb-2">
            {sideBarItems}
          </ul>
        )}
        <LibrarySchedulerStatus />
      </ErrorBoundary>
      <LibraryDiagnosticsPanel />
    </nav>
  );
});

Sidebar.displayName = 'Sidebar';
export default Sidebar;
