import { Store } from '@tanstack/store';

import { applyLayoutOp } from './ops';
import { loadWorkspaceState, saveWorkspaceStateDebounced } from './persistence';
import type {
  LayoutOp,
  NodeId,
  PanelInstanceId,
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
}

export const workspaceStore = new Store<WorkspaceState>(loadWorkspaceState());

export const dndStore = new Store<TransientWorkspaceState>({
  isDragging: false,
  currentDrag: null,
  hoveredDropTarget: null,
  maximizedPanelId: null,
  isToolbarCollapsed: initialToolbarCollapsed,
  sidebarMode: initialSidebarMode
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
  }
};
