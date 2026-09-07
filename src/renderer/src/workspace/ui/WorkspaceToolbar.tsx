import '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import storage from '@renderer/utils/localStorage';
import { findAllTabGroups } from '../ops';
import { DEFAULT_PRESET } from '../presets/default';
import { MUSICBEE_PRESET } from '../presets/musicbee';
import { PANEL_DEFINITIONS, getMountedPanelTypes } from '../registry';
import { dndStore, workspaceActions, workspaceStore } from '../store';
import type { PanelType } from '../types';
import { SaveLayoutModal } from './SaveLayoutModal';

const PANEL_SHORTCUT_LABELS: Partial<Record<PanelType, string>> = {
  queue: 'appShortcutsPrompt.toggleQueuePanel',
  lyrics: 'appShortcutsPrompt.toggleLyricsPanel',
  playlists: 'appShortcutsPrompt.togglePlaylistsPanel',
  visualizer: 'appShortcutsPrompt.toggleVisualizerPanel',
  'now-playing': 'appShortcutsPrompt.toggleNowPlayingPanel'
};

const DEFAULT_PANEL_SHORTCUTS: Partial<Record<PanelType, string>> = {
  queue: 'Alt + Q',
  lyrics: 'Alt + L',
  playlists: 'Alt + P',
  visualizer: 'Alt + V',
  'now-playing': 'Alt + N'
};

const getPanelShortcutBadge = (type: PanelType): string | undefined => {
  const label = PANEL_SHORTCUT_LABELS[type];
  if (!label) return undefined;

  try {
    const shortcuts = storage.keyboardShortcuts
      .getKeyboardShortcuts()
      .flatMap((category) => category.shortcuts);
    const matched = shortcuts.find((s) => s.label === label);
    if (matched && matched.keys?.length > 0) {
      return matched.keys.join(' + ');
    }
  } catch {
    // fallback if storage unavailable
  }

  return DEFAULT_PANEL_SHORTCUTS[type];
};

const getSaveLayoutShortcut = (): string => {
  try {
    const shortcuts = storage.keyboardShortcuts
      .getKeyboardShortcuts()
      .flatMap((category) => category.shortcuts);
    const matched = shortcuts.find((s) => s.label === 'appShortcutsPrompt.saveWorkspaceLayout');
    if (matched && matched.keys?.length > 0) {
      return matched.keys.join(' + ');
    }
  } catch {
    // fallback if storage unavailable
  }
  return 'Alt + S';
};

export const WorkspaceToolbar: FC = memo(() => {
  const { t } = useTranslation();
  const [isPanelMenuOpen, setIsPanelMenuOpen] = useState(false);
  const [isWsDropdownOpen, setIsWsDropdownOpen] = useState(false);

  const activeId = useStore(workspaceStore, (s) => s.active);
  const workspaces = useStore(workspaceStore, (s) => s.workspaces);
  const isToolbarCollapsed = useStore(dndStore, (s) => s.isToolbarCollapsed);
  const sidebarMode = useStore(dndStore, (s) => s.sidebarMode);
  const activeWs = workspaces[activeId];

  const [addPosition, setAddPosition] = useState<'left' | 'right' | 'tab'>('right');
  const mountedTypes = activeWs ? getMountedPanelTypes(activeWs) : new Set<PanelType>();

  useEffect(() => {
    if (!isWsDropdownOpen && !isPanelMenuOpen) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (isWsDropdownOpen && !target?.closest('[data-workspace-dropdown]')) {
        setIsWsDropdownOpen(false);
      }
      if (isPanelMenuOpen && !target?.closest('[data-panel-menu]')) {
        setIsPanelMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWsDropdownOpen(false);
        setIsPanelMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isWsDropdownOpen, isPanelMenuOpen]);

  const handleSwitchWorkspace = (id: string) => {
    setIsWsDropdownOpen(false);
    setIsPanelMenuOpen(false);
    workspaceActions.switchWorkspace(id);
  };

  const handleAddPanel = useCallback(
    (type: PanelType) => {
      if (!activeWs) return;

      const routerPanel = Object.values(activeWs.panels).find((p) => p.type === 'router-view');
      const routerViewId = routerPanel ? routerPanel.id : Object.keys(activeWs.panels)[0];
      if (!routerViewId) return;

      if (addPosition === 'tab') {
        const tabGroups = findAllTabGroups(activeWs.root);
        const targetTabGroup =
          tabGroups.find(
            (tg) => !tg.tabs.some((tabId) => activeWs.panels[tabId]?.type === 'playlists')
          ) ?? tabGroups[0];

        if (targetTabGroup) {
          workspaceActions.dispatchOp({
            t: 'panel.insert',
            type,
            at: {
              k: 'tab-into',
              tabsId: targetTabGroup.id
            }
          });
        } else {
          const secondaryPanel = Object.values(activeWs.panels).find(
            (p) => p.type !== 'router-view' && p.type !== 'playlists'
          );
          workspaceActions.dispatchOp({
            t: 'panel.insert',
            type,
            at: {
              k: 'tab-into',
              tabsId: secondaryPanel ? secondaryPanel.id : routerViewId
            }
          });
        }
      } else if (addPosition === 'right') {
        const rootSplit =
          activeWs.root.kind === 'split' && activeWs.root.axis === 'x' ? activeWs.root : null;
        if (rootSplit && rootSplit.children.length >= 4) {
          const tabGroups = findAllTabGroups(activeWs.root);
          const rightTabGroup =
            tabGroups.find(
              (tg) => !tg.tabs.some((tabId) => activeWs.panels[tabId]?.type === 'playlists')
            ) ?? tabGroups[0];

          if (rightTabGroup) {
            workspaceActions.dispatchOp({
              t: 'panel.insert',
              type,
              at: {
                k: 'tab-into',
                tabsId: rightTabGroup.id
              }
            });
            setIsPanelMenuOpen(false);
            return;
          }

          const secondaryPanel = Object.values(activeWs.panels).find(
            (p) => p.type !== 'router-view' && p.type !== 'playlists'
          );
          if (secondaryPanel) {
            workspaceActions.dispatchOp({
              t: 'panel.insert',
              type,
              at: {
                k: 'tab-into',
                tabsId: secondaryPanel.id
              }
            });
            setIsPanelMenuOpen(false);
            return;
          }
        }

        workspaceActions.dispatchOp({
          t: 'panel.insert',
          type,
          at: {
            k: 'split-into',
            targetPanelId: routerViewId,
            axis: 'x',
            before: false
          }
        });
      } else {
        workspaceActions.dispatchOp({
          t: 'panel.insert',
          type,
          at: {
            k: 'split-into',
            targetPanelId: routerViewId,
            axis: 'x',
            before: true
          }
        });
      }
      setIsPanelMenuOpen(false);
    },
    [activeWs, addPosition]
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

  if (isToolbarCollapsed) {
    return <SaveLayoutModal />;
  }

  return (
    <>
      <div className="workspace-toolbar bg-background-color-2/40 dark:bg-dark-background-color-2/40 text-font-color-black dark:text-font-color-white relative z-30 flex shrink-0 items-center justify-between border-b border-stone-200/50 px-3 py-1.5 backdrop-blur-md dark:border-stone-800/50">
        {/* Workspace Selector Dropdown */}
        <div className="relative" data-workspace-dropdown>
          <button
            type="button"
            onClick={() => setIsWsDropdownOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isWsDropdownOpen}
            title={`Workspace Layout: ${activeWs.name}`}
            className="h-7 flex items-center gap-1.5 rounded-lg border border-stone-200/80 dark:border-stone-700/80 bg-background-color-1/80 dark:bg-dark-background-color-1/80 px-2.5 py-1 text-xs font-semibold shadow-2xs backdrop-blur-md transition-all hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <span className="material-symbols-rounded text-accent text-sm">view_quilt</span>
            <span className="text-font-color-dimmed font-normal">Layout:</span>
            <span className="truncate max-w-[120px] sm:max-w-[160px]">{activeWs.name}</span>
            <span
              className={`material-symbols-rounded text-font-color-dimmed text-xs transition-transform duration-200 ${
                isWsDropdownOpen ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {isWsDropdownOpen && (
            <div
              role="menu"
              aria-label="Workspaces"
              className="absolute top-full left-0 mt-1.5 z-50 min-w-[230px] rounded-xl border border-stone-200/80 dark:border-stone-700/80 bg-background-color-1/95 dark:bg-dark-background-color-1/95 p-1.5 shadow-2xl backdrop-blur-xl"
            >
              <div className="text-font-color-dimmed mb-1 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                Workspaces
              </div>
              <div className="max-h-60 overflow-y-auto space-y-0.5 scrollbar-thin">
                {Object.values(workspaces).map((ws) => {
                  const isActive = activeId === ws.id;
                  const isDefaultPreset = ws.id === DEFAULT_PRESET.id || ws.id === MUSICBEE_PRESET.id;

                  return (
                    <div
                      key={ws.id}
                      className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
                        isActive
                          ? 'bg-accent/15 text-accent font-semibold'
                          : 'text-font-color-black dark:text-font-color-white hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleSwitchWorkspace(ws.id)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span
                          className={`material-symbols-rounded text-sm shrink-0 ${
                            isActive ? 'text-accent' : 'opacity-70'
                          }`}
                        >
                          {isActive ? 'check' : 'view_quilt'}
                        </span>
                        <span className="truncate">{ws.name}</span>
                        {isDefaultPreset && (
                          <span className="shrink-0 rounded bg-stone-200/60 dark:bg-stone-700/60 px-1 py-0.2 text-[9px] font-medium tracking-wide uppercase text-font-color-dimmed">
                            Preset
                          </span>
                        )}
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-1">
                        {!isDefaultPreset && (
                          <button
                            type="button"
                            title={`Rename ${ws.name}`}
                            aria-label={`Rename ${ws.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsWsDropdownOpen(false);
                              workspaceActions.openSaveLayoutModal('rename', ws.id);
                            }}
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-300/40 dark:hover:bg-stone-700/40 transition-colors"
                          >
                            <span className="material-symbols-rounded text-xs">edit</span>
                          </button>
                        )}
                        <button
                          type="button"
                          title={`Duplicate ${ws.name}`}
                          aria-label={`Duplicate ${ws.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsWsDropdownOpen(false);
                            workspaceActions.duplicateWorkspace(ws.id);
                          }}
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-300/40 dark:hover:bg-stone-700/40 transition-colors"
                        >
                          <span className="material-symbols-rounded text-xs">content_copy</span>
                        </button>
                        {!isDefaultPreset && (
                          <button
                            type="button"
                            title={`Delete ${ws.name}`}
                            aria-label={`Delete ${ws.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsWsDropdownOpen(false);
                              workspaceActions.deleteWorkspace(ws.id);
                            }}
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-100/60 dark:hover:bg-rose-950/40 transition-colors"
                          >
                            <span className="material-symbols-rounded text-xs">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-stone-200/50 dark:border-stone-800/50 my-1" />

              <button
                type="button"
                role="menuitem"
                aria-label="Save Current Layout As"
                title={`Save current layout as a new workspace preset (${getSaveLayoutShortcut()})`}
                onClick={() => {
                  setIsWsDropdownOpen(false);
                  workspaceActions.openSaveLayoutModal('save');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-font-color-black dark:text-font-color-white hover:bg-accent/15 hover:text-accent transition-colors cursor-pointer"
              >
                <span className="material-symbols-rounded text-sm">bookmark_add</span>
                <span>+ Save Current Layout As...</span>
              </button>

              <button
                type="button"
                role="menuitem"
                aria-label="Reset Layout to Default"
                title="Reset layout to preset defaults"
                onClick={() => {
                  setIsWsDropdownOpen(false);
                  handleResetLayout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-font-color-black dark:text-font-color-white hover:bg-rose-100/60 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                <span className="material-symbols-rounded text-sm">restart_alt</span>
                <span>Reset Layout to Default</span>
              </button>
            </div>
          )}
        </div>

        {/* Actions: Sidebar Toggle, Add Panel, Reset, Collapse */}
        <div className="relative flex items-center gap-2">
          {/* Quick Sidebar Toggle */}
          <button
            type="button"
            onClick={() => workspaceActions.cycleSidebarMode()}
            title={`Sidebar is ${sidebarMode}. Click to cycle (Expanded -> Compact -> Hidden).`}
            className="text-font-color-dimmed hover:bg-stone-200/50 hover:text-font-color-black dark:hover:bg-stone-800/50 dark:hover:text-font-color-white flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-stone-200/60 px-2 text-xs transition-colors dark:border-stone-700/60"
          >
            <span className="material-symbols-rounded text-accent text-sm">
              {sidebarMode === 'hidden'
                ? 'dock_to_left'
                : sidebarMode === 'compact'
                  ? 'left_panel_open'
                  : 'dock_to_left'}
            </span>
            <span className="text-[11px] font-medium capitalize hidden sm:inline">{sidebarMode}</span>
          </button>

          {/* Add Panel Menu */}
          <div className="relative" data-panel-menu>
            <button
              type="button"
              onClick={() => setIsPanelMenuOpen(!isPanelMenuOpen)}
              className="bg-background-color-1 dark:bg-dark-background-color-1 flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium shadow-xs transition-colors hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              <span className="material-symbols-rounded text-accent text-sm">add</span>
              <span>{t('common.add', 'Add Panel')}</span>
            </button>

            {isPanelMenuOpen && (
              <div className="bg-background-color-1 dark:bg-dark-background-color-1 absolute top-8 right-0 z-50 w-64 rounded-xl border border-stone-200 p-2 shadow-2xl backdrop-blur-xl dark:border-stone-700">
                <div className="text-font-color-dimmed mb-1 px-1 text-[10px] font-bold tracking-wider uppercase">
                  Target Position
                </div>
                <div className="mb-2 flex items-center justify-between rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
                  <button
                    type="button"
                    onClick={() => setAddPosition('left')}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] font-semibold transition-all cursor-pointer ${
                      addPosition === 'left'
                        ? 'bg-white text-accent shadow-xs dark:bg-dark-background-color-1'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                    }`}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPosition('right')}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] font-semibold transition-all cursor-pointer ${
                      addPosition === 'right'
                        ? 'bg-white text-accent shadow-xs dark:bg-dark-background-color-1'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                    }`}
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPosition('tab')}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] font-semibold transition-all cursor-pointer ${
                      addPosition === 'tab'
                        ? 'bg-white text-accent shadow-xs dark:bg-dark-background-color-1'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                    }`}
                  >
                    As Tab
                  </button>
                </div>

                <div className="text-font-color-dimmed mb-1 border-b border-stone-200/40 px-1 py-1 text-[10px] font-bold tracking-wider uppercase dark:border-stone-800/40">
                  Available Panels
                </div>

                {Object.values(PANEL_DEFINITIONS)
                  .filter((def) => def.type !== 'empty')
                  .map((def) => {
                    const isMounted = mountedTypes.has(def.type);
                    const isSingletonDisabled = def.singleton && isMounted;
                    const shortcut = getPanelShortcutBadge(def.type);

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
                          <span className="material-symbols-rounded text-sm opacity-80 shrink-0">
                            {def.icon}
                          </span>
                          <span className="truncate">{def.title}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {shortcut && (
                            <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-stone-200/60 dark:bg-stone-700/60 text-font-color-dimmed">
                              {shortcut}
                            </kbd>
                          )}
                          {isSingletonDisabled && (
                            <span className="text-font-color-dimmed text-[10px] italic">Added</span>
                          )}
                        </div>
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
            onClick={() => workspaceActions.setToolbarCollapsed(true)}
            title="Minimize toolbar"
            className="text-font-color-dimmed flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <span className="material-symbols-rounded text-sm">expand_less</span>
          </button>
        </div>
      </div>
      <SaveLayoutModal />
    </>
  );
});

WorkspaceToolbar.displayName = 'WorkspaceToolbar';
export default WorkspaceToolbar;
