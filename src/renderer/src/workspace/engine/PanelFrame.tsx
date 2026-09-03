import { useStore } from '@tanstack/react-store';
import { memo, type FC, type ReactNode } from 'react';

import { dndStore, workspaceActions } from '../store';
import type { PanelInstanceId, PanelType } from '../types';
import { DropOverlay } from './DropOverlay';
import { usePanelDragDrop } from './usePanelDragDrop';

interface PanelFrameProps {
  panelId: PanelInstanceId;
  type: PanelType;
  title: string;
  icon: string;
  canClose?: boolean;
  showHeader?: boolean;
  children: ReactNode;
}

export const PanelFrame: FC<PanelFrameProps> = memo(
  ({ panelId, type, title, icon, canClose = true, showHeader = true, children }) => {
    const isMaximized = useStore(dndStore, (s) => s.maximizedPanelId === panelId);
    const { handlePointerDown } = usePanelDragDrop(panelId);

    const handleHeaderDoubleClick = (): void => {
      workspaceActions.toggleMaximizePanel(panelId);
    };

    const handleMaximizeClick = (e: React.MouseEvent): void => {
      e.stopPropagation();
      workspaceActions.toggleMaximizePanel(panelId);
    };

    const handleCloseClick = (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (type !== 'router-view') {
        workspaceActions.dispatchOp({ t: 'panel.close', panelId });
      }
    };

    return (
      <div
        data-panel-id={panelId}
        data-panel-type={type}
        data-node-id={panelId}
        className={`panel-frame bg-background-color-1 dark:bg-dark-background-color-1 relative flex h-full w-full flex-col overflow-hidden ${
          isMaximized ? 'z-40' : ''
        }`}
      >
        <DropOverlay nodeId={panelId} />

        {showHeader && (
          <header
            onDoubleClick={handleHeaderDoubleClick}
            onPointerDown={handlePointerDown}
            className="panel-header group bg-background-color-2/40 dark:bg-dark-background-color-2/40 text-font-color-black dark:text-font-color-white flex h-8 shrink-0 cursor-grab items-center justify-between border-b border-stone-200/60 px-3 select-none active:cursor-grabbing dark:border-stone-800/60"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="material-symbols-rounded text-font-color-dimmed text-sm">
                {icon}
              </span>
              <span className="text-font-color-dimmed truncate text-xs font-semibold tracking-wider uppercase">
                {title}
              </span>
            </div>

            <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={handleMaximizeClick}
                title={isMaximized ? 'Restore Panel (Ctrl+Alt+M)' : 'Maximize Panel (Ctrl+Alt+M)'}
                aria-label={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
                className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-stone-200 dark:hover:bg-stone-700"
              >
                <span className="material-symbols-rounded text-xs">
                  {isMaximized ? 'close_fullscreen' : 'open_in_full'}
                </span>
              </button>

              {canClose && type !== 'router-view' && (
                <button
                  type="button"
                  onClick={handleCloseClick}
                  title="Close Panel (Ctrl+W)"
                  aria-label="Close Panel"
                  className="text-font-color-dimmed flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400"
                >
                  <span className="material-symbols-rounded text-xs">close</span>
                </button>
              )}
            </div>
          </header>
        )}

        <main className="panel-content relative min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }
);

PanelFrame.displayName = 'PanelFrame';
