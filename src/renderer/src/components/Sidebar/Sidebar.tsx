import { store } from '@renderer/store/store';
import { dndStore, workspaceActions } from '@renderer/workspace/store';
import { linkOptions, useLocation } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const isExperimentalWorkspace = useStore(
    store,
    (state) => state.localStorage.preferences?.isExperimentalWorkspaceEnabled ?? false
  );
  const sidebarMode = useStore(dndStore, (s) => s.sidebarMode);
  const isPinned = useStore(dndStore, (s) => s.isSidebarPinned);
  const isPeeking = useStore(dndStore, (s) => s.isSidebarPeeking);
  const sidebarWidthMode = useStore(dndStore, (s) => s.sidebarWidthMode);
  const isDragging = useStore(dndStore, (s) => s.isDragging);
  const isContextMenuOpen = useStore(
    store,
    (state) =>
      (state.contextMenuData?.isVisible ?? false) || (state.promptMenuData?.isVisible ?? false)
  );
  const showSidebarPlaylistsSection = useStore(
    store,
    (state) => state.localStorage.preferences?.showSidebarPlaylistsSection ?? true
  );

  const { t } = useTranslation();
  const isPlaylistOpened = useLocation({
    select: (loc) =>
      loc.pathname.startsWith('/main-player/playlists/') &&
      loc.pathname !== '/main-player/playlists' &&
      loc.pathname !== '/main-player/playlists/'
  });

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

  const sidebarNavRef = useRef<HTMLElement | null>(null);
  const mouseLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (mouseLeaveTimeoutRef.current) {
      clearTimeout(mouseLeaveTimeoutRef.current);
      mouseLeaveTimeoutRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isExperimentalWorkspace || isPinned || !isPeeking) return;
    if (isDragging || isContextMenuOpen) return;

    if (mouseLeaveTimeoutRef.current) {
      clearTimeout(mouseLeaveTimeoutRef.current);
    }
    mouseLeaveTimeoutRef.current = setTimeout(() => {
      workspaceActions.setSidebarPeeking(false);
    }, 250);
  }, [isExperimentalWorkspace, isPinned, isPeeking, isDragging, isContextMenuOpen]);

  useEffect(() => {
    return () => {
      if (mouseLeaveTimeoutRef.current) {
        clearTimeout(mouseLeaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isExperimentalWorkspace || isPinned || !isPeeking) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (sidebarNavRef.current && sidebarNavRef.current.contains(e.target as Node)) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.('.context-menu') ||
        target?.closest?.('.prompt-menu') ||
        target?.closest?.('[data-radix-portal]')
      ) {
        return;
      }
      workspaceActions.setSidebarPeeking(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        workspaceActions.setSidebarPeeking(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExperimentalWorkspace, isPinned, isPeeking]);

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
      if (link.id === 'Online' && visibleSideTabs?.online === false) return false;
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
          customIcon={'customIcon' in link ? (link.customIcon as React.ReactNode) : undefined}
          content={link.content}
        />
      )),
    [filteredLinkData]
  );

  const bgClass = bodyBackgroundImage
    ? 'bg-side-bar-background/50 dark:bg-dark-background-color-2/50 backdrop-blur-md'
    : 'bg-side-bar-background dark:bg-dark-background-color-2';

  const isVisible = isPinned || isPeeking;
  const isCompact = isExperimentalWorkspace
    ? sidebarWidthMode === 'compact'
    : sidebarMode === 'compact';
  const widthClass =
    sidebarWidthMode === 'compact'
      ? 'w-14 min-w-[3.5rem] max-w-[3.5rem]'
      : 'w-60 min-w-[15rem] max-w-[18rem]';

  const navClassName = isExperimentalWorkspace
    ? !isVisible
      ? `side-bar absolute left-0 top-0 z-50 flex !h-full w-0 min-w-0 max-w-0 shrink-0 grow-0 opacity-0 pointer-events-none overflow-hidden p-0 m-0 border-0 transition-all duration-300 ${bgClass}`
      : isPeeking && !isPinned
        ? `side-bar absolute left-0 top-0 z-50 flex !h-full ${widthClass} shrink-0 grow-0 flex-col rounded-r-2xl shadow-2xl transition-all duration-300 border-r border-stone-200/40 dark:border-stone-800/40 ${bgClass}`
        : `side-bar relative z-20 order-first flex !h-full ${widthClass} shrink-0 grow-0 flex-col rounded-tr-2xl transition-all duration-300 ${bgClass}`
    : `side-bar relative z-20 order-1 flex !h-full w-[30%] !max-w-[18rem] grow flex-col rounded-tr-2xl transition-[width] ${bgClass} delay-200 md:hover:w-60 lg:absolute lg:w-14 lg:hover:w-[30%] lg:hover:shadow-2xl`;

  return (
    <nav
      ref={sidebarNavRef}
      className={navClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ErrorBoundary>
        {isPlaylistOpened && showSidebarPlaylistsSection && !isCompact ? (
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
        {isExperimentalWorkspace && isVisible && (
          <div className="sidebar-collapse-control flex items-center justify-between border-t border-stone-200/40 px-2 py-1.5 dark:border-stone-800/40">
            {sidebarWidthMode === 'expanded' ? (
              <span className="text-font-color-dimmed px-2 text-[10px] font-bold tracking-wider uppercase">
                Sidebar
              </span>
            ) : null}
            <div
              className={`flex items-center gap-1 ${
                sidebarWidthMode === 'compact' ? 'w-full justify-center' : ''
              }`}
            >
              {/* Pin / Unpin Button */}
              <button
                type="button"
                onClick={() => workspaceActions.toggleSidebarPinned()}
                title={
                  isPinned
                    ? 'Unpin sidebar (auto-hides when mouse leaves)'
                    : 'Pin sidebar (keep visible)'
                }
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors ${
                  isPinned
                    ? 'text-accent bg-accent/15 hover:bg-accent/25'
                    : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                }`}
                aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              >
                <span className="material-symbols-rounded text-base">
                  {isPinned ? 'push_pin' : 'keep'}
                </span>
              </button>

              {/* 2-Way Size Toggle (Expanded <-> Compact) */}
              <button
                type="button"
                onClick={() => workspaceActions.toggleSidebarWidth()}
                title={sidebarWidthMode === 'expanded' ? 'Collapse to icon rail' : 'Expand sidebar'}
                className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-stone-200/50 dark:hover:bg-stone-800/50"
                aria-label={
                  sidebarWidthMode === 'expanded' ? 'Collapse to icon rail' : 'Expand sidebar'
                }
              >
                <span className="material-symbols-rounded text-lg">
                  {sidebarWidthMode === 'expanded' ? 'chevron_left' : 'chevron_right'}
                </span>
              </button>
            </div>
          </div>
        )}
        <LibrarySchedulerStatus />
      </ErrorBoundary>
      <LibraryDiagnosticsPanel />
    </nav>
  );
});

Sidebar.displayName = 'Sidebar';
export default Sidebar;
