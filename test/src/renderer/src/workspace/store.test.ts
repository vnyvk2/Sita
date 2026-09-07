import { findTabGroupContainingPanel } from '@renderer/workspace/ops';
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
      maximizedPanelId: null,
      isToolbarCollapsed: false,
      sidebarMode: 'expanded',
      isSaveLayoutModalOpen: false,
      saveLayoutModalMode: 'save',
      targetWorkspaceId: null
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
        at: { k: 'split-into', targetPanelId: 'p_main_default', axis: 'x', before: false }
      });

      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      const hasQueue = Object.values(activeWs.panels).some((p) => p.type === 'queue');
      expect(hasQueue).toBe(true);
    });

    it('updates panel local state reactively', () => {
      workspaceActions.updatePanelLocal('p_main_default', 'testScroll', 350);
      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(activeWs.panels.p_main_default.local.testScroll).toBe(350);

      // Functional updater
      workspaceActions.updatePanelLocal<number>(
        'p_main_default',
        'testScroll',
        (prev) => (prev ?? 0) + 50
      );
      const updatedWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(updatedWs.panels.p_main_default.local.testScroll).toBe(400);
    });

    it('toggles maximized panel in dndStore', () => {
      expect(dndStore.state.maximizedPanelId).toBeNull();
      workspaceActions.toggleMaximizePanel('p_main_default');
      expect(dndStore.state.maximizedPanelId).toBe('p_main_default');
      workspaceActions.toggleMaximizePanel('p_main_default');
      expect(dndStore.state.maximizedPanelId).toBeNull();
    });

    describe('saveCurrentLayoutAs', () => {
      it('deep clones active workspace with a new id and switches to it', () => {
        const activeBefore = workspaceStore.state.workspaces[workspaceStore.state.active];
        const newId = workspaceActions.saveCurrentLayoutAs('My Custom Layout');

        expect(newId).toMatch(/^ws_/);
        expect(workspaceStore.state.active).toBe(newId);

        const newWs = workspaceStore.state.workspaces[newId];
        expect(newWs).toBeDefined();
        expect(newWs.name).toBe('My Custom Layout');
        expect(newWs.id).toBe(newId);

        // Deep clone verification: objects must not be shared by reference
        expect(newWs.root).not.toBe(activeBefore.root);
        expect(newWs.panels).not.toBe(activeBefore.panels);
        expect(newWs.root).toEqual(activeBefore.root);
      });

      it('falls back to active workspace name if name is empty', () => {
        const newId = workspaceActions.saveCurrentLayoutAs('   ');
        const newWs = workspaceStore.state.workspaces[newId];
        expect(newWs.name).toBe(DEFAULT_PRESET.name);
      });
    });

    describe('deleteWorkspace', () => {
      it('refuses to delete DEFAULT_PRESET and MUSICBEE_PRESET', () => {
        expect(workspaceActions.deleteWorkspace(DEFAULT_PRESET.id)).toBe(false);
        expect(workspaceStore.state.workspaces[DEFAULT_PRESET.id]).toBeDefined();

        expect(workspaceActions.deleteWorkspace(MUSICBEE_PRESET.id)).toBe(false);
        expect(workspaceStore.state.workspaces[MUSICBEE_PRESET.id]).toBeDefined();
      });

      it('deletes custom workspace and resets active to DEFAULT_PRESET if deleted workspace was active', () => {
        const newId = workspaceActions.saveCurrentLayoutAs('To Delete');
        expect(workspaceStore.state.active).toBe(newId);

        const result = workspaceActions.deleteWorkspace(newId);
        expect(result).toBe(true);
        expect(workspaceStore.state.workspaces[newId]).toBeUndefined();
        expect(workspaceStore.state.active).toBe(DEFAULT_PRESET.id);
      });

      it('deletes custom workspace and preserves active if deleted workspace was not active', () => {
        const id1 = workspaceActions.saveCurrentLayoutAs('WS 1');
        const id2 = workspaceActions.saveCurrentLayoutAs('WS 2');
        expect(workspaceStore.state.active).toBe(id2);

        const result = workspaceActions.deleteWorkspace(id1);
        expect(result).toBe(true);
        expect(workspaceStore.state.workspaces[id1]).toBeUndefined();
        expect(workspaceStore.state.active).toBe(id2);
      });

      it('returns false for non-existent workspace', () => {
        expect(workspaceActions.deleteWorkspace('non_existent_id')).toBe(false);
      });

      it('cleans up maximizedPanelId and targetWorkspaceId when deleting active workspace', () => {
        const customId = workspaceActions.saveCurrentLayoutAs('To Delete');
        dndStore.setState((s) => ({
          ...s,
          maximizedPanelId: 'some_panel',
          targetWorkspaceId: customId,
          isSaveLayoutModalOpen: true,
          saveLayoutModalMode: 'rename'
        }));

        const result = workspaceActions.deleteWorkspace(customId);
        expect(result).toBe(true);
        expect(dndStore.state.maximizedPanelId).toBeNull();
        expect(dndStore.state.targetWorkspaceId).toBeNull();
        expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);
        expect(dndStore.state.saveLayoutModalMode).toBe('save');
      });
    });

    describe('renameWorkspace', () => {
      it('renames an existing workspace and trims whitespace', () => {
        const newId = workspaceActions.saveCurrentLayoutAs('Original');
        const result = workspaceActions.renameWorkspace(newId, '  Renamed Workspace  ');

        expect(result).toBe(true);
        expect(workspaceStore.state.workspaces[newId].name).toBe('Renamed Workspace');
      });

      it('rejects empty or whitespace-only names', () => {
        const newId = workspaceActions.saveCurrentLayoutAs('Original');
        expect(workspaceActions.renameWorkspace(newId, '')).toBe(false);
        expect(workspaceActions.renameWorkspace(newId, '   ')).toBe(false);
        expect(workspaceStore.state.workspaces[newId].name).toBe('Original');
      });

      it('returns false when renaming non-existent workspace', () => {
        expect(workspaceActions.renameWorkspace('unknown_id', 'New Name')).toBe(false);
      });

      it('returns false when attempting to rename default presets', () => {
        expect(workspaceActions.renameWorkspace(DEFAULT_PRESET.id, 'New Name')).toBe(false);
        expect(workspaceStore.state.workspaces[DEFAULT_PRESET.id].name).toBe(DEFAULT_PRESET.name);

        expect(workspaceActions.renameWorkspace(MUSICBEE_PRESET.id, 'New Name')).toBe(false);
        expect(workspaceStore.state.workspaces[MUSICBEE_PRESET.id].name).toBe(MUSICBEE_PRESET.name);
      });
    });

    describe('duplicateWorkspace', () => {
      it('duplicates workspace with default Copy suffix when newName is omitted', () => {
        const newId = workspaceActions.duplicateWorkspace(DEFAULT_PRESET.id);

        expect(newId).toMatch(/^ws_/);
        expect(workspaceStore.state.active).toBe(newId);

        const cloned = workspaceStore.state.workspaces[newId];
        expect(cloned.name).toBe(`${DEFAULT_PRESET.name} (Copy)`);
        expect(cloned.root).not.toBe(DEFAULT_PRESET.root);
        expect(cloned.panels).not.toBe(DEFAULT_PRESET.panels);
        expect(cloned.root).toEqual(DEFAULT_PRESET.root);
      });

      it('duplicates workspace with custom newName', () => {
        const newId = workspaceActions.duplicateWorkspace(MUSICBEE_PRESET.id, 'My MB Clone');

        expect(workspaceStore.state.active).toBe(newId);
        expect(workspaceStore.state.workspaces[newId].name).toBe('My MB Clone');
      });

      it('returns empty string if source workspace does not exist', () => {
        expect(workspaceActions.duplicateWorkspace('non_existent_id')).toBe('');
      });
    });

    describe('toggleOrOpenPanel', () => {
      it('inserts panel when it does not exist in active workspace', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        const wsBefore = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(Object.values(wsBefore.panels).some((p) => p.type === 'queue')).toBe(false);

        workspaceActions.toggleOrOpenPanel('queue');

        const wsAfter = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        const queuePanel = Object.values(wsAfter.panels).find((p) => p.type === 'queue');
        expect(queuePanel).toBeDefined();
      });

      it('opens playlists to the left of router-view', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('playlists');

        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(ws.root.kind).toBe('split');
        if (ws.root.kind === 'split') {
          expect(ws.root.axis).toBe('x');
          expect(ws.root.children).toHaveLength(2);
          const leftChild = ws.root.children[0];
          const rightChild = ws.root.children[1];
          expect(leftChild.kind).toBe('panel');
          expect(rightChild.kind).toBe('panel');
          if (leftChild.kind === 'panel' && rightChild.kind === 'panel') {
            expect(ws.panels[leftChild.panel]?.type).toBe('playlists');
            expect(ws.panels[rightChild.panel]?.type).toBe('router-view');
          }
        }
      });

      it('opens queue to the right of router-view when only router-view exists', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('queue');

        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(ws.root.kind).toBe('split');
        if (ws.root.kind === 'split') {
          expect(ws.root.axis).toBe('x');
          expect(ws.root.children).toHaveLength(2);
          const leftChild = ws.root.children[0];
          const rightChild = ws.root.children[1];
          expect(leftChild.kind).toBe('panel');
          expect(rightChild.kind).toBe('panel');
          if (leftChild.kind === 'panel' && rightChild.kind === 'panel') {
            expect(ws.panels[leftChild.panel]?.type).toBe('router-view');
            expect(ws.panels[rightChild.panel]?.type).toBe('queue');
          }
        }
      });

      it('inserts lyrics as a tab alongside queue (converting it to a TabGroup) when queue is already open', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('queue');
        workspaceActions.toggleOrOpenPanel('lyrics');

        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(ws.root.kind).toBe('split');
        if (ws.root.kind === 'split') {
          const queuePanel = Object.values(ws.panels).find((p) => p.type === 'queue')!;
          const lyricsPanel = Object.values(ws.panels).find((p) => p.type === 'lyrics')!;
          expect(queuePanel).toBeDefined();
          expect(lyricsPanel).toBeDefined();

          const tabGroup = findTabGroupContainingPanel(ws.root, queuePanel.id);
          expect(tabGroup).toBeDefined();
          expect(tabGroup?.tabs).toEqual([queuePanel.id, lyricsPanel.id]);
          expect(tabGroup?.active).toBe(lyricsPanel.id);
        }
      });

      it('tabs into existing TabGroup as a 3rd tab when visualizer is opened', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('queue');
        workspaceActions.toggleOrOpenPanel('lyrics');
        workspaceActions.toggleOrOpenPanel('visualizer');

        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        const queuePanel = Object.values(ws.panels).find((p) => p.type === 'queue')!;
        const lyricsPanel = Object.values(ws.panels).find((p) => p.type === 'lyrics')!;
        const visualizerPanel = Object.values(ws.panels).find((p) => p.type === 'visualizer')!;

        expect(visualizerPanel).toBeDefined();
        const tabGroup = findTabGroupContainingPanel(ws.root, visualizerPanel.id);
        expect(tabGroup).toBeDefined();
        expect(tabGroup?.tabs).toEqual([queuePanel.id, lyricsPanel.id, visualizerPanel.id]);
        expect(tabGroup?.active).toBe(visualizerPanel.id);
      });

      it('tabs into t_right_mb as a 3rd tab when visualizer is opened in MUSICBEE_PRESET', () => {
        workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
        workspaceActions.toggleOrOpenPanel('visualizer');

        const ws = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
        const visualizerPanel = Object.values(ws.panels).find((p) => p.type === 'visualizer')!;
        expect(visualizerPanel).toBeDefined();

        const tabGroup = findTabGroupContainingPanel(ws.root, visualizerPanel.id);
        expect(tabGroup).toBeDefined();
        expect(tabGroup?.id).toBe('t_right_mb');
        expect(tabGroup?.tabs).toHaveLength(3);
        expect(tabGroup?.tabs).toContain(visualizerPanel.id);
        expect(tabGroup?.active).toBe(visualizerPanel.id);
      });

      it('opens queue on the right and does not tab into playlists when playlists is on the left', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('playlists');
        workspaceActions.toggleOrOpenPanel('queue');

        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        const playlistsPanel = Object.values(ws.panels).find((p) => p.type === 'playlists')!;
        const queuePanel = Object.values(ws.panels).find((p) => p.type === 'queue')!;

        expect(playlistsPanel).toBeDefined();
        expect(queuePanel).toBeDefined();

        expect(findTabGroupContainingPanel(ws.root, playlistsPanel.id)).toBeNull();
        expect(findTabGroupContainingPanel(ws.root, queuePanel.id)).toBeNull();
        expect(ws.root.kind).toBe('split');
      });

      it('closes standalone panel on shortcut toggle', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        // Insert queue
        workspaceActions.toggleOrOpenPanel('queue');
        let ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(Object.values(ws.panels).some((p) => p.type === 'queue')).toBe(true);

        // Toggle again -> should close it
        workspaceActions.toggleOrOpenPanel('queue');
        ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(Object.values(ws.panels).some((p) => p.type === 'queue')).toBe(false);
      });

      it('resets maximizedPanelId when closing a maximized standalone panel', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('queue');
        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        const queuePanel = Object.values(ws.panels).find((p) => p.type === 'queue')!;
        dndStore.setState((s) => ({ ...s, maximizedPanelId: queuePanel.id }));

        workspaceActions.toggleOrOpenPanel('queue');
        expect(dndStore.state.maximizedPanelId).toBeNull();
      });

      it('activates inactive tab in a TabGroup instead of closing it', () => {
        workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
        // In MUSICBEE_PRESET, t_right_mb has lyrics (active) and queue (inactive)
        const wsBefore = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
        const lyricsPanel = Object.values(wsBefore.panels).find((p) => p.type === 'lyrics')!;
        const queuePanel = Object.values(wsBefore.panels).find((p) => p.type === 'queue')!;
        expect(wsBefore.panels[lyricsPanel.id]).toBeDefined();
        expect(wsBefore.panels[queuePanel.id]).toBeDefined();

        // Trigger queue panel shortcut -> should activate it in tab group
        workspaceActions.toggleOrOpenPanel('queue');

        const wsAfter = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
        const tabs = findTabGroupContainingPanel(wsAfter.root, queuePanel.id);
        expect(tabs).toBeDefined();
        expect(tabs?.active).toBe(queuePanel.id);
      });

      it('closes active tab in a TabGroup when toggled again', () => {
        workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
        const wsBefore = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
        const lyricsPanel = Object.values(wsBefore.panels).find((p) => p.type === 'lyrics')!;

        // Lyrics is currently active in MUSICBEE_PRESET
        workspaceActions.toggleOrOpenPanel('lyrics');

        const wsAfter = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
        expect(wsAfter.panels[lyricsPanel.id]).toBeUndefined();
      });

      it('does not close router-view panel', () => {
        workspaceActions.switchWorkspace(DEFAULT_PRESET.id);
        workspaceActions.toggleOrOpenPanel('router-view');

        const ws = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
        expect(Object.values(ws.panels).some((p) => p.type === 'router-view')).toBe(true);
      });
    });

    describe('modal actions in dndStore', () => {
      it('opens and closes save layout modal and resets saveLayoutModalMode to default', () => {
        expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);

        workspaceActions.openSaveLayoutModal('save');
        expect(dndStore.state.isSaveLayoutModalOpen).toBe(true);
        expect(dndStore.state.saveLayoutModalMode).toBe('save');
        expect(dndStore.state.targetWorkspaceId).toBeNull();

        workspaceActions.openSaveLayoutModal('rename', 'ws_target_123');
        expect(dndStore.state.isSaveLayoutModalOpen).toBe(true);
        expect(dndStore.state.saveLayoutModalMode).toBe('rename');
        expect(dndStore.state.targetWorkspaceId).toBe('ws_target_123');

        workspaceActions.closeSaveLayoutModal();
        expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);
        expect(dndStore.state.saveLayoutModalMode).toBe('save');
        expect(dndStore.state.targetWorkspaceId).toBeNull();
      });
    });
  });
});
