import {
  applyLayoutOp,
  assertWorkspaceInvariants,
  findAllTabGroups,
  findSplitNode
} from '@renderer/workspace/ops';
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { isSingleton } from '@renderer/workspace/registry';
import type {
  DropTarget,
  LayoutOp,
  PanelType,
  SplitNode,
  Workspace
} from '@renderer/workspace/types';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

interface WorkspaceModel {
  ws: Workspace;
}

const availablePanelTypes: PanelType[] = [
  'queue',
  'playlists',
  'lyrics',
  'now-playing',
  'track-info',
  'visualizer'
];

function getAllSplitNodes(node: Workspace['root'], out: SplitNode[] = []): SplitNode[] {
  if (node.kind === 'split') {
    out.push(node);
    for (const child of node.children) {
      getAllSplitNodes(child, out);
    }
  }
  return out;
}

// Command 1: Insert Panel
class InsertPanelCommand implements fc.AsyncCommand<WorkspaceModel, Workspace> {
  constructor(
    readonly panelType: PanelType,
    readonly axis: 'x' | 'y',
    readonly before: boolean,
    readonly targetIndexChoice: number,
    readonly isTabTarget: boolean
  ) {}

  check(m: Readonly<WorkspaceModel>): boolean {
    if (isSingleton(this.panelType)) {
      const exists = Object.values(m.ws.panels).some((p) => p.type === this.panelType);
      if (exists) return false;
    }
    return Object.keys(m.ws.panels).length > 0;
  }

  async run(m: WorkspaceModel, _real: Workspace): Promise<void> {
    const panelIds = Object.keys(m.ws.panels);
    const targetPanelId = panelIds[this.targetIndexChoice % panelIds.length];
    const targetPanel = m.ws.panels[targetPanelId];

    let at: DropTarget;
    if (
      this.isTabTarget &&
      targetPanel?.type !== 'router-view' &&
      targetPanel?.type !== 'playlists'
    ) {
      at = { k: 'tab-into', tabsId: targetPanelId };
    } else {
      at = {
        k: 'split-into',
        targetPanelId,
        axis: this.axis,
        before: this.before
      };
    }

    const op: LayoutOp = {
      t: 'panel.insert',
      type: this.panelType,
      at
    };

    const previousWs = m.ws;
    try {
      const nextWs = applyLayoutOp(m.ws, op);
      assertWorkspaceInvariants(nextWs);
      m.ws = nextWs;
    } catch (err) {
      // On any rejected op, the original workspace MUST remain strictly valid
      assertWorkspaceInvariants(previousWs);
    }
  }

  toString(): string {
    return `InsertPanel(${this.panelType}, axis=${this.axis}, tab=${this.isTabTarget})`;
  }
}

// Command 2: Close Panel
class ClosePanelCommand implements fc.AsyncCommand<WorkspaceModel, Workspace> {
  constructor(readonly panelIndexChoice: number) {}

  check(m: Readonly<WorkspaceModel>): boolean {
    const closable = Object.values(m.ws.panels).filter((p) => p.type !== 'router-view');
    return closable.length > 0 && Object.keys(m.ws.panels).length > 1;
  }

  async run(m: WorkspaceModel, _real: Workspace): Promise<void> {
    const closable = Object.values(m.ws.panels).filter((p) => p.type !== 'router-view');
    const panelToClose = closable[this.panelIndexChoice % closable.length];

    const op: LayoutOp = {
      t: 'panel.close',
      panelId: panelToClose.id
    };

    const previousWs = m.ws;
    try {
      const nextWs = applyLayoutOp(m.ws, op);
      assertWorkspaceInvariants(nextWs);
      m.ws = nextWs;
    } catch (err) {
      assertWorkspaceInvariants(previousWs);
    }
  }

  toString(): string {
    return `ClosePanel`;
  }
}

// Command 3: Move Panel
class MovePanelCommand implements fc.AsyncCommand<WorkspaceModel, Workspace> {
  constructor(
    readonly sourceIndexChoice: number,
    readonly targetIndexChoice: number,
    readonly axis: 'x' | 'y',
    readonly before: boolean
  ) {}

  check(m: Readonly<WorkspaceModel>): boolean {
    return Object.keys(m.ws.panels).length >= 2;
  }

  async run(m: WorkspaceModel, _real: Workspace): Promise<void> {
    const panelIds = Object.keys(m.ws.panels);
    const sourcePanelId = panelIds[this.sourceIndexChoice % panelIds.length];
    const remainingIds = panelIds.filter((id) => id !== sourcePanelId);
    if (remainingIds.length === 0) return;
    const targetPanelId = remainingIds[this.targetIndexChoice % remainingIds.length];

    const at: DropTarget = {
      k: 'split-into',
      targetPanelId,
      axis: this.axis,
      before: this.before
    };

    const op: LayoutOp = {
      t: 'panel.move',
      panelId: sourcePanelId,
      at
    };

    const previousWs = m.ws;
    try {
      const nextWs = applyLayoutOp(m.ws, op);
      assertWorkspaceInvariants(nextWs);
      m.ws = nextWs;
    } catch (err) {
      assertWorkspaceInvariants(previousWs);
    }
  }

  toString(): string {
    return `MovePanel(axis=${this.axis})`;
  }
}

// Command 4: Split Weights
class SplitWeightsCommand implements fc.AsyncCommand<WorkspaceModel, Workspace> {
  constructor(
    readonly splitIndexChoice: number,
    readonly rawWeights: number[]
  ) {}

  check(m: Readonly<WorkspaceModel>): boolean {
    const splits = getAllSplitNodes(m.ws.root);
    return splits.length > 0;
  }

  async run(m: WorkspaceModel, _real: Workspace): Promise<void> {
    const splits = getAllSplitNodes(m.ws.root);
    const targetSplit = splits[this.splitIndexChoice % splits.length];
    const numChildren = targetSplit.children.length;

    const weights = Array.from({ length: numChildren }, (_, i) =>
      Math.max(0.01, this.rawWeights[i % this.rawWeights.length] ?? 0.25)
    );

    const op: LayoutOp = {
      t: 'split.weights',
      splitId: targetSplit.id,
      weights
    };

    const previousWs = m.ws;
    try {
      const nextWs = applyLayoutOp(m.ws, op);
      assertWorkspaceInvariants(nextWs);
      m.ws = nextWs;
    } catch (err) {
      assertWorkspaceInvariants(previousWs);
    }
  }

  toString(): string {
    return `SplitWeights`;
  }
}

// Command 5: Tabs Activate
class TabsActivateCommand implements fc.AsyncCommand<WorkspaceModel, Workspace> {
  constructor(
    readonly tgIndexChoice: number,
    readonly tabIndexChoice: number
  ) {}

  check(m: Readonly<WorkspaceModel>): boolean {
    const tabGroups = findAllTabGroups(m.ws.root);
    return tabGroups.length > 0 && tabGroups.some((tg) => tg.tabs.length > 1);
  }

  async run(m: WorkspaceModel, _real: Workspace): Promise<void> {
    const tabGroups = findAllTabGroups(m.ws.root).filter((tg) => tg.tabs.length > 1);
    const targetTg = tabGroups[this.tgIndexChoice % tabGroups.length];
    const activeTab = targetTg.tabs[this.tabIndexChoice % targetTg.tabs.length];

    const op: LayoutOp = {
      t: 'tabs.activate',
      tabsId: targetTg.id,
      panelId: activeTab
    };

    const nextWs = applyLayoutOp(m.ws, op);
    assertWorkspaceInvariants(nextWs);
    m.ws = nextWs;
  }

  toString(): string {
    return `TabsActivate`;
  }
}

describe('Workspace Layout Invariant Model-Based Testing (Fast-Check)', () => {
  it('Property: 500 random valid operational command sequences preserve all structural invariants', async () => {
    const commandsArbitrary = fc.commands(
      [
        fc
          .record({
            panelType: fc.constantFrom(...availablePanelTypes),
            axis: fc.constantFrom('x' as const, 'y' as const),
            before: fc.boolean(),
            targetIndexChoice: fc.nat(),
            isTabTarget: fc.boolean()
          })
          .map(
            (r) =>
              new InsertPanelCommand(
                r.panelType,
                r.axis,
                r.before,
                r.targetIndexChoice,
                r.isTabTarget
              )
          ),
        fc
          .record({
            panelIndexChoice: fc.nat()
          })
          .map((r) => new ClosePanelCommand(r.panelIndexChoice)),
        fc
          .record({
            sourceIndexChoice: fc.nat(),
            targetIndexChoice: fc.nat(),
            axis: fc.constantFrom('x' as const, 'y' as const),
            before: fc.boolean()
          })
          .map(
            (r) => new MovePanelCommand(r.sourceIndexChoice, r.targetIndexChoice, r.axis, r.before)
          ),
        fc
          .record({
            splitIndexChoice: fc.nat(),
            rawWeights: fc.array(fc.double({ min: 0.05, max: 0.95 }), {
              minLength: 2,
              maxLength: 4
            })
          })
          .map((r) => new SplitWeightsCommand(r.splitIndexChoice, r.rawWeights)),
        fc
          .record({
            tgIndexChoice: fc.nat(),
            tabIndexChoice: fc.nat()
          })
          .map((r) => new TabsActivateCommand(r.tgIndexChoice, r.tabIndexChoice))
      ],
      { maxCommands: 25 }
    );

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(DEFAULT_PRESET, MUSICBEE_PRESET),
        commandsArbitrary,
        async (initialPreset, cmds) => {
          const s = () => ({
            model: { ws: structuredClone(initialPreset) },
            real: structuredClone(initialPreset)
          });
          await fc.asyncModelRun(s, cmds);
        }
      ),
      { numRuns: 500 }
    );
  }, 60000);
});
