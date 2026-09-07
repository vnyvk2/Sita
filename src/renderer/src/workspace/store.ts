import { Store } from '@tanstack/store';

import { applyLayoutOp, findAllTabGroups, findTabGroupContainingPanel, generateRandomId } from './ops';
import { loadWorkspaceState, saveWorkspaceStateDebounced } from './persistence';
import { DEFAULT_PRESET } from './presets/default';
import { MUSICBEE_PRESET } from './presets/musicbee';
import type {
  LayoutOp,
  NodeId,
  PanelInstanceId,
  PanelType,
  VisualDropTarget,
  Workspace,
  WorkspaceState
} from './types';

export type SidebarMode = 'expanded' | 'compact' | 'hidden';

const initialToolbarCollapsed = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('nora:workspace-toolbar-collapsed') === 'true';
  } catch {
    return false;
  }
})();

const initialSidebarMode: SidebarMode = (() => {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('nora:sidebar-mode') : null;
    if (saved === 'expanded' || saved === 'compact' || saved === 'hidden') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'expanded';
})();

export interface TransientWorkspaceState {
  isDragging: boolean;
  currentDrag: {
    panelId: PanelInstanceId;
    sourceNodeId?: NodeId;
  } | null;
  hoveredDropTarget: VisualDropTarget | null;
  maximizedPanelId: PanelInstanceId | null;
  isToolbarCollapsed: boolean;
  sidebarMode: SidebarMode;
  isSaveLayoutModalOpen: boolean;
  saveLayoutModalMode: 'save' | 'rename';
  targetWorkspaceId: string | null;
}

export const workspaceStore = new Store<WorkspaceState>(loadWorkspaceState());

export const dndStore = new Store<TransientWorkspaceState>({
  isDragging: false,
  currentDrag: null,
  hoveredDropTarget: null,
  maximizedPanelId: null,
  isToolbarCollapsed: initialToolbarCollapsed,
  sidebarMode: initialSidebarMode,
  isSaveLayoutModalOpen: false,
  saveLayoutModalMode: 'save',
  targetWorkspaceId: null
});

// Auto-persist workspace changes to localStorage
workspaceStore.subscribe((nextState) => {
  saveWorkspaceStateDebounced(nextState);
});

export const workspaceActions = {
  dispatchOp(op: LayoutOp): void {
    workspaceStore.setState((state) => {
      const activeWs = state.workspaces[state.active];
      if (!activeWs) return state;

      const nextWs = applyLayoutOp(activeWs, op);
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [nextWs.id]: nextWs
        }
      };
    });
  },

  switchWorkspace(id: string): void {
    workspaceStore.setState((state) => {
      if (!state.workspaces[id]) return state;
      return {
        ...state,
        active: id
      };
    });
  },

  saveWorkspace(ws: Workspace): void {
    workspaceStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        [ws.id]: ws
      }
    }));
  },

  updatePanelLocal<T>(panelId: PanelInstanceId, key: string, value: T | ((prev: T) => T)): void {
    workspaceStore.setState((state) => {
      const activeWs = state.workspaces[state.active];
      if (!activeWs || !activeWs.panels[panelId]) return state;

      const panel = activeWs.panels[panelId];
      const prevVal = panel.local[key] as T;
      const nextVal = typeof value === 'function' ? (value as (prev: T) => T)(prevVal) : value;

      const updatedPanel = {
        ...panel,
        local: {
          ...panel.local,
          [key]: nextVal
        }
      };

      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [activeWs.id]: {
            ...activeWs,
            panels: {
              ...activeWs.panels,
              [panelId]: updatedPanel
            }
          }
        }
      };
    });
  },

  setMaximizedPanel(panelId: PanelInstanceId | null): void {
    dndStore.setState((state) => ({
      ...state,
      maximizedPanelId: panelId
    }));
  },

  toggleMaximizePanel(panelId: PanelInstanceId): void {
    dndStore.setState((state) => ({
      ...state,
      maximizedPanelId: state.maximizedPanelId === panelId ? null : panelId
    }));
  },

  setDragState(drag: { panelId: PanelInstanceId; sourceNodeId?: NodeId } | null): void {
    dndStore.setState((state) => ({
      ...state,
      isDragging: drag !== null,
      currentDrag: drag,
      hoveredDropTarget: drag === null ? null : state.hoveredDropTarget
    }));
  },

  setHoveredDropTarget(target: VisualDropTarget | null): void {
    dndStore.setState((state) => ({
      ...state,
      hoveredDropTarget: target
    }));
  },

  setToolbarCollapsed(collapsed: boolean): void {
    try {
      localStorage.setItem('nora:workspace-toolbar-collapsed', String(collapsed));
    } catch {
      // ignore
    }
    dndStore.setState((state) => ({
      ...state,
      isToolbarCollapsed: collapsed
    }));
  },

  toggleToolbarCollapsed(): void {
    const next = !dndStore.state.isToolbarCollapsed;
    workspaceActions.setToolbarCollapsed(next);
  },

  setSidebarMode(mode: SidebarMode): void {
    try {
      localStorage.setItem('nora:sidebar-mode', mode);
    } catch {
      // ignore
    }
    dndStore.setState((state) => ({
      ...state,
      sidebarMode: mode
    }));
  },

  cycleSidebarMode(): void {
    const current = dndStore.state.sidebarMode;
    const next: SidebarMode =
      current === 'expanded' ? 'compact' : current === 'compact' ? 'hidden' : 'expanded';
    workspaceActions.setSidebarMode(next);
  },

  toggleSidebar(): void {
    const current = dndStore.state.sidebarMode;
    const next: SidebarMode = current === 'hidden' ? 'expanded' : 'hidden';
    workspaceActions.setSidebarMode(next);
  },

  saveCurrentLayoutAs(name: string): string {
    let newId = '';
    workspaceStore.setState((state) => {
      const activeWs = state.workspaces[state.active];
      if (!activeWs) return state;

      newId = generateRandomId('ws');
      const newWs: Workspace = {
        ...activeWs,
        id: newId,
        name: name.trim() || activeWs.name,
        root: JSON.parse(JSON.stringify(activeWs.root)),
        panels: JSON.parse(JSON.stringify(activeWs.panels)),
        frame: { ...activeWs.frame }
      };

      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [newWs.id]: newWs
        },
        active: newWs.id
      };
    });
    return newId;
  },

  deleteWorkspace(id: string): boolean {
    if (id === DEFAULT_PRESET.id || id === MUSICBEE_PRESET.id) {
      return false;
    }
    if (!workspaceStore.state.workspaces[id]) {
      return false;
    }
    const isActiveDeleted = workspaceStore.state.active === id;
    const isTargetRenamingDeleted = dndStore.state.targetWorkspaceId === id;
    workspaceStore.setState((state) => {
      const { [id]: _, ...restWorkspaces } = state.workspaces;
      return {
        ...state,
        workspaces: restWorkspaces,
        active: state.active === id ? DEFAULT_PRESET.id : state.active
      };
    });
    dndStore.setState((s) => ({
      ...s,
      maximizedPanelId: isActiveDeleted ? null : s.maximizedPanelId,
      targetWorkspaceId: isTargetRenamingDeleted ? null : s.targetWorkspaceId,
      isSaveLayoutModalOpen: isTargetRenamingDeleted ? false : s.isSaveLayoutModalOpen,
      saveLayoutModalMode: isTargetRenamingDeleted ? 'save' : s.saveLayoutModalMode
    }));
    return true;
  },

  renameWorkspace(id: string, newName: string): boolean {
    if (id === DEFAULT_PRESET.id || id === MUSICBEE_PRESET.id) {
      return false;
    }
    const trimmed = newName.trim();
    if (!trimmed || !workspaceStore.state.workspaces[id]) {
      return false;
    }
    workspaceStore.setState((state) => {
      const target = state.workspaces[id];
      if (!target) return state;
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [id]: {
            ...target,
            name: trimmed
          }
        }
      };
    });
    return true;
  },

  duplicateWorkspace(id: string, newName?: string): string {
    let newId = '';
    workspaceStore.setState((state) => {
      const sourceWs = state.workspaces[id];
      if (!sourceWs) return state;

      newId = generateRandomId('ws');
      const finalName = newName?.trim() || `${sourceWs.name} (Copy)`;
      const duplicatedWs: Workspace = {
        ...sourceWs,
        id: newId,
        name: finalName,
        root: JSON.parse(JSON.stringify(sourceWs.root)),
        panels: JSON.parse(JSON.stringify(sourceWs.panels)),
        frame: { ...sourceWs.frame }
      };

      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [newId]: duplicatedWs
        },
        active: newId
      };
    });
    return newId;
  },

  toggleOrOpenPanel(type: PanelType): void {
    const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
    if (!activeWs) return;

    const existing = Object.values(activeWs.panels).find((p) => p.type === type);

    if (existing) {
      const tabGroup = findTabGroupContainingPanel(activeWs.root, existing.id);
      if (tabGroup) {
        if (tabGroup.active !== existing.id) {
          workspaceActions.dispatchOp({
            t: 'tabs.activate',
            tabsId: tabGroup.id,
            panelId: existing.id
          });
        } else if (existing.type !== 'router-view') {
          if (dndStore.state.maximizedPanelId === existing.id) {
            workspaceActions.setMaximizedPanel(null);
          }
          workspaceActions.dispatchOp({
            t: 'panel.close',
            panelId: existing.id
          });
        }
      } else if (existing.type !== 'router-view') {
        if (dndStore.state.maximizedPanelId === existing.id) {
          workspaceActions.setMaximizedPanel(null);
        }
        workspaceActions.dispatchOp({
          t: 'panel.close',
          panelId: existing.id
        });
      }
    } else {
      const routerPanel = Object.values(activeWs.panels).find((p) => p.type === 'router-view');
      const routerViewId = routerPanel ? routerPanel.id : Object.keys(activeWs.panels)[0];
      if (!routerViewId) return;

      if (type === 'playlists') {
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
      } else {
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

          if (secondaryPanel) {
            workspaceActions.dispatchOp({
              t: 'panel.insert',
              type,
              at: {
                k: 'tab-into',
                tabsId: secondaryPanel.id
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
                before: false
              }
            });
          }
        }
      }
    }
  },

  openSaveLayoutModal(mode: 'save' | 'rename' = 'save', targetWorkspaceId?: string): void {
    dndStore.setState((state) => ({
      ...state,
      isSaveLayoutModalOpen: true,
      saveLayoutModalMode: mode,
      targetWorkspaceId: targetWorkspaceId ?? null
    }));
  },

  closeSaveLayoutModal(): void {
    dndStore.setState((state) => ({
      ...state,
      isSaveLayoutModalOpen: false,
      saveLayoutModalMode: 'save',
      targetWorkspaceId: null
    }));
  }
};
