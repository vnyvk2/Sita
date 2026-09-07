import { useStore } from '@tanstack/react-store';
import { memo, type FC } from 'react';

import { dndStore, workspaceStore } from '../store';
import { NodeView } from './NodeView';
import { PanelHost } from './PanelHost';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';

export const WorkspaceController: FC = memo(() => {
  useWorkspaceShortcuts();

  const activeWorkspace = useStore(workspaceStore, (state) => state.workspaces[state.active]);

  const maximizedPanelId = useStore(dndStore, (state) => state.maximizedPanelId);

  if (!activeWorkspace) {
    return (
      <div className="text-font-color-dimmed flex h-full w-full items-center justify-center p-6 text-sm">
        No active workspace available.
      </div>
    );
  }

  return (
    <div className="workspace-controller relative h-full w-full overflow-hidden">
      {maximizedPanelId ? (
        <div className="maximized-panel-overlay absolute inset-0 z-40 h-full w-full">
          <PanelHost panelId={maximizedPanelId} />
        </div>
      ) : (
        <NodeView node={activeWorkspace.root} />
      )}
    </div>
  );
});

WorkspaceController.displayName = 'WorkspaceController';
