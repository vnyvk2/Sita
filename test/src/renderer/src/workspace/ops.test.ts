import {
  applyLayoutOp,
  assertWorkspaceInvariants,
  normalizeWeights,
  WorkspaceInvariantError
} from '@renderer/workspace/ops';
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import type { SplitNode, TabGroupNode, Workspace } from '@renderer/workspace/types';
import { describe, expect, it } from 'vitest';

describe('Workspace System - Phase 0 Invariants and Operations', () => {
  describe('assertWorkspaceInvariants', () => {
    it('validates DEFAULT_PRESET without throwing', () => {
      expect(() => assertWorkspaceInvariants(DEFAULT_PRESET)).not.toThrow();
    });

    it('validates MUSICBEE_PRESET without throwing', () => {
      expect(() => assertWorkspaceInvariants(MUSICBEE_PRESET)).not.toThrow();
    });

    it('fails if workspace has no router-view panel', () => {
      const invalidWs: Workspace = {
        ...DEFAULT_PRESET,
        panels: {
          p_nav_default: DEFAULT_PRESET.panels.p_nav_default,
          p_main_default: {
            id: 'p_main_default',
            type: 'queue',
            local: {}
          }
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrowError(WorkspaceInvariantError);
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(/router-view/);
    });

    it('fails if workspace has duplicate router-view panels', () => {
      const invalidWs: Workspace = {
        ...DEFAULT_PRESET,
        panels: {
          ...DEFAULT_PRESET.panels,
          p_extra_main: {
            id: 'p_extra_main',
            type: 'router-view',
            local: {}
          }
        },
        root: {
          kind: 'split',
          id: 's_root_dup',
          axis: 'x',
          weights: [0.18, 0.41, 0.41],
          children: [
            { kind: 'panel', panel: 'p_nav_default' },
            { kind: 'panel', panel: 'p_main_default' },
            { kind: 'panel', panel: 'p_extra_main' }
          ]
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(/exactly 1 'router-view'/);
    });

    it('fails if singleton panel (navigation) is duplicated', () => {
      const invalidWs: Workspace = {
        ...DEFAULT_PRESET,
        panels: {
          ...DEFAULT_PRESET.panels,
          p_nav_2: {
            id: 'p_nav_2',
            type: 'navigation',
            local: {}
          }
        },
        root: {
          kind: 'split',
          id: 's_root_nav_dup',
          axis: 'x',
          weights: [0.18, 0.41, 0.41],
          children: [
            { kind: 'panel', panel: 'p_nav_default' },
            { kind: 'panel', panel: 'p_main_default' },
            { kind: 'panel', panel: 'p_nav_2' }
          ]
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(
        /Singleton panel type 'navigation'/
      );
    });

    it('fails if orphan panel exists in panels but is unreferenced in tree', () => {
      const invalidWs: Workspace = {
        ...DEFAULT_PRESET,
        panels: {
          ...DEFAULT_PRESET.panels,
          orphan_panel: {
            id: 'orphan_panel',
            type: 'queue',
            local: {}
          }
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(/Orphan panel found/);
    });

    it('fails if tree references a panel that does not exist in panels map', () => {
      const invalidWs: Workspace = {
        ...DEFAULT_PRESET,
        root: {
          kind: 'split',
          id: 's_root_missing',
          axis: 'x',
          weights: [0.18, 0.41, 0.41],
          children: [
            { kind: 'panel', panel: 'p_nav_default' },
            { kind: 'panel', panel: 'p_main_default' },
            { kind: 'panel', panel: 'non_existent_panel_id' }
          ]
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(
        /does not exist in workspace.panels/
      );
    });

    it('fails if split has fewer than 2 children', () => {
      const invalidWs: Workspace = {
        ...DEFAULT_PRESET,
        root: {
          kind: 'split',
          id: 's_single',
          axis: 'x',
          weights: [1.0],
          children: [{ kind: 'panel', panel: 'p_main_default' }]
        },
        panels: {
          p_main_default: DEFAULT_PRESET.panels.p_main_default
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(/between 2 and 4 children/);
    });

    it('fails if split nesting depth exceeds 3', () => {
      const invalidWs: Workspace = {
        id: 'ws_deep',
        name: 'Deep',
        schemaVersion: 1,
        frame: { playerBar: 'bottom', playerBarCompact: false },
        root: {
          kind: 'split',
          id: 'split_1',
          axis: 'x',
          weights: [0.5, 0.5],
          children: [
            { kind: 'panel', panel: 'p_nav_default' },
            {
              kind: 'split',
              id: 'split_2',
              axis: 'y',
              weights: [0.5, 0.5],
              children: [
                { kind: 'panel', panel: 'p_q1' },
                {
                  kind: 'split',
                  id: 'split_3',
                  axis: 'x',
                  weights: [0.5, 0.5],
                  children: [
                    { kind: 'panel', panel: 'p_q2' },
                    {
                      kind: 'split',
                      id: 'split_4',
                      axis: 'y',
                      weights: [0.5, 0.5],
                      children: [
                        { kind: 'panel', panel: 'p_main_default' },
                        { kind: 'panel', panel: 'p_q3' }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        panels: {
          p_nav_default: { id: 'p_nav_default', type: 'navigation', local: {} },
          p_main_default: { id: 'p_main_default', type: 'router-view', local: {} },
          p_q1: { id: 'p_q1', type: 'queue', local: {} },
          p_q2: { id: 'p_q2', type: 'lyrics', local: {} },
          p_q3: { id: 'p_q3', type: 'now-playing', local: {} }
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(/maximum nesting depth of 3/);
    });

    it('fails if tabgroup active tab is not in tabs array', () => {
      const mbSplit = MUSICBEE_PRESET.root as SplitNode;
      const invalidWs: Workspace = {
        ...MUSICBEE_PRESET,
        root: {
          ...mbSplit,
          children: [
            mbSplit.children[0],
            mbSplit.children[1],
            {
              kind: 'tabs',
              id: 't_bad',
              tabs: ['p_lyrics_mb'],
              active: 'p_queue_mb' // Not in tabs!
            }
          ]
        }
      };
      expect(() => assertWorkspaceInvariants(invalidWs)).toThrow(/is not present in its tabs list/);
    });
  });

  describe('normalizeWeights', () => {
    it('normalizes arbitrary numbers so that sum is exactly 1.0', () => {
      const weights = [100, 200, 300];
      const normalized = normalizeWeights(weights);
      expect(normalized).toHaveLength(3);
      const sum = normalized.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.0001);
    });

    it('handles equal distribution for zeros or negatives', () => {
      const weights = [0, 0, 0];
      const normalized = normalizeWeights(weights);
      expect(normalized).toEqual([0.3333, 0.3333, 0.3334]);
    });
  });

  describe('applyLayoutOp', () => {
    it('panel.insert: adds a panel to a split edge', () => {
      const nextWs = applyLayoutOp(DEFAULT_PRESET, {
        t: 'panel.insert',
        type: 'queue',
        at: { k: 'edge', splitId: 's_root_default', index: 2 }
      });

      expect(Object.keys(nextWs.panels)).toHaveLength(3);
      const queuePanel = Object.values(nextWs.panels).find((p) => p.type === 'queue');
      expect(queuePanel).toBeDefined();
      expect(nextWs.root.kind).toBe('split');
      if (nextWs.root.kind === 'split') {
        expect(nextWs.root.children).toHaveLength(3);
      }
      expect(() => assertWorkspaceInvariants(nextWs)).not.toThrow();
    });

    it('panel.insert: rejects duplicate insertion of singleton panel', () => {
      expect(() =>
        applyLayoutOp(DEFAULT_PRESET, {
          t: 'panel.insert',
          type: 'navigation',
          at: { k: 'edge', splitId: 's_root_default', index: 0 }
        })
      ).toThrow(/Cannot insert singleton panel type 'navigation'/);
    });

    it('panel.insert: allows duplicate insertion of visualizer', () => {
      let ws = applyLayoutOp(DEFAULT_PRESET, {
        t: 'panel.insert',
        type: 'visualizer',
        at: { k: 'edge', splitId: 's_root_default', index: 2 }
      });
      // Second visualizer into tabgroup or edge
      ws = applyLayoutOp(ws, {
        t: 'panel.insert',
        type: 'visualizer',
        at: { k: 'edge', splitId: 's_root_default', index: 3 }
      });
      const visualizers = Object.values(ws.panels).filter((p) => p.type === 'visualizer');
      expect(visualizers).toHaveLength(2);
      expect(() => assertWorkspaceInvariants(ws)).not.toThrow();
    });

    it('panel.close: closes a widget panel and collapses split when only 1 child remains', () => {
      const wsWithQueue = applyLayoutOp(DEFAULT_PRESET, {
        t: 'panel.insert',
        type: 'queue',
        at: { k: 'edge', splitId: 's_root_default', index: 2 }
      });
      const queueId = Object.values(wsWithQueue.panels).find((p) => p.type === 'queue')!.id;

      // Close queue
      const afterCloseQueue = applyLayoutOp(wsWithQueue, {
        t: 'panel.close',
        panelId: queueId
      });
      expect(afterCloseQueue.panels[queueId]).toBeUndefined();
      expect(Object.keys(afterCloseQueue.panels)).toHaveLength(2);
      expect(() => assertWorkspaceInvariants(afterCloseQueue)).not.toThrow();

      // Now close navigation -> only router-view remains -> split should collapse into a single panel root!
      const afterCloseNav = applyLayoutOp(afterCloseQueue, {
        t: 'panel.close',
        panelId: 'p_nav_default'
      });
      expect(afterCloseNav.root.kind).toBe('panel');
      if (afterCloseNav.root.kind === 'panel') {
        expect(afterCloseNav.root.panel).toBe('p_main_default');
      }
      expect(Object.keys(afterCloseNav.panels)).toHaveLength(1);
      expect(() => assertWorkspaceInvariants(afterCloseNav)).not.toThrow();
    });

    it('panel.close: throws when attempting to close router-view', () => {
      expect(() =>
        applyLayoutOp(DEFAULT_PRESET, {
          t: 'panel.close',
          panelId: 'p_main_default'
        })
      ).toThrow(/'router-view' panel cannot be closed/);
    });

    it('panel.move: preserves local state when moving a panel to a new split slot', () => {
      // Modify local state of navigation
      const wsWithLocal: Workspace = {
        ...DEFAULT_PRESET,
        panels: {
          ...DEFAULT_PRESET.panels,
          p_nav_default: {
            ...DEFAULT_PRESET.panels.p_nav_default,
            local: { scrollPos: 420, filter: 'heavy-metal' }
          }
        }
      };

      // Move navigation to index 1 (after router-view)
      const movedWs = applyLayoutOp(wsWithLocal, {
        t: 'panel.move',
        panelId: 'p_nav_default',
        at: { k: 'edge', splitId: 's_root_default', index: 1 }
      });

      // Assert local state survived!
      expect(movedWs.panels.p_nav_default.local).toEqual({
        scrollPos: 420,
        filter: 'heavy-metal'
      });
      expect(() => assertWorkspaceInvariants(movedWs)).not.toThrow();
    });

    it('tabs.activate: switches active tab in TabGroup', () => {
      const mbSplit = MUSICBEE_PRESET.root as SplitNode;
      const initialTabGroup = mbSplit.children[2] as TabGroupNode;
      expect(initialTabGroup.active).toBe('p_lyrics_mb');

      const switchedWs = applyLayoutOp(MUSICBEE_PRESET, {
        t: 'tabs.activate',
        tabsId: 't_right_mb',
        panelId: 'p_queue_mb'
      });

      const tabGroup = (switchedWs.root as SplitNode).children[2] as TabGroupNode;
      expect(tabGroup.active).toBe('p_queue_mb');
      expect(() => assertWorkspaceInvariants(switchedWs)).not.toThrow();
    });

    it('tabs.extract: extracts a tab out of TabGroup into a split alongside it', () => {
      const extractedWs = applyLayoutOp(MUSICBEE_PRESET, {
        t: 'tabs.extract',
        panelId: 'p_lyrics_mb',
        axis: 'y'
      });

      expect(() => assertWorkspaceInvariants(extractedWs)).not.toThrow();
      const rightCol = (extractedWs.root as SplitNode).children[2] as SplitNode;
      expect(rightCol.kind).toBe('split');
      expect(rightCol.axis).toBe('y');
      expect(rightCol.children).toHaveLength(2);
    });

    it('split.weights: updates normalized weights of a split', () => {
      const updatedWs = applyLayoutOp(DEFAULT_PRESET, {
        t: 'split.weights',
        splitId: 's_root_default',
        weights: [0.3, 0.7]
      });

      if (updatedWs.root.kind === 'split') {
        expect(updatedWs.root.weights).toEqual([0.3, 0.7]);
      }
      expect(() => assertWorkspaceInvariants(updatedWs)).not.toThrow();
    });

    it('split.collapse: updates collapsed index of a split', () => {
      const collapsedWs = applyLayoutOp(DEFAULT_PRESET, {
        t: 'split.collapse',
        splitId: 's_root_default',
        childIndex: 0
      });

      if (collapsedWs.root.kind === 'split') {
        expect(collapsedWs.root.collapsed).toBe(0);
      }
      expect(() => assertWorkspaceInvariants(collapsedWs)).not.toThrow();
    });
  });

  describe('Sequential randomized operations stress test', () => {
    it('applies 50 sequential operations without ever violating workspace invariants', () => {
      let currentWs: Workspace = MUSICBEE_PRESET;

      const panelTypes: Array<'queue' | 'lyrics' | 'now-playing' | 'track-info' | 'visualizer'> = [
        'queue',
        'lyrics',
        'now-playing',
        'track-info',
        'visualizer'
      ];

      for (let i = 0; i < 50; i++) {
        const action = Math.floor(Math.random() * 3);

        if (action === 0) {
          // Try inserting a panel
          const type = panelTypes[Math.floor(Math.random() * panelTypes.length)];
          if (currentWs.root.kind === 'split' && currentWs.root.children.length < 4) {
            try {
              currentWs = applyLayoutOp(currentWs, {
                t: 'panel.insert',
                type,
                at: {
                  k: 'edge',
                  splitId: currentWs.root.id,
                  index: Math.floor(Math.random() * currentWs.root.children.length)
                }
              });
            } catch {
              // Expected if constraint hits
            }
          }
        } else if (action === 1) {
          // Try closing a non-router-view panel
          const closablePanels = Object.values(currentWs.panels).filter(
            (p) => p.type !== 'router-view'
          );
          if (closablePanels.length > 0) {
            const panelToClose = closablePanels[Math.floor(Math.random() * closablePanels.length)];
            try {
              currentWs = applyLayoutOp(currentWs, {
                t: 'panel.close',
                panelId: panelToClose.id
              });
            } catch {
              // Expected if it leaves empty workspace
            }
          }
        } else if (action === 2 && currentWs.root.kind === 'split') {
          // Resize split weights
          const count = currentWs.root.children.length;
          const randomWeights = Array.from({ length: count }, () => Math.random() + 0.1);
          currentWs = applyLayoutOp(currentWs, {
            t: 'split.weights',
            splitId: currentWs.root.id,
            weights: randomWeights
          });
        }

        // Must always satisfy invariants!
        assertWorkspaceInvariants(currentWs);
      }
    });
  });
});
