import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_PRESET } from '../presets/default';
import { MUSICBEE_PRESET } from '../presets/musicbee';
import { PANEL_DEFINITIONS, getMountedPanelTypes } from '../registry';
import { workspaceActions, workspaceStore } from '../store';
import type { PanelType } from '../types';

export const WorkspaceToolbar: FC = memo(() => {
  const { t } = useTranslation();
  const [isPanelMenuOpen, setIsPanelMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeId = useStore(workspaceStore, (s) => s.active);
  const workspaces = useStore(workspaceStore, (s) => s.workspaces);
  const activeWs = workspaces[activeId];

  const mountedTypes = activeWs ? getMountedPanelTypes(activeWs) : new Set<PanelType>();

  const handleSwitchWorkspace = (id: string) => {
    workspaceActions.switchWorkspace(id);
  };

  const handleAddPanel = useCallback(
    (type: PanelType) => {
      if (!activeWs) return;

      const routerPanel = Object.values(activeWs.panels).find((p) => p.type === 'router-view');
      const targetPanelId = routerPanel ? routerPanel.id : Object.keys(activeWs.panels)[0];

      workspaceActions.dispatchOp({
        t: 'panel.insert',
        type,
        at: {
          k: 'split-into',
          targetPanelId,
          axis: 'x',
          before: false
        }
      });
      setIsPanelMenuOpen(false);
    },
    [activeWs]
  );

  const handleResetLayout = useCallback(() => {
    const defaultPreset = activeId === MUSICBEE_PRESET.id ? MUSICBEE_PRESET : DEFAULT_PRESET;
    workspaceActions.dispatchOp({
      t: 'ws.reset',
      id: activeId,
      defaultPreset
    });
  }, [activeId]);

  if (!activeWs) return null;

  if (isCollapsed) {
    return (
      <div className="absolute top-2 right-4 z-30">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title="Show Workspace Bar"
          className="bg-background-color-1/90 dark:bg-dark-background-color-1/90 text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200/80 px-2.5 py-1 text-xs font-semibold shadow-md backdrop-blur-md transition-all hover:scale-105 dark:border-stone-800/80"
        >
          <span className="material-symbols-rounded text-accent text-sm">view_quilt</span>
          <span>{activeWs.name}</span>
          <span className="material-symbols-rounded text-xs opacity-60">expand_more</span>
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-toolbar bg-background-color-2/40 dark:bg-dark-background-color-2/40 text-font-color-black dark:text-font-color-white relative z-30 flex shrink-0 items-center justify-between border-b border-stone-200/50 px-3 py-1.5 backdrop-blur-md dark:border-stone-800/50">
      {/* Workspace Switcher */}
      <div className="flex items-center gap-2">
        <div className="text-accent flex items-center gap-1 text-xs font-bold">
          <span className="material-symbols-rounded text-base">dashboard_customize</span>
          <span className="hidden text-[10px] tracking-wider uppercase sm:inline">Workspace:</span>
        </div>

        <div className="bg-background-color-1/70 dark:bg-dark-background-color-1/70 flex items-center gap-1 rounded-lg border border-stone-200/50 p-0.5 dark:border-stone-800/50">
          {Object.values(workspaces).map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => handleSwitchWorkspace(ws.id)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                activeId === ws.id
                  ? 'bg-accent font-semibold text-white shadow-xs'
                  : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
              }`}
            >
              {ws.name}
            </button>
          ))}
        </div>
      </div>

      {/* Actions: Add Panel, Reset, Collapse */}
      <div className="relative flex items-center gap-2">
        {/* Add Panel Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsPanelMenuOpen(!isPanelMenuOpen)}
            className="bg-background-color-1 dark:bg-dark-background-color-1 flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium shadow-xs transition-colors hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            <span className="material-symbols-rounded text-accent text-sm">add</span>
            <span>{t('common.add', 'Add Panel')}</span>
          </button>

          {isPanelMenuOpen && (
            <div className="bg-background-color-1 dark:bg-dark-background-color-1 absolute top-8 right-0 z-50 w-56 rounded-xl border border-stone-200 p-1.5 shadow-2xl backdrop-blur-xl dark:border-stone-700">
              <div className="text-font-color-dimmed mb-1 border-b border-stone-200/40 px-2 py-1 text-[10px] font-bold tracking-wider uppercase dark:border-stone-800/40">
                Available Panels
              </div>

              {Object.values(PANEL_DEFINITIONS)
                .filter((def) => def.type !== 'empty')
                .map((def) => {
                  const isMounted = mountedTypes.has(def.type);
                  const isSingletonDisabled = def.singleton && isMounted;

                  return (
                    <button
                      key={def.type}
                      type="button"
                      disabled={isSingletonDisabled}
                      onClick={() => handleAddPanel(def.type)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isSingletonDisabled
                          ? 'cursor-not-allowed opacity-40'
                          : 'hover:bg-accent/15 hover:text-accent cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="material-symbols-rounded text-sm opacity-80">
                          {def.icon}
                        </span>
                        <span className="truncate">{def.title}</span>
                      </div>

                      {isSingletonDisabled && (
                        <span className="text-font-color-dimmed text-[10px] italic">Added</span>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Reset Layout */}
        <button
          type="button"
          onClick={handleResetLayout}
          title="Reset layout to preset defaults"
          className="text-font-color-dimmed flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
        >
          <span className="material-symbols-rounded text-sm">restart_alt</span>
          <span className="hidden sm:inline">Reset</span>
        </button>

        {/* Collapse Bar */}
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          title="Minimize toolbar"
          className="text-font-color-dimmed flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors hover:bg-stone-200 dark:hover:bg-stone-800"
        >
          <span className="material-symbols-rounded text-sm">expand_less</span>
        </button>
      </div>
    </div>
  );
});

WorkspaceToolbar.displayName = 'WorkspaceToolbar';
export default WorkspaceToolbar;
