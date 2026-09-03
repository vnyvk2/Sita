import ErrorBoundary from '@renderer/components/ErrorBoundary';
import LyricsDrawer from '@renderer/components/LyricsPage/LyricsDrawer';
import NotificationPanel from '@renderer/components/NotificationPanel/NotificationPanel';
import { memo, type FC } from 'react';

import { WorkspaceController } from './WorkspaceController';

export const WorkspaceFrame: FC = memo(() => {
  return (
    <div className="workspace-frame relative flex h-full w-full overflow-hidden">
      <ErrorBoundary>
        {/* Global Overlays Layer */}
        <NotificationPanel />
        <LyricsDrawer />

        {/* Dynamic Workspace System Root */}
        <WorkspaceController />
      </ErrorBoundary>
    </div>
  );
});

WorkspaceFrame.displayName = 'WorkspaceFrame';
export default WorkspaceFrame;
