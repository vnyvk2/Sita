import LibraryDiagnosticsPanel from '@renderer/components/Sidebar/LibraryDiagnosticsPanel';
import LibrarySchedulerStatus from '@renderer/components/Sidebar/LibrarySchedulerStatus';
import SideBarItem from '@renderer/components/Sidebar/SideBarItem';
import SidebarPlaylistsSection from '@renderer/components/Sidebar/SidebarPlaylistsSection';
import SidebarResizer from '@renderer/components/Sidebar/SidebarResizer';
import type { AppReducer } from '@renderer/other/appReducer';
import { store } from '@renderer/store/store';
import { linkOptions, useLocation } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

export const NavigationPanel: FC<PanelProps> = memo(() => {
  const visibleSideTabs = useStore(
    store,
    (state: AppReducer) => state.localStorage.preferences?.visibleSideTabs
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

  return (
    <nav className="navigation-panel bg-side-bar-background dark:bg-dark-background-color-2 flex h-full w-full flex-col overflow-hidden">
      {isPlaylistOpened ? (
        <div
          ref={navContainerRef}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {/* Top Section: Navigation Buttons */}
          <ul
            style={{ flex: `0 0 ${splitRatio * 100}%` }}
            className="relative flex min-h-0 flex-col gap-1 overflow-x-hidden overflow-y-auto px-2 py-3"
          >
            {filteredLinkData.map((link) => (
              <SideBarItem
                to={link.to}
                key={link.id}
                parentClassName={link.parentClassName}
                icon={link.icon}
                content={link.content}
              />
            ))}
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
        <ul className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-2 py-3">
          {filteredLinkData.map((link) => (
            <SideBarItem
              to={link.to}
              key={link.id}
              parentClassName={link.parentClassName}
              icon={link.icon}
              content={link.content}
            />
          ))}
        </ul>
      )}
      <div className="shrink-0 border-t border-stone-200/40 p-2 dark:border-stone-800/40">
        <LibrarySchedulerStatus />
        <LibraryDiagnosticsPanel />
      </div>
    </nav>
  );
});

NavigationPanel.displayName = 'NavigationPanel';
export default NavigationPanel;
