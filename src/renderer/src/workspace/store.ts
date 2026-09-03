import { Store } from '@tanstack/store';

import { applyLayoutOp } from './ops';
import { loadWorkspaceState, saveWorkspaceStateDebounced } from './persistence';
import type { LayoutOp, PanelInstanceId, Workspace, WorkspaceState } from './types';

export interface TransientWorkspaceState {
  isDragging: boolean;
  currentDrag: {
    panelId: PanelInstanceId;
    sourceNodeId?: string;
  } | null;
  hoveredDropTarget: string | null;
  maximizedPanelId: PanelInstanceId | null;
}

export const workspaceStore = new Store<WorkspaceState>(loadWorkspaceState());

export const dndStore = new Store<TransientWorkspaceState>({
  isDragging: false,
  currentDrag: null,
  hoveredDropTarget: null,
  maximizedPanelId: null
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

  setHoveredDropTarget(target: DropTarget | null): void {
    dndStore.setState((state) => ({
      ...state,
      hoveredDropTarget: target
    }));
  }
};
