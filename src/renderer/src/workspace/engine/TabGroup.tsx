import { useStore } from '@tanstack/react-store';
import { memo, useCallback, type FC } from 'react';

import { getPanelDefinition, shouldKeepMounted } from '../registry';
import { workspaceActions, workspaceStore } from '../store';
import type { PanelInstanceId, TabGroupNode } from '../types';
import { PanelHost } from './PanelHost';

interface TabGroupProps {
  node: TabGroupNode;
}

export const TabGroup: FC<TabGroupProps> = memo(({ node }) => {
  const panelsMap = useStore(
    workspaceStore,
    (state) => state.workspaces[state.active]?.panels ?? {}
  );

  const handleTabClick = useCallback(
    (panelId: PanelInstanceId) => {
      if (node.active !== panelId) {
        workspaceActions.dispatchOp({
          t: 'tabs.activate',
          tabsId: node.id,
          panelId
        });
      }
    },
    [node.active, node.id]
  );

  const handleCloseTab = useCallback((e: React.MouseEvent, panelId: PanelInstanceId) => {
    e.stopPropagation();
    workspaceActions.dispatchOp({
      t: 'panel.close',
      panelId
    });
  }, []);

  return (
    <div
      data-tabs-id={node.id}
      className="tab-group bg-background-color-1 dark:bg-dark-background-color-1 flex h-full w-full flex-col overflow-hidden"
    >
      {/* Accessible Tab Strip */}
      <div
        role="tablist"
        aria-label="Workspace Tabs"
        className="tab-strip bg-background-color-2/50 dark:bg-dark-background-color-2/50 text-font-color-black dark:text-font-color-white flex h-9 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-stone-200/60 px-2 select-none dark:border-stone-800/60"
      >
        {node.tabs.map((panelId) => {
          const instance = panelsMap[panelId];
          const def = instance ? getPanelDefinition(instance.type) : null;
          const isActive = node.active === panelId;
          const canClose = instance?.type !== 'router-view' && node.tabs.length > 1;

          return (
            <button
              key={panelId}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => handleTabClick(panelId)}
              className={`group flex cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white border-accent border-b-2 shadow-xs'
                  : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
              }`}
            >
              {def && (
                <span className="material-symbols-rounded text-sm opacity-80">{def.icon}</span>
              )}
              <span className="max-w-[120px] truncate">{def?.title ?? panelId}</span>

              {canClose && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleCloseTab(e, panelId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      workspaceActions.dispatchOp({ t: 'panel.close', panelId });
                    }
                  }}
                  title="Close tab"
                  aria-label={`Close tab ${def?.title ?? panelId}`}
                  className="ml-1 flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-80 hover:bg-stone-300 hover:opacity-100 dark:hover:bg-stone-700"
                >
                  <span className="material-symbols-rounded text-[11px]">close</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="tab-content relative min-h-0 flex-1 overflow-hidden">
        {node.tabs.map((panelId) => {
          const isActive = node.active === panelId;
          const instance = panelsMap[panelId];
          const keepMounted = instance ? shouldKeepMounted(instance.type) : false;

          // If active, render visible
          if (isActive) {
            return (
              <div key={panelId} role="tabpanel" className="h-full w-full overflow-hidden">
                <PanelHost panelId={panelId} showHeader={false} />
              </div>
            );
          }

          // If inactive but marked keepMounted (e.g. lyrics sync engine), keep alive in DOM hidden
          if (keepMounted) {
            return (
              <div key={panelId} role="tabpanel" style={{ display: 'none' }} aria-hidden="true">
                <PanelHost panelId={panelId} showHeader={false} />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
});

TabGroup.displayName = 'TabGroup';
