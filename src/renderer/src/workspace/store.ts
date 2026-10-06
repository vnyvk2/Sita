import { Store } from '@tanstack/store';

import {
  applyLayoutOp,
  assertWorkspaceInvariants,
  findRightsideSecondaryPanel,
  findRightsideTabGroup,
  findTabGroupContainingPanel,
  generateRandomId
} from './ops';
import {
  loadWorkspaceState,
  sanitizeWorkspace,
  saveWorkspaceStateDebounced,
  saveWorkspaceStateImmediate
} from './persistence';
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

export type SidebarWidthMode = 'expanded' | 'compact';
export type SidebarMode = 'expanded' | 'compact' | 'hidden';

export interface WorkspaceHistoryState {
  past: Workspace[];
  future: Workspace[];
}

export interface NoraLayoutExport {
  format: 'nora-layout';
  formatVersion: 2;
  exportedAt: string;
  workspace: Workspace;
}

const initialToolbarCollapsed = (() => {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('nora:workspace-toolbar-collapsed') === 'true'
    );
  } catch {
    return false;
  }
})();

const initialSidebarWidthMode: SidebarWidthMode = (() => {
  try {
    const savedWidth =
      typeof localStorage !== 'undefined' ? localStorage.getItem('nora:sidebar-width-mode') : null;
    if (savedWidth === 'expanded' || savedWidth === 'compact') {
      return savedWidth;
    }
    const legacy =
      typeof localStorage !== 'undefined' ? localStorage.getItem('nora:sidebar-mode') : null;
    if (legacy === 'compact') {
      return 'compact';
    }
  } catch {
    // ignore
  }
  return 'expanded';
})();

const initialSidebarPinned: boolean = (() => {
  try {
    const savedPinned =
      typeof localStorage !== 'undefined' ? localStorage.getItem('nora:sidebar-pinned') : null;
    if (savedPinned !== null) {
      return savedPinned === 'true';
    }
    const legacy =
      typeof localStorage !== 'undefined' ? localStorage.getItem('nora:sidebar-mode') : null;
    if (legacy === 'hidden') {
      return false;
    }
  } catch {
    // ignore
  }
  return true;
})();

const initialSidebarMode: SidebarMode = initialSidebarPinned ? initialSidebarWidthMode : 'hidden';

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
  sidebarWidthMode: SidebarWidthMode;
  isSidebarPinned: boolean;
  isSidebarPeeking: boolean;
  isSaveLayoutModalOpen: boolean;
  saveLayoutModalMode: 'save' | 'rename';
  targetWorkspaceId: string | null;
  isDeleteConfirmModalOpen: boolean;
  deleteTargetWorkspaceId: string | null;
}

export const workspaceStore = new Store<WorkspaceState>(loadWorkspaceState());

export const workspaceHistoryStore = new Store<WorkspaceHistoryState>({
  past: [],
  future: []
});

export const dndStore = new Store<TransientWorkspaceState>({
  isDragging: false,
  currentDrag: null,
  hoveredDropTarget: null,
  maximizedPanelId: null,
  isToolbarCollapsed: initialToolbarCollapsed,
  sidebarMode: initialSidebarMode,
  sidebarWidthMode: initialSidebarWidthMode,
  isSidebarPinned: initialSidebarPinned,
  isSidebarPeeking: false,
  isSaveLayoutModalOpen: false,
  saveLayoutModalMode: 'save',
  targetWorkspaceId: null,
  isDeleteConfirmModalOpen: false,
  deleteTargetWorkspaceId: null
});

// Auto-persist workspace changes to localStorage
workspaceStore.subscribe((nextState) => {
  saveWorkspaceStateDebounced(nextState);
});

// CF-04: Immediate flush on window close or tab backgrounding
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    saveWorkspaceStateImmediate(workspaceStore.state);
  });
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveWorkspaceStateImmediate(workspaceStore.state);
    }
  });
}

/** Resets all ephemeral drag, drop, and modal state across workspace transitions (CF-06) */
export function resetTransientWorkspaceState(): void {
  dndStore.setState((s) => ({
    ...s,
    maximizedPanelId: null,
    isDragging: false,
    currentDrag: null,
    hoveredDropTarget: null,
    targetWorkspaceId: null,
    isSaveLayoutModalOpen: false,
    saveLayoutModalMode: 'save',
    isDeleteConfirmModalOpen: false,
    deleteTargetWorkspaceId: null
  }));
}

export function createLayoutExport(ws: Workspace): NoraLayoutExport {
  return {
    format: 'nora-layout',
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    workspace: JSON.parse(JSON.stringify(ws))
  };
}

export function downloadLayoutFile(exported: NoraLayoutExport): void {
  if (typeof document === 'undefined') return;
  const json = JSON.stringify(exported, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = exported.workspace.name.replace(/[^a-z0-9_\- ]/gi, '_').trim() || 'layout';
  a.download = `${safeName}.nora-layout.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const workspaceActions = {
  dispatchOp(op: LayoutOp): void {
    if (op.t === 'panel.close' && dndStore.state.maximizedPanelId === op.panelId) {
      dndStore.setState((s) => ({ ...s, maximizedPanelId: null }));
    }
    workspaceStore.setState((state) => {
      const activeWs = state.workspaces[state.active];
      if (!activeWs) return state;

      const nextWs = applyLayoutOp(activeWs, op);
      if (nextWs === activeWs) return state;

      // Snapshot activeWs into history before updating
      workspaceHistoryStore.setState((h) => ({
        past: [...h.past, JSON.parse(JSON.stringify(activeWs))].slice(-20),
        future: []
      }));

      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          [nextWs.id]: nextWs
        }
      };
    });
  },

  undo(): boolean {
    const { past, future } = workspaceHistoryStore.state;
    if (past.length === 0) return false;

    const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
    if (!activeWs) return false;

    const previousWs = past[past.length - 1];
    const nextPast = past.slice(0, -1);
    const nextFuture = [JSON.parse(JSON.stringify(activeWs)), ...future].slice(0, 20);

    workspaceHistoryStore.setState(() => ({
      past: nextPast,
      future: nextFuture
    }));

    workspaceStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        [previousWs.id]: previousWs
      }
    }));

    return true;
  },

  redo(): boolean {
    const { past, future } = workspaceHistoryStore.state;
    if (future.length === 0) return false;

    const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
    if (!activeWs) return false;

    const nextWs = future[0];
    const nextFuture = future.slice(1);
    const nextPast = [...past, JSON.parse(JSON.stringify(activeWs))].slice(-20);

    workspaceHistoryStore.setState(() => ({
      past: nextPast,
      future: nextFuture
    }));

    workspaceStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        [nextWs.id]: nextWs
      }
    }));

    return true;
  },

  canUndo(): boolean {
    return workspaceHistoryStore.state.past.length > 0;
  },

  canRedo(): boolean {
    return workspaceHistoryStore.state.future.length > 0;
  },

  clearHistory(): void {
    workspaceHistoryStore.setState(() => ({
      past: [],
      future: []
    }));
  },

  switchWorkspace(id: string): void {
    workspaceStore.setState((state) => {
      if (!state.workspaces[id]) return state;
      return {
        ...state,
        active: id
      };
    });
    resetTransientWorkspaceState();
    workspaceActions.clearHistory();
  },

  saveWorkspace(ws: Workspace): void {
    assertWorkspaceInvariants(ws);
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

  setSidebarWidthMode(mode: SidebarWidthMode): void {
    try {
      localStorage.setItem('nora:sidebar-width-mode', mode);
      localStorage.setItem('nora:sidebar-mode', mode);
    } catch {
      // ignore
    }
    dndStore.setState((state) => {
      const isVisible = state.isSidebarPinned || state.isSidebarPeeking;
      return {
        ...state,
        sidebarWidthMode: mode,
        sidebarMode: isVisible ? mode : 'hidden'
      };
    });
  },

  toggleSidebarWidth(): void {
    const current = dndStore.state.sidebarWidthMode;
    const next: SidebarWidthMode = current === 'expanded' ? 'compact' : 'expanded';
    workspaceActions.setSidebarWidthMode(next);
  },

  setSidebarPinned(pinned: boolean): void {
    try {
      localStorage.setItem('nora:sidebar-pinned', String(pinned));
      if (pinned) {
        localStorage.setItem('nora:sidebar-mode', dndStore.state.sidebarWidthMode);
      } else {
        localStorage.setItem('nora:sidebar-mode', 'hidden');
      }
    } catch {
      // ignore
    }
    dndStore.setState((state) => ({
      ...state,
      isSidebarPinned: pinned,
      isSidebarPeeking: false,
      sidebarMode: pinned ? state.sidebarWidthMode : 'hidden'
    }));
  },

  toggleSidebarPinned(): void {
    const current = dndStore.state.isSidebarPinned;
    workspaceActions.setSidebarPinned(!current);
  },

  setSidebarPeeking(peeking: boolean): void {
    dndStore.setState((state) => {
      if (state.isSidebarPinned) {
        return state;
      }
      return {
        ...state,
        isSidebarPeeking: peeking,
        sidebarMode: peeking ? state.sidebarWidthMode : 'hidden'
      };
    });
  },

  setSidebarMode(mode: SidebarMode): void {
    const widthMode: SidebarWidthMode = mode === 'hidden' ? dndStore.state.sidebarWidthMode : mode;
    const pinned = mode !== 'hidden';
    try {
      localStorage.setItem('nora:sidebar-pinned', String(pinned));
      localStorage.setItem('nora:sidebar-mode', pinned ? widthMode : 'hidden');
      localStorage.setItem('nora:sidebar-width-mode', widthMode);
    } catch {
      // ignore
    }
    dndStore.setState((state) => ({
      ...state,
      isSidebarPinned: pinned,
      isSidebarPeeking: false,
      sidebarWidthMode: mode === 'hidden' ? state.sidebarWidthMode : mode,
      sidebarMode: mode === 'hidden' ? 'hidden' : mode
    }));
  },

  cycleSidebarMode(): void {
    workspaceActions.toggleSidebarWidth();
  },

  toggleSidebar(): void {
    const { isSidebarPinned, isSidebarPeeking } = dndStore.state;
    if (!isSidebarPinned) {
      workspaceActions.setSidebarPeeking(!isSidebarPeeking);
    } else {
      workspaceActions.setSidebarPinned(false);
    }
  },

  saveCurrentLayoutAs(name: string): string {
    let newId = '';
    workspaceStore.setState((state) => {
      const activeWs = state.workspaces[state.active];
      if (!activeWs) return state;

      newId = generateRandomId('ws');
      const originPreset =
        activeWs.sourcePresetId ||
        (activeWs.id === MUSICBEE_PRESET.id ? MUSICBEE_PRESET.id : DEFAULT_PRESET.id);
      const newWs: Workspace = {
        ...activeWs,
        id: newId,
        name: name.trim() || activeWs.name,
        sourcePresetId: originPreset,
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
    workspaceActions.clearHistory();
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
    const isTargetConfirmDeleted = dndStore.state.deleteTargetWorkspaceId === id;
    workspaceStore.setState((state) => {
      const { [id]: _, ...restWorkspaces } = state.workspaces;
      return {
        ...state,
        workspaces: restWorkspaces,
        active: state.active === id ? DEFAULT_PRESET.id : state.active
      };
    });
    if (isActiveDeleted) {
      resetTransientWorkspaceState();
    } else {
      if (isTargetRenamingDeleted) {
        dndStore.setState((s) => ({
          ...s,
          targetWorkspaceId: null,
          isSaveLayoutModalOpen: false,
          saveLayoutModalMode: 'save'
        }));
      }
      if (isTargetConfirmDeleted) {
        dndStore.setState((s) => ({
          ...s,
          deleteTargetWorkspaceId: null,
          isDeleteConfirmModalOpen: false
        }));
      }
    }
    workspaceActions.clearHistory();
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
      const originPreset =
        sourceWs.sourcePresetId ||
        (sourceWs.id === MUSICBEE_PRESET.id ? MUSICBEE_PRESET.id : DEFAULT_PRESET.id);
      const finalName = newName?.trim() || `${sourceWs.name} (Copy)`;
      const duplicatedWs: Workspace = {
        ...sourceWs,
        id: newId,
        name: finalName,
        sourcePresetId: originPreset,
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
    workspaceActions.clearHistory();
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

      if (type === 'playlists' || type === 'navigation') {
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
        const targetTabGroup = findRightsideTabGroup(activeWs);

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
  },

  openDeleteConfirmModal(workspaceId: string): void {
    if (workspaceId === DEFAULT_PRESET.id || workspaceId === MUSICBEE_PRESET.id) {
      return;
    }
    dndStore.setState((state) => ({
      ...state,
      isDeleteConfirmModalOpen: true,
      deleteTargetWorkspaceId: workspaceId
    }));
  },

  closeDeleteConfirmModal(): void {
    dndStore.setState((state) => ({
      ...state,
      isDeleteConfirmModalOpen: false,
      deleteTargetWorkspaceId: null
    }));
  },

  exportWorkspace(id?: string): NoraLayoutExport | null {
    const targetId = id ?? workspaceStore.state.active;
    const ws = workspaceStore.state.workspaces[targetId];
    if (!ws) return null;
    return createLayoutExport(ws);
  },

  importWorkspace(untrustedData: unknown): {
    success: boolean;
    workspaceId?: string;
    error?: string;
  } {
    if (!untrustedData || typeof untrustedData !== 'object') {
      return { success: false, error: 'Invalid file format: expected a JSON object' };
    }

    const untrustedObj = untrustedData as Record<string, unknown>;
    const rawWs =
      untrustedObj.format === 'nora-layout' && untrustedObj.workspace
        ? untrustedObj.workspace
        : untrustedData;

    const sanitized = sanitizeWorkspace(rawWs);
    if (!sanitized) {
      return {
        success: false,
        error: 'Layout validation failed: invalid layout tree or missing required views'
      };
    }

    const existingWorkspaces = workspaceStore.state.workspaces;
    const newId = generateRandomId('ws');

    // Check for name collision
    const existingNames = new Set(
      Object.values(existingWorkspaces).map((w) => w.name.toLowerCase())
    );
    let finalName = sanitized.name;
    if (existingNames.has(finalName.toLowerCase())) {
      finalName = `${finalName} (Imported)`;
    }

    const importedWs: Workspace = {
      ...sanitized,
      id: newId,
      name: finalName,
      sourcePresetId: sanitized.sourcePresetId || DEFAULT_PRESET.id
    };

    workspaceStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        [newId]: importedWs
      },
      active: newId
    }));

    resetTransientWorkspaceState();
    workspaceActions.clearHistory();

    return { success: true, workspaceId: newId };
  }
};
