import { useStore } from '@tanstack/react-store';
import { memo, useEffect, type FC } from 'react';

import { dndStore, workspaceActions, workspaceStore } from '../store';
import { NodeView } from './NodeView';
import { PanelHost } from './PanelHost';

export const WorkspaceController: FC = memo(() => {
  const activeWorkspace = useStore(workspaceStore, (state) => state.workspaces[state.active]);

  const maximizedPanelId = useStore(dndStore, (state) => state.maximizedPanelId);

  // Esc key restores from maximized panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && maximizedPanelId) {
        workspaceActions.setMaximizedPanel(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [maximizedPanelId]);

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
