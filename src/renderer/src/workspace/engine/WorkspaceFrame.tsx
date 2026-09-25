import ErrorBoundary from '@renderer/components/ErrorBoundary';
import LyricsDrawer from '@renderer/components/LyricsPage/LyricsDrawer';
import NotificationPanel from '@renderer/components/NotificationPanel/NotificationPanel';
import Sidebar from '@renderer/components/Sidebar/Sidebar';
import { useStore } from '@tanstack/react-store';
import { memo, type FC } from 'react';

import { dndStore, workspaceActions } from '../store';
import WorkspaceToolbar from '../ui/WorkspaceToolbar';
import { WorkspaceController } from './WorkspaceController';

export const WorkspaceFrame: FC = memo(() => {
  const sidebarMode = useStore(dndStore, (s) => s.sidebarMode);

  return (
    <div className="workspace-frame relative flex h-full w-full flex-col overflow-hidden">
      <ErrorBoundary>
        {/* Global Overlays Layer */}
        <NotificationPanel />
        <LyricsDrawer />

        {/* Workspace Toolbar Controls */}
        <WorkspaceToolbar />

        {/* Dynamic Workspace System Root with Native Persistent Sidebar */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />

          {/* Floating Edge Uncollapse Button when Sidebar is fully hidden */}
          {sidebarMode === 'hidden' && (
            <button
              type="button"
              onClick={() => workspaceActions.setSidebarMode('expanded')}
              title="Expand Sidebar (Click to show)"
              aria-label="Expand Sidebar"
              className="group absolute top-1/2 left-0 z-40 flex -translate-y-1/2 cursor-pointer items-center gap-1 rounded-r-xl border border-l-0 border-accent/60 bg-background-color-1/95 py-3.5 pr-2.5 pl-1.5 text-accent shadow-2xl backdrop-blur-md transition-all hover:bg-accent hover:text-white dark:border-accent/60 dark:bg-dark-background-color-1/95"
            >
              <span className="material-symbols-rounded text-lg transition-transform group-hover:scale-125">
                chevron_right
              </span>
              <span className="max-w-0 overflow-hidden text-[10px] font-bold tracking-wider uppercase opacity-0 transition-all duration-200 group-hover:max-w-xs group-hover:opacity-100">
                Sidebar
              </span>
            </button>
          )}

          <div className="relative order-2 min-h-0 flex-1 overflow-hidden">
            <WorkspaceController />
          </div>
        </div>
      </ErrorBoundary>
    </div>
  );
});

WorkspaceFrame.displayName = 'WorkspaceFrame';
export default WorkspaceFrame;
