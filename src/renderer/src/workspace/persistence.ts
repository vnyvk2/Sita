import { assertWorkspaceInvariants, normalizeWeights, pruneOrphanPanels } from './ops';
import { DEFAULT_PRESET } from './presets/default';
import { MUSICBEE_PRESET } from './presets/musicbee';
import type { LayoutNode, Workspace, WorkspaceState } from './types';

export const WORKSPACE_STORAGE_KEY = 'nora.workspaces.v1';
export const WORKSPACE_BACKUP_STORAGE_KEY = 'nora.workspaces.v1.bak';
export const CURRENT_SCHEMA_VERSION = 2;

export function getInitialWorkspaceState(): WorkspaceState {
  return {
    active: DEFAULT_PRESET.id,
    workspaces: {
      [DEFAULT_PRESET.id]: DEFAULT_PRESET,
      [MUSICBEE_PRESET.id]: MUSICBEE_PRESET
    }
  };
}

/**
 * Traverses layout tree and repairs split nodes with 0, missing, or drifting weights before
 * invariant checking.
 */
function repairSplitWeights(node: LayoutNode): void {
  if (node.kind === 'split') {
    if (Array.isArray(node.children)) {
      const childCount = node.children.length;
      const weights = node.weights ?? [];

      const hasInvalid =
        weights.length !== childCount ||
        weights.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w <= 0);

      if (hasInvalid) {
        node.weights = normalizeWeights(Array.from({ length: childCount }, () => 1));
      } else {
        node.weights = normalizeWeights(weights);
      }

      for (const child of node.children) {
        repairSplitWeights(child);
      }
    }
  } else if (node.kind === 'tabs') {
    // Tabs do not have split weights
  }
}

/**
 * Validates and sanitizes an untrusted workspace document (e.g. from localStorage or JSON import).
 * Degrades unknown panel types to 'empty' and asserts all structural invariants.
 */
export function sanitizeWorkspace(untrusted: unknown): Workspace | null {
  if (!untrusted || typeof untrusted !== 'object') {
    return null;
  }

  const ws = untrusted as Partial<Workspace>;
  if (!ws.id || !ws.name || !ws.root || !ws.panels) {
    return null;
  }

  try {
    // Self-heal any zero or drifted split weights before running strict invariant assertion
    repairSplitWeights(ws.root as LayoutNode);

    // Prune orphan panels to ensure recoverable state is not rejected on reload (PR-05)
    const prunedWs = pruneOrphanPanels(ws as Workspace);

    // Assert all invariants
    assertWorkspaceInvariants(prunedWs);
    return prunedWs;
  } catch (err) {
    console.warn(
      '[WorkspacePersistence] Workspace validation failed, falling back to default:',
      err
    );
    return null;
  }
}

/** Loads workspace state from localStorage with migration and corruption recovery. */
export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return getInitialWorkspaceState();
  }

  try {
    let raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) {
      raw = window.localStorage.getItem(WORKSPACE_BACKUP_STORAGE_KEY);
    }

    if (!raw) {
      return getInitialWorkspaceState();
    }

    let parsed: Partial<WorkspaceState> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    } catch (parseErr) {
      console.warn(
        '[WorkspacePersistence] Primary storage JSON corrupted, attempting backup recovery (PR-03):',
        parseErr
      );
      const backupRaw = window.localStorage.getItem(WORKSPACE_BACKUP_STORAGE_KEY);
      if (backupRaw) {
        parsed = JSON.parse(backupRaw) as Partial<WorkspaceState>;
      } else {
        throw parseErr;
      }
    }

    if (!parsed || !parsed.workspaces || typeof parsed.workspaces !== 'object') {
      return getInitialWorkspaceState();
    }

    const sanitizedWorkspaces: Record<string, Workspace> = {};
    for (const [id, ws] of Object.entries(parsed.workspaces)) {
      const sanitized = sanitizeWorkspace(ws);
      if (sanitized) {
        if (id === DEFAULT_PRESET.id && (sanitized.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
          sanitizedWorkspaces[id] = DEFAULT_PRESET;
        } else if (
          id === MUSICBEE_PRESET.id &&
          (sanitized.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION
        ) {
          sanitizedWorkspaces[id] = MUSICBEE_PRESET;
        } else {
          sanitizedWorkspaces[id] = sanitized;
        }
      }
    }

    // Always ensure default presets are available
    if (!sanitizedWorkspaces[DEFAULT_PRESET.id]) {
      sanitizedWorkspaces[DEFAULT_PRESET.id] = DEFAULT_PRESET;
    }
    if (!sanitizedWorkspaces[MUSICBEE_PRESET.id]) {
      sanitizedWorkspaces[MUSICBEE_PRESET.id] = MUSICBEE_PRESET;
    }

    const activeId =
      parsed.active && sanitizedWorkspaces[parsed.active] ? parsed.active : DEFAULT_PRESET.id;

    return {
      active: activeId,
      workspaces: sanitizedWorkspaces
    };
  } catch (err) {
    console.error('[WorkspacePersistence] Error reading workspace state:', err);
    return getInitialWorkspaceState();
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced persistence to localStorage (300ms window) */
export function saveWorkspaceStateDebounced(state: WorkspaceState, delay = 300): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    try {
      const serialized = JSON.stringify(state);
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
      window.localStorage.setItem(WORKSPACE_BACKUP_STORAGE_KEY, serialized);
    } catch (err) {
      console.error('[WorkspacePersistence] Failed to persist workspace state:', err);
    }
  }, delay);
}

/** Immediate flush (for window unload or test assertions) */
export function saveWorkspaceStateImmediate(state: WorkspaceState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    window.localStorage.setItem(WORKSPACE_BACKUP_STORAGE_KEY, serialized);
  } catch (err) {
    console.error('[WorkspacePersistence] Failed to persist workspace state immediately:', err);
  }
}
