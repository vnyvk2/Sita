import '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { findRightsideSecondaryPanel, findRightsideTabGroup } from '../ops';
import { DEFAULT_PRESET } from '../presets/default';
import { MUSICBEE_PRESET } from '../presets/musicbee';
import { PANEL_DEFINITIONS, getMountedPanelTypes } from '../registry';
import {
  dndStore,
  downloadLayoutFile,
  workspaceActions,
  workspaceHistoryStore,
  workspaceStore
} from '../store';
import type { PanelType } from '../types';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
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
  const isSidebarPinned = useStore(dndStore, (s) => s.isSidebarPinned);
  const sidebarWidthMode = useStore(dndStore, (s) => s.sidebarWidthMode);
  const canUndo = useStore(workspaceHistoryStore, (s) => s.past.length > 0);
  const canRedo = useStore(workspaceHistoryStore, (s) => s.future.length > 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeWs = workspaces[activeId];

  const [addPosition, setAddPosition] = useState<'auto' | 'left' | 'right' | 'tab'>('auto');
  const mountedTypes = activeWs ? getMountedPanelTypes(activeWs) : new Set<PanelType>();

  const handleExportWorkspace = (wsId?: string) => {
    const exported = workspaceActions.exportWorkspace(wsId);
    if (exported) {
      downloadLayoutFile(exported);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const result = workspaceActions.importWorkspace(parsed);
        if (!result.success) {
          console.warn('[WorkspaceToolbar] Failed to import layout:', result.error);
        }
      } catch (err) {
        console.error('[WorkspaceToolbar] JSON parse error during layout import:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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

      const isLeftTool = type === 'playlists' || type === 'navigation';

      const effectivePosition =
        addPosition === 'auto' ? (isLeftTool ? 'left' : 'auto-right') : addPosition;

      if (effectivePosition === 'left' || (isLeftTool && addPosition === 'auto')) {
        // Dock to the left of router-view
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
      } else if (effectivePosition === 'tab' || effectivePosition === 'auto-right') {
        const rightTabGroup = findRightsideTabGroup(activeWs);
        if (rightTabGroup) {
          workspaceActions.dispatchOp({
            t: 'panel.insert',
            type,
            at: {
              k: 'tab-into',
              tabsId: rightTabGroup.id
            }
          });
        } else {
          const secondaryRightPanel = findRightsideSecondaryPanel(activeWs);
          if (secondaryRightPanel) {
            workspaceActions.dispatchOp({
              t: 'panel.insert',
              type,
              at: {
                k: 'tab-into',
                tabsId: secondaryRightPanel.id
              }
            });
          } else {
            // First right tool: create the right-hand column split
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
          }
        }
      } else {
        // Explicit 'right' position
        const rootSplit =
          activeWs.root.kind === 'split' && activeWs.root.axis === 'x' ? activeWs.root : null;
        if (rootSplit && rootSplit.children.length >= 4) {
          const rightTabGroup = findRightsideTabGroup(activeWs);
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

          const secondaryRightPanel = findRightsideSecondaryPanel(activeWs);
          if (secondaryRightPanel) {
            workspaceActions.dispatchOp({
              t: 'panel.insert',
              type,
              at: {
                k: 'tab-into',
                tabsId: secondaryRightPanel.id
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
      }
      setIsPanelMenuOpen(false);
    },
    [activeWs, addPosition]
  );

  const handleResetLayout = useCallback(() => {
    const originPreset =
      activeWs?.sourcePresetId ||
      (activeId === MUSICBEE_PRESET.id ? MUSICBEE_PRESET.id : DEFAULT_PRESET.id);
    const defaultPreset = originPreset === MUSICBEE_PRESET.id ? MUSICBEE_PRESET : DEFAULT_PRESET;
    workspaceActions.dispatchOp({
      t: 'ws.reset',
      id: activeId,
      defaultPreset
    });
  }, [activeId, activeWs?.sourcePresetId]);

  if (!activeWs) return null;

  if (isToolbarCollapsed) {
    return (
      <>
        <SaveLayoutModal />
        <ConfirmDeleteModal />
      </>
    );
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
            className="bg-background-color-1/80 dark:bg-dark-background-color-1/80 flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200/80 px-2.5 py-1 text-xs font-semibold shadow-2xs backdrop-blur-md transition-all hover:bg-stone-100 dark:border-stone-700/80 dark:hover:bg-stone-800"
          >
            <span className="material-symbols-rounded text-accent text-sm">view_quilt</span>
            <span className="text-font-color-dimmed font-normal">Layout:</span>
            <span className="max-w-[120px] truncate sm:max-w-[160px]">{activeWs.name}</span>
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
              className="bg-background-color-1/95 dark:bg-dark-background-color-1/95 absolute top-full left-0 z-50 mt-1.5 min-w-[230px] rounded-xl border border-stone-200/80 p-1.5 shadow-2xl backdrop-blur-xl dark:border-stone-700/80"
            >
              <div className="text-font-color-dimmed mb-1 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                Workspaces
              </div>
              <div className="max-h-60 scrollbar-thin space-y-0.5 overflow-y-auto">
                {Object.values(workspaces).map((ws) => {
                  const isActive = activeId === ws.id;
                  const isDefaultPreset =
                    ws.id === DEFAULT_PRESET.id || ws.id === MUSICBEE_PRESET.id;

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
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                      >
                        <span
                          className={`material-symbols-rounded shrink-0 text-sm ${
                            isActive ? 'text-accent' : 'opacity-70'
                          }`}
                        >
                          {isActive ? 'check' : 'view_quilt'}
                        </span>
                        <span className="truncate">{ws.name}</span>
                        {isDefaultPreset && (
                          <span className="py-0.2 text-font-color-dimmed shrink-0 rounded bg-stone-200/60 px-1 text-[9px] font-medium tracking-wide uppercase dark:bg-stone-700/60">
                            Preset
                          </span>
                        )}
                      </button>

                      <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
                            className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-stone-300/40 dark:hover:bg-stone-700/40"
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
                          className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-stone-300/40 dark:hover:bg-stone-700/40"
                        >
                          <span className="material-symbols-rounded text-xs">content_copy</span>
                        </button>
                        <button
                          type="button"
                          title={`Export ${ws.name}`}
                          aria-label={`Export ${ws.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsWsDropdownOpen(false);
                            handleExportWorkspace(ws.id);
                          }}
                          className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-stone-300/40 dark:hover:bg-stone-700/40"
                        >
                          <span className="material-symbols-rounded text-xs">download</span>
                        </button>
                        {!isDefaultPreset && (
                          <button
                            type="button"
                            title={`Delete ${ws.name}`}
                            aria-label={`Delete ${ws.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsWsDropdownOpen(false);
                              workspaceActions.openDeleteConfirmModal(ws.id);
                            }}
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-rose-600 transition-colors hover:bg-rose-100/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <span className="material-symbols-rounded text-xs">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="my-1 border-t border-stone-200/50 dark:border-stone-800/50" />

              <button
                type="button"
                role="menuitem"
                aria-label="Save Current Layout As"
                title={`Save current layout as a new workspace preset (${getSaveLayoutShortcut()})`}
                onClick={() => {
                  setIsWsDropdownOpen(false);
                  workspaceActions.openSaveLayoutModal('save');
                }}
                className="text-font-color-black dark:text-font-color-white hover:bg-accent/15 hover:text-accent flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors"
              >
                <span className="material-symbols-rounded text-sm">bookmark_add</span>
                <span>+ Save Current Layout As...</span>
              </button>

              <button
                type="button"
                role="menuitem"
                aria-label="Export Current Layout"
                title="Export current workspace layout to JSON"
                onClick={() => {
                  setIsWsDropdownOpen(false);
                  handleExportWorkspace(activeId);
                }}
                className="text-font-color-black dark:text-font-color-white hover:bg-accent/15 hover:text-accent flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors"
              >
                <span className="material-symbols-rounded text-sm">file_download</span>
                <span>Export Current Layout...</span>
              </button>

              <button
                type="button"
                role="menuitem"
                aria-label="Import Layout"
                title="Import workspace layout from JSON file"
                onClick={() => {
                  setIsWsDropdownOpen(false);
                  fileInputRef.current?.click();
                }}
                className="text-font-color-black dark:text-font-color-white hover:bg-accent/15 hover:text-accent flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors"
              >
                <span className="material-symbols-rounded text-sm">file_upload</span>
                <span>Import Layout...</span>
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
                className="text-font-color-black dark:text-font-color-white flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-rose-100/60 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
              >
                <span className="material-symbols-rounded text-sm">restart_alt</span>
                <span>Reset Layout to Default</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.nora-layout.json"
                onChange={handleImportFile}
                className="hidden"
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        {/* Actions: Sidebar Toggle, Add Panel, Reset, Collapse */}
        <div className="relative flex items-center gap-2">
          {/* Quick Sidebar Toggle */}
          <button
            type="button"
            onClick={() => workspaceActions.toggleSidebarPinned()}
            title={
              isSidebarPinned
                ? `Sidebar is pinned (${sidebarWidthMode}). Click to unpin (auto-hide).`
                : 'Sidebar is unpinned (auto-hides on hover-out). Click to pin.'
            }
            className={`hover:text-font-color-black dark:hover:text-font-color-white flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors hover:bg-stone-200/50 dark:hover:bg-stone-800/50 ${
              !isSidebarPinned
                ? 'border-accent/60 bg-accent/10 text-accent font-semibold'
                : 'text-font-color-dimmed border-stone-200/60 dark:border-stone-700/60'
            }`}
          >
            <span className="material-symbols-rounded text-accent text-sm">
              {isSidebarPinned ? 'push_pin' : 'keep'}
            </span>
            <span className="hidden text-[11px] font-medium capitalize sm:inline">
              {isSidebarPinned ? `Pinned (${sidebarWidthMode})` : 'Auto-hide'}
            </span>
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
                    onClick={() => setAddPosition('auto')}
                    className={`flex-1 cursor-pointer rounded-md py-1 text-center text-[10px] font-semibold transition-all ${
                      addPosition === 'auto'
                        ? 'text-accent dark:bg-dark-background-color-1 bg-white shadow-xs'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPosition('left')}
                    className={`flex-1 cursor-pointer rounded-md py-1 text-center text-[10px] font-semibold transition-all ${
                      addPosition === 'left'
                        ? 'text-accent dark:bg-dark-background-color-1 bg-white shadow-xs'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                    }`}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPosition('right')}
                    className={`flex-1 cursor-pointer rounded-md py-1 text-center text-[10px] font-semibold transition-all ${
                      addPosition === 'right'
                        ? 'text-accent dark:bg-dark-background-color-1 bg-white shadow-xs'
                        : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white'
                    }`}
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddPosition('tab')}
                    className={`flex-1 cursor-pointer rounded-md py-1 text-center text-[10px] font-semibold transition-all ${
                      addPosition === 'tab'
                        ? 'text-accent dark:bg-dark-background-color-1 bg-white shadow-xs'
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
                          <span className="material-symbols-rounded shrink-0 text-sm opacity-80">
                            {def.icon}
                          </span>
                          <span className="truncate">{def.title}</span>
                        </div>

                        <div className="ml-2 flex shrink-0 items-center gap-1.5">
                          {shortcut && (
                            <kbd className="text-font-color-dimmed rounded bg-stone-200/60 px-1.5 py-0.5 font-mono text-[10px] dark:bg-stone-700/60">
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

          {/* Undo */}
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => workspaceActions.undo()}
            title="Undo layout change (Ctrl+Z)"
            aria-label="Undo layout change"
            className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-stone-200/50 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-stone-800/50"
          >
            <span className="material-symbols-rounded text-sm">undo</span>
          </button>

          {/* Redo */}
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => workspaceActions.redo()}
            title="Redo layout change (Ctrl+Shift+Z / Ctrl+Y)"
            aria-label="Redo layout change"
            className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-stone-200/50 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-stone-800/50"
          >
            <span className="material-symbols-rounded text-sm">redo</span>
          </button>

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
      <ConfirmDeleteModal />
    </>
  );
});

WorkspaceToolbar.displayName = 'WorkspaceToolbar';
export default WorkspaceToolbar;
