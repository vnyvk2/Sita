import ErrorBoundary from '@renderer/components/ErrorBoundary';
import LyricsDrawer from '@renderer/components/LyricsPage/LyricsDrawer';
import NotificationPanel from '@renderer/components/NotificationPanel/NotificationPanel';
import { memo, type FC } from 'react';

import WorkspaceToolbar from '../ui/WorkspaceToolbar';
import { WorkspaceController } from './WorkspaceController';

export const WorkspaceFrame: FC = memo(() => {
  return (
    <div className="workspace-frame relative flex h-full w-full flex-col overflow-hidden">
      <ErrorBoundary>
        {/* Global Overlays Layer */}
        <NotificationPanel />
        <LyricsDrawer />

        {/* Workspace Toolbar Controls */}
        <WorkspaceToolbar />

        {/* Dynamic Workspace System Root */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <WorkspaceController />
        </div>
      </ErrorBoundary>
    </div>
  );
});

WorkspaceFrame.displayName = 'WorkspaceFrame';
export default WorkspaceFrame;
