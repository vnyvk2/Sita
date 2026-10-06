import { useStore } from '@tanstack/react-store';
import { memo, useContext, useState, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useContextMenu } from '../../hooks/useContextMenu';
import { dndStore, workspaceActions } from '../store';
import type { PanelInstanceId, PanelType } from '../types';
import { DropOverlay } from './DropOverlay';
import {
  PanelHeaderSetterContext,
  TabActionsContext,
  type PanelHeaderFragment
} from './PanelHeaderContext';
import { usePanelDragDrop } from './usePanelDragDrop';

const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="tab"], [role="slider"], [contenteditable], summary, [data-no-drag]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

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
    const { updateContextMenuData } = useContextMenu();
    const [fragment, setFragment] = useState<PanelHeaderFragment | null>(null);
    const tabActions = useContext(TabActionsContext);

    const handleClose = (): void => {
      if (type !== 'router-view') {
        workspaceActions.dispatchOp({ t: 'panel.close', panelId });
      }
    };

    // Gesture guards: header = move, buttons = buttons
    const handleHeaderPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
      if (isInteractiveTarget(e.target)) return;
      if (isMaximized) return;
      handlePointerDown(e);
    };

    const handleHeaderDoubleClick = (e: React.MouseEvent): void => {
      if (isInteractiveTarget(e.target)) return;
      workspaceActions.toggleMaximizePanel(panelId);
    };

    const handleMaximizeClick = (e: React.MouseEvent): void => {
      e.stopPropagation();
      workspaceActions.toggleMaximizePanel(panelId);
    };

    // One menu, two triggers: onContextMenu + caret button
    const buildHeaderMenu = (): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [
        {
          label: isMaximized ? 'Restore Panel' : 'Maximize Panel',
          iconName: isMaximized ? 'close_fullscreen' : 'open_in_full',
          handlerFunction: () => workspaceActions.toggleMaximizePanel(panelId)
        }
      ];

      if (fragment?.menu) {
        const customItems = fragment.menu();
        for (const item of customItems) {
          items.push({
            label: item.label,
            iconName: item.icon || 'more_horiz',
            handlerFunction: item.handler
          });
        }
      }

      if (canClose && type !== 'router-view') {
        items.push({
          label: 'Close Panel',
          iconName: 'close',
          handlerFunction: handleClose
        });
      }
      return items;
    };

    const openHeaderMenu = (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      // Clamp near viewport edges so menu never renders off-screen
      const menuWidth = 220;
      const menuHeight = 240;
      const x = Math.max(8, Math.min(e.pageX, window.innerWidth - menuWidth - 8));
      const y = Math.max(8, Math.min(e.pageY + 12, window.innerHeight - menuHeight - 8));
      updateContextMenuData(true, buildHeaderMenu(), x, y);
    };

    const portalToTabStrip =
      !showHeader && fragment && tabActions.target && tabActions.activePanelId === panelId
        ? createPortal(
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              {fragment.info && (
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  {fragment.info}
                </div>
              )}
              {fragment.actions && (
                <div className="flex shrink-0 items-center gap-1">{fragment.actions}</div>
              )}
            </div>,
            tabActions.target
          )
        : null;

    // Misuse guard: showHeader=false is only honored inside a TabGroup provider.
    // Standalone use silently drops the fragment, so warn in dev instead.
    if (
      import.meta.env.DEV &&
      !showHeader &&
      fragment &&
      tabActions.target === null &&
      tabActions.activePanelId === null
    ) {
      console.warn(
        `[PanelFrame:${panelId}] showHeader=false outside a TabGroup drops header actions. ` +
          `Render inside TabGroup or use showHeader instead.`
      );
    }

    return (
      <div
        data-panel-id={panelId}
        data-panel-type={type}
        data-node-id={showHeader ? panelId : undefined}
        className={`panel-frame bg-background-color-1 dark:bg-dark-background-color-1 relative flex h-full w-full flex-col overflow-hidden ${
          isMaximized ? 'z-40' : ''
        }`}
      >
        {showHeader && <DropOverlay nodeId={panelId} />}

        {showHeader && (
          <header
            onDoubleClick={handleHeaderDoubleClick}
            onPointerDown={handleHeaderPointerDown}
            onContextMenu={openHeaderMenu}
            className={`panel-header group bg-background-color-2/40 dark:bg-dark-background-color-2/40 text-font-color-black dark:text-font-color-white flex h-7 shrink-0 items-center justify-between border-b border-stone-200/60 px-2 select-none dark:border-stone-800/60 ${
              isMaximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
            }`}
          >
            {/* Left: Identity */}
            <div className="flex shrink-0 items-center gap-1">
              <span className="material-symbols-rounded text-font-color-dimmed text-xs">
                {icon}
              </span>
              <span className="text-font-color-dimmed max-w-[140px] truncate text-[10px] font-semibold tracking-wider uppercase">
                {title}
              </span>
              <button
                type="button"
                onClick={openHeaderMenu}
                aria-haspopup="menu"
                title="Panel options"
                className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-stone-200 dark:hover:bg-stone-700"
              >
                <span className="material-symbols-rounded text-[14px]">expand_more</span>
              </button>
            </div>

            {/* Middle: Panel-contributed info */}
            <div className="text-font-color-dimmed mx-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {fragment?.info}
            </div>

            {/* Right: Panel actions + Frame controls */}
            <div className="flex shrink-0 items-center gap-1">
              {fragment?.actions}
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={handleMaximizeClick}
                  title={isMaximized ? 'Restore Panel (Ctrl+Alt+M)' : 'Maximize Panel (Ctrl+Alt+M)'}
                  aria-label={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
                  className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  <span className="material-symbols-rounded text-[12px]">
                    {isMaximized ? 'close_fullscreen' : 'open_in_full'}
                  </span>
                </button>
                {canClose && type !== 'router-view' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose();
                    }}
                    title="Close Panel"
                    aria-label="Close Panel"
                    className="text-font-color-dimmed flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400"
                  >
                    <span className="material-symbols-rounded text-[12px]">close</span>
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        <main className="panel-content relative min-h-0 flex-1 overflow-hidden">
          <PanelHeaderSetterContext.Provider value={setFragment}>
            {children}
          </PanelHeaderSetterContext.Provider>
        </main>

        {portalToTabStrip}
      </div>
    );
  }
);

PanelFrame.displayName = 'PanelFrame';
