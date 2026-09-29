import { useStore } from '@tanstack/react-store';
import { memo, useEffect, useRef, type FC } from 'react';

import { dndStore, workspaceStore } from '../store';
import { NodeView } from './NodeView';
import { PanelHost } from './PanelHost';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';

export const WorkspaceController: FC = memo(() => {
  useWorkspaceShortcuts();

  const activeWorkspace = useStore(workspaceStore, (state) => state.workspaces[state.active]);

  const maximizedPanelId = useStore(dndStore, (state) => state.maximizedPanelId);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (maximizedPanelId) {
      if (document.activeElement instanceof HTMLElement) {
        lastFocusedRef.current = document.activeElement;
      }
    } else if (lastFocusedRef.current) {
      lastFocusedRef.current.focus?.();
      lastFocusedRef.current = null;
    }
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
      {/* Retain layout tree in DOM during maximize to preserve measurements and scroll offsets (CF-03) */}
      <div
        className={
          maximizedPanelId ? 'pointer-events-none invisible h-full w-full' : 'h-full w-full'
        }
        aria-hidden={Boolean(maximizedPanelId)}
      >
        <NodeView node={activeWorkspace.root} />
      </div>

      {maximizedPanelId && (
        <div className="maximized-panel-overlay bg-background-color-1 dark:bg-dark-background-color-1 absolute inset-0 z-40 h-full w-full">
          <PanelHost panelId={maximizedPanelId} />
        </div>
      )}
    </div>
  );
});

WorkspaceController.displayName = 'WorkspaceController';
