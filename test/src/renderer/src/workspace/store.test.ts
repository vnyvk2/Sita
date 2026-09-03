import {
  getInitialWorkspaceState,
  sanitizeWorkspace,
  saveWorkspaceStateImmediate,
  WORKSPACE_STORAGE_KEY
} from '@renderer/workspace/persistence';
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

describe('Workspace Store and Persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    workspaceStore.setState(() => getInitialWorkspaceState());
    dndStore.setState(() => ({
      isDragging: false,
      currentDrag: null,
      hoveredDropTarget: null,
      maximizedPanelId: null
    }));
  });

  describe('persistence', () => {
    it('returns default initial state with default and musicbee presets', () => {
      const initial = getInitialWorkspaceState();
      expect(initial.active).toBe(DEFAULT_PRESET.id);
      expect(initial.workspaces[DEFAULT_PRESET.id]).toBeDefined();
      expect(initial.workspaces[MUSICBEE_PRESET.id]).toBeDefined();
    });

    it('sanitizes valid workspace without modifications', () => {
      const sanitized = sanitizeWorkspace(DEFAULT_PRESET);
      expect(sanitized).toEqual(DEFAULT_PRESET);
    });

    it('rejects corrupted workspace missing router-view', () => {
      const corrupted = {
        id: 'bad_ws',
        name: 'Bad',
        root: { kind: 'panel', panel: 'p1' },
        panels: { p1: { id: 'p1', type: 'queue', local: {} } }
      };
      const result = sanitizeWorkspace(corrupted);
      expect(result).toBeNull();
    });

    it('persists immediately to localStorage', () => {
      const state = getInitialWorkspaceState();
      saveWorkspaceStateImmediate(state);
      const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!).active).toBe(DEFAULT_PRESET.id);
    });
  });

  describe('workspaceActions', () => {
    it('switches active workspace', () => {
      workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
      expect(workspaceStore.state.active).toBe(MUSICBEE_PRESET.id);
    });

    it('dispatches layout ops to active workspace', () => {
      workspaceActions.dispatchOp({
        t: 'panel.insert',
        type: 'queue',
        at: { k: 'edge', splitId: 's_root_default', index: 2 }
      });

      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      const hasQueue = Object.values(activeWs.panels).some((p) => p.type === 'queue');
      expect(hasQueue).toBe(true);
    });

    it('updates panel local state reactively', () => {
      workspaceActions.updatePanelLocal('p_nav_default', 'testScroll', 350);
      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(activeWs.panels.p_nav_default.local.testScroll).toBe(350);

      // Functional updater
      workspaceActions.updatePanelLocal<number>(
        'p_nav_default',
        'testScroll',
        (prev) => (prev ?? 0) + 50
      );
      const updatedWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(updatedWs.panels.p_nav_default.local.testScroll).toBe(400);
    });

    it('toggles maximized panel in dndStore', () => {
      expect(dndStore.state.maximizedPanelId).toBeNull();
      workspaceActions.toggleMaximizePanel('p_nav_default');
      expect(dndStore.state.maximizedPanelId).toBe('p_nav_default');
      workspaceActions.toggleMaximizePanel('p_nav_default');
      expect(dndStore.state.maximizedPanelId).toBeNull();
    });
  });
});
