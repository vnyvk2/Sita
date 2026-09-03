import { getPanelDefinition, isSingleton } from './registry';
import type {
  DropTarget,
  LayoutNode,
  LayoutOp,
  PanelInstanceId,
  PanelRefNode,
  PanelType,
  SplitNode,
  TabGroupNode,
  Workspace
} from './types';

// ==========================================
// Invariant Verification
// ==========================================

export class WorkspaceInvariantError extends Error {
  constructor(message: string) {
    super(`WorkspaceInvariantError: ${message}`);
    this.name = 'WorkspaceInvariantError';
  }
}

/**
 * Validates all core invariants of a Workspace:
 *
 * 1. Single router-view instance in panels and referenced exactly once in root.
 * 2. Every panel instance in `panels` is referenced exactly once in root (no orphans, no missing
 *    references).
 * 3. Singletons appear at most once across panels.
 * 4. SplitNode constraints: children in [2, 4], weights match children count, sum to 1.0, depth <= 3.
 * 5. TabGroupNode constraints: tabs >= 1, active is in tabs, no duplicate tabs.
 */
export function assertWorkspaceInvariants(ws: Workspace): void {
  const panelRefCounts = new Map<string, number>();

  function countReferences(node: LayoutNode, currentDepth: number): void {
    if (node.kind === 'panel') {
      panelRefCounts.set(node.panel, (panelRefCounts.get(node.panel) ?? 0) + 1);
      return;
    }

    if (node.kind === 'tabs') {
      if (!node.tabs || node.tabs.length < 1) {
        throw new WorkspaceInvariantError(`TabGroup '${node.id}' must have at least 1 tab.`);
      }
      const uniqueTabs = new Set(node.tabs);
      if (uniqueTabs.size !== node.tabs.length) {
        throw new WorkspaceInvariantError(`TabGroup '${node.id}' contains duplicate tabs.`);
      }
      if (!uniqueTabs.has(node.active)) {
        throw new WorkspaceInvariantError(
          `TabGroup '${node.id}' active tab '${node.active}' is not present in its tabs list.`
        );
      }
      for (const tabId of node.tabs) {
        panelRefCounts.set(tabId, (panelRefCounts.get(tabId) ?? 0) + 1);
      }
      return;
    }

    if (node.kind === 'split') {
      if (currentDepth > 3) {
        throw new WorkspaceInvariantError(
          `SplitNode '${node.id}' exceeds maximum nesting depth of 3 (depth = ${currentDepth}).`
        );
      }
      if (!node.children || node.children.length < 2 || node.children.length > 4) {
        throw new WorkspaceInvariantError(
          `SplitNode '${node.id}' must have between 2 and 4 children, got ${node.children?.length ?? 0}.`
        );
      }
      if (!node.weights || node.weights.length !== node.children.length) {
        throw new WorkspaceInvariantError(
          `SplitNode '${node.id}' weights length (${node.weights?.length}) does not match children length (${node.children.length}).`
        );
      }

      const weightSum = node.weights.reduce((sum, w) => sum + w, 0);
      if (Math.abs(weightSum - 1.0) > 0.015) {
        throw new WorkspaceInvariantError(
          `SplitNode '${node.id}' weights must sum to 1.0, got ${weightSum.toFixed(4)}.`
        );
      }
      for (const w of node.weights) {
        if (!Number.isFinite(w) || w <= 0) {
          throw new WorkspaceInvariantError(
            `SplitNode '${node.id}' has invalid weight: ${w}. All weights must be positive finite numbers.`
          );
        }
      }

      for (const child of node.children) {
        countReferences(child, currentDepth + 1);
      }
    }
  }

  // 1. Traverse and count references
  countReferences(ws.root, 1);

  // 2. Invariant 1: Exactly one router-view
  const routerViewPanels = Object.values(ws.panels).filter((p) => p.type === 'router-view');
  if (routerViewPanels.length !== 1) {
    throw new WorkspaceInvariantError(
      `Workspace must have exactly 1 'router-view' panel instance, found ${routerViewPanels.length}.`
    );
  }
  const routerViewId = routerViewPanels[0].id;
  const routerViewRefs = panelRefCounts.get(routerViewId) ?? 0;
  if (routerViewRefs !== 1) {
    throw new WorkspaceInvariantError(
      `'router-view' panel '${routerViewId}' must be referenced exactly once in layout tree, found ${routerViewRefs} references.`
    );
  }

  // 3. Invariant 2 & 3: Orphan check and singleton check
  const singletonCounts = new Map<PanelType, number>();

  for (const [panelId, instance] of Object.entries(ws.panels)) {
    const refs = panelRefCounts.get(panelId) ?? 0;
    if (refs === 0) {
      throw new WorkspaceInvariantError(
        `Orphan panel found: '${panelId}' is defined in panels but never referenced in tree.`
      );
    }
    if (refs > 1) {
      throw new WorkspaceInvariantError(
        `Panel '${panelId}' is referenced multiple (${refs}) times in tree. Panels must have exactly 1 reference.`
      );
    }

    if (isSingleton(instance.type)) {
      singletonCounts.set(instance.type, (singletonCounts.get(instance.type) ?? 0) + 1);
    }
  }

  for (const [type, count] of singletonCounts.entries()) {
    if (count > 1) {
      throw new WorkspaceInvariantError(
        `Singleton panel type '${type}' cannot have multiple instances (found ${count}).`
      );
    }
  }

  for (const panelId of panelRefCounts.keys()) {
    if (!ws.panels[panelId]) {
      throw new WorkspaceInvariantError(
        `Tree references panel '${panelId}' which does not exist in workspace.panels.`
      );
    }
  }
}

// ==========================================
// Tree Helpers & Normalization
// ==========================================

export function normalizeWeights(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((acc, w) => acc + (w > 0 ? w : 0.001), 0);
  if (sum <= 0) {
    const equal = 1 / weights.length;
    return weights.map(() => equal);
  }
  const raw = weights.map((w) => (w > 0 ? w : 0.001) / sum);
  // Round to 4 decimal places and adjust last weight so sum is exactly 1.0
  const rounded = raw.map((w) => Math.round(w * 10000) / 10000);
  const roundedSum = rounded.reduce((acc, w) => acc + w, 0);
  const diff = Math.round((1.0 - roundedSum) * 10000) / 10000;
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 10000) / 10000;
  return rounded;
}

function generateRandomId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${rand}`;
}

export function collectAllPanelIds(node: LayoutNode, out = new Set<string>()): Set<string> {
  if (node.kind === 'panel') {
    out.add(node.panel);
  } else if (node.kind === 'tabs') {
    for (const tab of node.tabs) {
      out.add(tab);
    }
  } else if (node.kind === 'split') {
    for (const child of node.children) {
      collectAllPanelIds(child, out);
    }
  }
  return out;
}

export function findSplitNode(root: LayoutNode, splitId: string): SplitNode | null {
  if (root.kind === 'split') {
    if (root.id === splitId) return root;
    for (const child of root.children) {
      const found = findSplitNode(child, splitId);
      if (found) return found;
    }
  }
  return null;
}

export function findTabGroupNode(root: LayoutNode, tabsId: string): TabGroupNode | null {
  if (root.kind === 'tabs') {
    if (root.id === tabsId) return root;
  } else if (root.kind === 'split') {
    for (const child of root.children) {
      const found = findTabGroupNode(child, tabsId);
      if (found) return found;
    }
  }
  return null;
}

export function pruneOrphanPanels(ws: Workspace): Workspace {
  const referencedIds = collectAllPanelIds(ws.root);
  const nextPanels: Record<PanelInstanceId, (typeof ws.panels)[string]> = {};
  for (const [id, panel] of Object.entries(ws.panels)) {
    if (referencedIds.has(id)) {
      nextPanels[id] = panel;
    }
  }
  return { ...ws, panels: nextPanels };
}

// ==========================================
// Pure Tree Modifiers
// ==========================================

function updateNodeRecursively(
  root: LayoutNode,
  matcher: (node: LayoutNode) => boolean,
  updater: (node: LayoutNode) => LayoutNode
): LayoutNode {
  if (matcher(root)) {
    return updater(root);
  }
  if (root.kind === 'split') {
    let changed = false;
    const newChildren = root.children.map((child) => {
      const updatedChild = updateNodeRecursively(child, matcher, updater);
      if (updatedChild !== child) changed = true;
      return updatedChild;
    });
    return changed ? { ...root, children: newChildren } : root;
  }
  return root;
}

function removePanelFromTree(
  root: LayoutNode,
  panelId: string
): { nextRoot: LayoutNode | null; removed: boolean } {
  if (root.kind === 'panel') {
    if (root.panel === panelId) {
      return { nextRoot: null, removed: true };
    }
    return { nextRoot: root, removed: false };
  }

  if (root.kind === 'tabs') {
    if (!root.tabs.includes(panelId)) {
      return { nextRoot: root, removed: false };
    }
    const nextTabs = root.tabs.filter((t) => t !== panelId);
    if (nextTabs.length === 0) {
      return { nextRoot: null, removed: true };
    }
    const nextActive = root.active === panelId ? nextTabs[0] : root.active;
    return {
      nextRoot: { ...root, tabs: nextTabs, active: nextActive },
      removed: true
    };
  }

  if (root.kind === 'split') {
    let removed = false;
    const nextChildren: LayoutNode[] = [];
    const nextWeights: number[] = [];

    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      const result = removePanelFromTree(child, panelId);
      if (result.removed) {
        removed = true;
        if (result.nextRoot !== null) {
          nextChildren.push(result.nextRoot);
          nextWeights.push(root.weights[i]);
        }
        // if null, child was completely eliminated
      } else {
        nextChildren.push(child);
        nextWeights.push(root.weights[i]);
      }
    }

    if (!removed) {
      return { nextRoot: root, removed: false };
    }

    if (nextChildren.length === 0) {
      return { nextRoot: null, removed: true };
    }

    // Collapse split if only 1 child remains
    if (nextChildren.length === 1) {
      return { nextRoot: nextChildren[0], removed: true };
    }

    return {
      nextRoot: {
        ...root,
        children: nextChildren,
        weights: normalizeWeights(nextWeights)
      },
      removed: true
    };
  }

  return { nextRoot: root, removed: false };
}

function insertNodeAtTarget(
  root: LayoutNode,
  newNode: LayoutNode,
  target: DropTarget,
  defaultWeight = 0.25
): LayoutNode {
  if (target.k === 'edge') {
    return updateNodeRecursively(
      root,
      (n) => n.kind === 'split' && (n as SplitNode).id === target.splitId,
      (node) => {
        const split = node as SplitNode;
        if (split.children.length >= 4) {
          throw new WorkspaceInvariantError(
            `SplitNode '${split.id}' already has maximum of 4 children.`
          );
        }
        const insertIdx = Math.max(0, Math.min(target.index, split.children.length));
        const newChildren = [...split.children];
        newChildren.splice(insertIdx, 0, newNode);

        // Distribute weight
        const curWeights = split.weights.map((w) => w * (1 - defaultWeight));
        curWeights.splice(insertIdx, 0, defaultWeight);

        return {
          ...split,
          children: newChildren,
          weights: normalizeWeights(curWeights)
        };
      }
    );
  }

  if (target.k === 'split-into') {
    return updateNodeRecursively(
      root,
      (n) => n.kind === 'panel' && (n as PanelRefNode).panel === target.targetPanelId,
      (node) => {
        const targetPanelNode = node as PanelRefNode;
        const children = target.before ? [newNode, targetPanelNode] : [targetPanelNode, newNode];
        return {
          kind: 'split',
          id: generateRandomId('split'),
          axis: target.axis,
          children,
          weights: [0.5, 0.5]
        };
      }
    );
  }

  if (target.k === 'tab-into') {
    if (newNode.kind !== 'panel') {
      throw new WorkspaceInvariantError(`Only panel references can be tabbed into a TabGroup.`);
    }
    return updateNodeRecursively(
      root,
      (n) => n.kind === 'tabs' && (n as TabGroupNode).id === target.tabsId,
      (node) => {
        const tabsNode = node as TabGroupNode;
        if (tabsNode.tabs.includes(newNode.panel)) {
          return tabsNode;
        }
        const nextTabs = [...tabsNode.tabs];
        const idx =
          target.index !== undefined
            ? Math.max(0, Math.min(target.index, nextTabs.length))
            : nextTabs.length;
        nextTabs.splice(idx, 0, newNode.panel);
        return {
          ...tabsNode,
          tabs: nextTabs,
          active: newNode.panel
        };
      }
    );
  }

  return root;
}

// ==========================================
// Main Layout Operations Reducer
// ==========================================

export function applyLayoutOp(ws: Workspace, op: LayoutOp): Workspace {
  let nextWs: Workspace;

  switch (op.t) {
    case 'panel.insert': {
      if (isSingleton(op.type)) {
        const existing = Object.values(ws.panels).find((p) => p.type === op.type);
        if (existing) {
          throw new WorkspaceInvariantError(
            `Cannot insert singleton panel type '${op.type}': instance '${existing.id}' already exists.`
          );
        }
      }

      const def = getPanelDefinition(op.type);
      const newPanelId = generateRandomId(`p_${op.type}`);
      const newInstance = {
        id: newPanelId,
        type: op.type,
        local: {}
      };

      const panelNode: PanelRefNode = {
        kind: 'panel',
        panel: newPanelId
      };

      const nextRoot = insertNodeAtTarget(ws.root, panelNode, op.at, def.defaultWeight ?? 0.25);
      nextWs = {
        ...ws,
        panels: {
          ...ws.panels,
          [newPanelId]: newInstance
        },
        root: nextRoot
      };
      break;
    }

    case 'panel.close': {
      const panel = ws.panels[op.panelId];
      if (!panel) {
        return ws;
      }
      if (panel.type === 'router-view') {
        throw new WorkspaceInvariantError(`'router-view' panel cannot be closed.`);
      }

      const { nextRoot } = removePanelFromTree(ws.root, op.panelId);
      if (!nextRoot) {
        throw new WorkspaceInvariantError(
          `Cannot close panel '${op.panelId}': closing it would result in an empty workspace.`
        );
      }

      const nextPanels = { ...ws.panels };
      delete nextPanels[op.panelId];

      nextWs = {
        ...ws,
        panels: nextPanels,
        root: nextRoot
      };
      break;
    }

    case 'panel.move': {
      const panel = ws.panels[op.panelId];
      if (!panel) {
        throw new WorkspaceInvariantError(`Panel '${op.panelId}' does not exist.`);
      }

      // Check for self-split
      if (op.at.k === 'split-into' && op.at.targetPanelId === op.panelId) {
        return ws;
      }

      // Check for intra-split reorder
      if (op.at.k === 'edge') {
        const targetSplit = findSplitNode(ws.root, op.at.splitId);
        if (targetSplit) {
          const curIndex = targetSplit.children.findIndex(
            (c) => c.kind === 'panel' && (c as PanelRefNode).panel === op.panelId
          );
          if (curIndex !== -1) {
            const newIndex = Math.max(0, Math.min(op.at.index, targetSplit.children.length - 1));
            if (curIndex === newIndex) {
              return ws;
            }
            const newChildren = [...targetSplit.children];
            const newWeights = [...targetSplit.weights];
            const [movedChild] = newChildren.splice(curIndex, 1);
            const [movedWeight] = newWeights.splice(curIndex, 1);
            newChildren.splice(newIndex, 0, movedChild);
            newWeights.splice(newIndex, 0, movedWeight);

            const nextRoot = updateNodeRecursively(
              ws.root,
              (n) =>
                n.kind === 'split' &&
                (n as SplitNode).id === (op.at as { k: 'edge'; splitId: string }).splitId,
              (node) => ({
                ...(node as SplitNode),
                children: newChildren,
                weights: newWeights
              })
            );
            nextWs = { ...ws, root: nextRoot };
            break;
          }
        }
      }

      // Check for intra-tabgroup reorder
      if (op.at.k === 'tab-into') {
        const targetTabs = findTabGroupNode(ws.root, op.at.tabsId);
        if (targetTabs && targetTabs.tabs.includes(op.panelId)) {
          const curIndex = targetTabs.tabs.indexOf(op.panelId);
          const newIndex =
            op.at.index !== undefined
              ? Math.max(0, Math.min(op.at.index, targetTabs.tabs.length - 1))
              : targetTabs.tabs.length - 1;
          if (curIndex === newIndex) {
            return ws;
          }
          const nextTabs = [...targetTabs.tabs];
          nextTabs.splice(curIndex, 1);
          nextTabs.splice(newIndex, 0, op.panelId);
          const nextRoot = updateNodeRecursively(
            ws.root,
            (n) =>
              n.kind === 'tabs' &&
              (n as TabGroupNode).id === (op.at as { k: 'tab-into'; tabsId: string }).tabsId,
            (node) => ({
              ...(node as TabGroupNode),
              tabs: nextTabs,
              active: op.panelId
            })
          );
          nextWs = { ...ws, root: nextRoot };
          break;
        }
      }

      // Inter-node move
      // Step 1: Remove from current location in tree (preserving instance in ws.panels)
      const { nextRoot: intermediateRoot } = removePanelFromTree(ws.root, op.panelId);
      if (!intermediateRoot) {
        throw new WorkspaceInvariantError(
          `Cannot move panel '${op.panelId}' to target: intermediate tree is empty.`
        );
      }

      // Step 2: Insert into new target
      const panelNode: PanelRefNode = {
        kind: 'panel',
        panel: op.panelId
      };
      const def = getPanelDefinition(panel.type);
      const finalRoot = insertNodeAtTarget(
        intermediateRoot,
        panelNode,
        op.at,
        def.defaultWeight ?? 0.25
      );

      nextWs = {
        ...ws,
        root: finalRoot
      };
      break;
    }

    case 'split.weights': {
      nextWs = {
        ...ws,
        root: updateNodeRecursively(
          ws.root,
          (n) => n.kind === 'split' && (n as SplitNode).id === op.splitId,
          (node) => {
            const split = node as SplitNode;
            if (op.weights.length !== split.children.length) {
              throw new WorkspaceInvariantError(
                `Weights length (${op.weights.length}) does not match split children length (${split.children.length}).`
              );
            }
            return {
              ...split,
              weights: normalizeWeights(op.weights)
            };
          }
        )
      };
      break;
    }

    case 'split.collapse': {
      nextWs = {
        ...ws,
        root: updateNodeRecursively(
          ws.root,
          (n) => n.kind === 'split' && (n as SplitNode).id === op.splitId,
          (node) => {
            const split = node as SplitNode;
            return {
              ...split,
              collapsed: op.childIndex
            };
          }
        )
      };
      break;
    }

    case 'tabs.activate': {
      nextWs = {
        ...ws,
        root: updateNodeRecursively(
          ws.root,
          (n) => n.kind === 'tabs' && (n as TabGroupNode).id === op.tabsId,
          (node) => {
            const tabs = node as TabGroupNode;
            if (!tabs.tabs.includes(op.panelId)) {
              throw new WorkspaceInvariantError(
                `Panel '${op.panelId}' is not part of TabGroup '${op.tabsId}'.`
              );
            }
            return {
              ...tabs,
              active: op.panelId
            };
          }
        )
      };
      break;
    }

    case 'tabs.reorder': {
      nextWs = {
        ...ws,
        root: updateNodeRecursively(
          ws.root,
          (n) => n.kind === 'tabs' && (n as TabGroupNode).id === op.tabsId,
          (node) => {
            const tabs = node as TabGroupNode;
            const valid =
              op.order.length === tabs.tabs.length &&
              op.order.every((id) => tabs.tabs.includes(id));
            if (!valid) {
              throw new WorkspaceInvariantError(
                `Invalid reorder array for TabGroup '${op.tabsId}'.`
              );
            }
            return {
              ...tabs,
              tabs: op.order
            };
          }
        )
      };
      break;
    }

    case 'tabs.extract': {
      // Extracts a tab from TabGroup into a SplitNode along axis
      nextWs = {
        ...ws,
        root: updateNodeRecursively(
          ws.root,
          (n) => n.kind === 'tabs' && (n as TabGroupNode).tabs.includes(op.panelId),
          (node) => {
            const tabGroup = node as TabGroupNode;
            const nextTabs = tabGroup.tabs.filter((id) => id !== op.panelId);
            if (nextTabs.length === 0) return node; // Cannot extract the sole tab

            const nextActive = tabGroup.active === op.panelId ? nextTabs[0] : tabGroup.active;
            const updatedTabGroup: TabGroupNode = {
              ...tabGroup,
              tabs: nextTabs,
              active: nextActive
            };
            const extractedPanel: PanelRefNode = {
              kind: 'panel',
              panel: op.panelId
            };

            return {
              kind: 'split',
              id: generateRandomId('split'),
              axis: op.axis,
              children: [updatedTabGroup, extractedPanel],
              weights: [0.5, 0.5]
            };
          }
        )
      };
      break;
    }

    case 'ws.create': {
      if (op.preset) {
        nextWs = {
          ...op.preset,
          id: generateRandomId('ws'),
          name: op.name
        };
      } else {
        nextWs = { ...ws, id: generateRandomId('ws'), name: op.name };
      }
      break;
    }

    case 'ws.duplicate': {
      nextWs = {
        ...ws,
        id: generateRandomId('ws'),
        name: op.newName
      };
      break;
    }

    case 'ws.rename': {
      nextWs = {
        ...ws,
        name: op.name
      };
      break;
    }

    case 'ws.delete': {
      nextWs = ws;
      break;
    }

    case 'ws.reset': {
      nextWs = {
        ...op.defaultPreset,
        id: ws.id,
        name: ws.name
      };
      break;
    }

    default:
      nextWs = ws;
  }

  // Prune any orphan panels that might have been disconnected
  nextWs = pruneOrphanPanels(nextWs);

  // Assert invariants on every state transition
  assertWorkspaceInvariants(nextWs);

  return nextWs;
}
