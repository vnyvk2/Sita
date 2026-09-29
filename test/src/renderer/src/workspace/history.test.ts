import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { workspaceActions, workspaceHistoryStore, workspaceStore } from '@renderer/workspace/store';
import type { Workspace } from '@renderer/workspace/types';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Workspace Layout History & Undo/Redo Engine', () => {
  beforeEach(() => {
    // Reset stores to default baseline
    const initialDefault = JSON.parse(JSON.stringify(DEFAULT_PRESET));
    const initialMusicBee = JSON.parse(JSON.stringify(MUSICBEE_PRESET));

    workspaceStore.setState(() => ({
      active: DEFAULT_PRESET.id,
      workspaces: {
        [DEFAULT_PRESET.id]: initialDefault,
        [MUSICBEE_PRESET.id]: initialMusicBee
      }
    }));

    workspaceActions.clearHistory();
  });

  it('initializes with empty history stacks and canUndo/canRedo false', () => {
    expect(workspaceHistoryStore.state.past).toEqual([]);
    expect(workspaceHistoryStore.state.future).toEqual([]);
    expect(workspaceActions.canUndo()).toBe(false);
    expect(workspaceActions.canRedo()).toBe(false);
  });

  it('records previous workspace snapshot in past on layout mutation', () => {
    const initialActive = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
    const initialPanelCount = Object.keys(initialActive.panels).length;

    // Insert a new panel targeting p_main_default
    workspaceActions.dispatchOp({
      t: 'panel.insert',
      type: 'lyrics',
      at: {
        k: 'split-into',
        targetPanelId: 'p_main_default',
        axis: 'x',
        before: false
      }
    });

    // Check history
    expect(workspaceHistoryStore.state.past.length).toBe(1);
    expect(workspaceHistoryStore.state.future.length).toBe(0);
    expect(workspaceActions.canUndo()).toBe(true);
    expect(workspaceActions.canRedo()).toBe(false);

    // The recorded past snapshot has the initial panel count
    const pastSnapshot = workspaceHistoryStore.state.past[0];
    expect(Object.keys(pastSnapshot.panels).length).toBe(initialPanelCount);

    // The current active workspace has one additional panel
    const currentActive = workspaceStore.state.workspaces[DEFAULT_PRESET.id];
    expect(Object.keys(currentActive.panels).length).toBe(initialPanelCount + 1);
  });

  it('undoes a mutation and allows redoing it', () => {
    const initialPanelCount = Object.keys(
      workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels
    ).length;

    // Mutate: insert lyrics panel
    workspaceActions.dispatchOp({
      t: 'panel.insert',
      type: 'lyrics',
      at: {
        k: 'split-into',
        targetPanelId: 'p_main_default',
        axis: 'x',
        before: false
      }
    });

    expect(Object.keys(workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels).length).toBe(
      initialPanelCount + 1
    );

    // Perform Undo
    const undoResult = workspaceActions.undo();
    expect(undoResult).toBe(true);

    // Active workspace restored to initial state
    expect(Object.keys(workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels).length).toBe(
      initialPanelCount
    );
    expect(workspaceActions.canUndo()).toBe(false);
    expect(workspaceActions.canRedo()).toBe(true);
    expect(workspaceHistoryStore.state.future.length).toBe(1);

    // Perform Redo
    const redoResult = workspaceActions.redo();
    expect(redoResult).toBe(true);

    // Active workspace restored to mutated state
    expect(Object.keys(workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels).length).toBe(
      initialPanelCount + 1
    );
    expect(workspaceActions.canUndo()).toBe(true);
    expect(workspaceActions.canRedo()).toBe(false);
  });

  it('clears redo stack (future) when a new mutation occurs after undo', () => {
    // Mutation 1
    workspaceActions.dispatchOp({
      t: 'panel.insert',
      type: 'lyrics',
      at: {
        k: 'split-into',
        targetPanelId: 'p_main_default',
        axis: 'x',
        before: false
      }
    });

    // Undo Mutation 1
    workspaceActions.undo();
    expect(workspaceActions.canRedo()).toBe(true);

    // Mutation 2 (divergent branch)
    workspaceActions.dispatchOp({
      t: 'panel.insert',
      type: 'queue',
      at: {
        k: 'split-into',
        targetPanelId: 'p_main_default',
        axis: 'x',
        before: false
      }
    });

    // Future must now be cleared
    expect(workspaceActions.canRedo()).toBe(false);
    expect(workspaceHistoryStore.state.future.length).toBe(0);
    expect(workspaceHistoryStore.state.past.length).toBe(1);
  });

  it('caps history stack at 20 snapshots', () => {
    // Switch to MUSICBEE_PRESET which has a root split with 3 children
    workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
    const activeWs = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
    const rootSplit = activeWs.root;
    if (rootSplit.kind !== 'split') throw new Error('Expected split root');

    for (let i = 0; i < 25; i++) {
      const w1 = 0.1 + (i % 5) * 0.02;
      const w2 = 0.6;
      const w3 = 1.0 - w1 - w2;
      workspaceActions.dispatchOp({
        t: 'split.weights',
        splitId: rootSplit.id,
        weights: [w1, w2, w3]
      });
    }

    expect(workspaceHistoryStore.state.past.length).toBe(20);
  });

  it('clears history when switching workspaces to prevent cross-workspace leaks', () => {
    workspaceActions.dispatchOp({
      t: 'panel.insert',
      type: 'lyrics',
      at: {
        k: 'split-into',
        targetPanelId: 'p_main_default',
        axis: 'x',
        before: false
      }
    });

    expect(workspaceActions.canUndo()).toBe(true);

    // Switch workspace
    workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);

    expect(workspaceActions.canUndo()).toBe(false);
    expect(workspaceActions.canRedo()).toBe(false);
    expect(workspaceHistoryStore.state.past).toEqual([]);
    expect(workspaceHistoryStore.state.future).toEqual([]);
  });

  it('supports undoing a full layout reset (ws.reset)', () => {
    const initialPanelCount = Object.keys(
      workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels
    ).length;

    // Add panel
    workspaceActions.dispatchOp({
      t: 'panel.insert',
      type: 'lyrics',
      at: {
        k: 'split-into',
        targetPanelId: 'p_main_default',
        axis: 'x',
        before: false
      }
    });
    expect(Object.keys(workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels).length).toBe(
      initialPanelCount + 1
    );

    // Reset layout
    workspaceActions.dispatchOp({
      t: 'ws.reset',
      id: DEFAULT_PRESET.id,
      defaultPreset: DEFAULT_PRESET
    });
    expect(Object.keys(workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels).length).toBe(
      initialPanelCount
    );

    // Undo reset!
    workspaceActions.undo();
    expect(Object.keys(workspaceStore.state.workspaces[DEFAULT_PRESET.id].panels).length).toBe(
      initialPanelCount + 1
    );
  });

  it('does not push to past on no-op dispatchOp', () => {
    // Switch to MusicBee
    workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
    const activeWs = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];

    const findTabGroup = (node: Workspace['root']): string | null => {
      if (node.kind === 'tabs') return node.id;
      if (node.kind === 'split') {
        for (const child of node.children) {
          const res = findTabGroup(child);
          if (res) return res;
        }
      }
      return null;
    };

    const tabId = findTabGroup(activeWs.root);
    if (tabId) {
      // Activating the already active tab in MusicBee ('p_lyrics_mb')
      workspaceActions.dispatchOp({
        t: 'tabs.activate',
        tabsId: tabId,
        panelId: 'p_lyrics_mb'
      });
      // Should remain 0 because it was already active (no state change)
      expect(workspaceHistoryStore.state.past.length).toBe(0);
    }
  });

  it('returns false when trying to undo empty past or redo empty future', () => {
    expect(workspaceActions.undo()).toBe(false);
    expect(workspaceActions.redo()).toBe(false);
  });
});
