import { assertWorkspaceInvariants, normalizeWeights, pruneOrphanPanels } from './ops';
import { DEFAULT_PRESET } from './presets/default';
import { MUSICBEE_PRESET } from './presets/musicbee';
import { PANEL_DEFINITIONS } from './registry';
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
 * invariant checking. Guarded with a recursion depth limit (max 5) to prevent V8 stack overflows.
 */
function repairSplitWeights(node: LayoutNode, depth = 0): void {
  if (depth > 5) return;

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
        repairSplitWeights(child, depth + 1);
      }
    }
  } else if (node.kind === 'tabs') {
    // Tabs do not have split weights
  }
}

/** Checks whether a local state property is a safe JSON value (primitives, arrays, or shallow objects). */
function isJsonSafeValue(v: unknown): boolean {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
    return true;
  }
  if (Array.isArray(v)) {
    return v.every(
      (elem) =>
        typeof elem === 'string' ||
        typeof elem === 'number' ||
        typeof elem === 'boolean' ||
        elem === null
    );
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.values(v).every(
      (child) =>
        typeof child === 'string' ||
        typeof child === 'number' ||
        typeof child === 'boolean' ||
        child === null
    );
  }
  return false;
}

/**
 * Validates and sanitizes an untrusted workspace document (e.g. from localStorage or JSON import).
 * Degrades unknown panel types to 'empty', cleanses local state dictionary, repairs weights,
 * prunes orphans, and asserts all structural invariants.
 */
export function validateWorkspace(untrusted: unknown): Workspace | null {
  if (!untrusted || typeof untrusted !== 'object') {
    return null;
  }

  const ws = untrusted as Partial<Workspace>;
  if (!ws.id || !ws.name || !ws.root || !ws.panels || typeof ws.panels !== 'object') {
    return null;
  }

  try {
    // 1. Whitelist panel types and sanitize local dictionary BEFORE invariants run.
    // Degrade unknown or non-object panel instances to 'empty' (never delete to avoid dangling tree refs).
    for (const [panelId, p] of Object.entries(ws.panels)) {
      const isKnownType =
        p &&
        typeof p === 'object' &&
        typeof p.type === 'string' &&
        Object.prototype.hasOwnProperty.call(PANEL_DEFINITIONS, p.type);

      if (!isKnownType) {
        ws.panels[panelId] = {
          id: panelId,
          type: 'empty',
          local: {}
        };
      } else {
        // Sanitize local state: retain only JSON-safe values
        if (!p.local || typeof p.local !== 'object' || Array.isArray(p.local)) {
          p.local = {};
        } else {
          const sanitizedLocal: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(p.local)) {
            if (isJsonSafeValue(v)) {
              sanitizedLocal[k] = v;
            }
          }
          p.local = sanitizedLocal;
        }
      }
    }

    // 2. Self-heal any zero or drifted split weights before running strict invariant assertion
    repairSplitWeights(ws.root as LayoutNode, 0);

    // 3. Prune orphan panels to ensure recoverable state is not rejected on reload
    const prunedWs = pruneOrphanPanels(ws as Workspace);

    // 4. Assert all core invariants
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

/** Alias for backward compatibility */
export const sanitizeWorkspace = validateWorkspace;

/** Validates that an entire WorkspaceState is structurally sound and satisfies invariants across all workspaces. */
export function isValidWorkspaceState(state: unknown): state is WorkspaceState {
  if (!state || typeof state !== 'object') return false;
  const s = state as Partial<WorkspaceState>;
  if (!s.active || typeof s.active !== 'string' || !s.workspaces || typeof s.workspaces !== 'object') {
    return false;
  }

  const activeWs = s.workspaces[s.active];
  if (!activeWs) return false;

  for (const ws of Object.values(s.workspaces)) {
    if (!validateWorkspace(ws)) return false;
  }

  return true;
}

function tryParseAndSanitize(rawString: string | null): WorkspaceState | null {
  if (!rawString) return null;
  try {
    const parsed = JSON.parse(rawString) as Partial<WorkspaceState>;
    if (!parsed || !parsed.workspaces || typeof parsed.workspaces !== 'object') {
      return null;
    }

    const sanitizedWorkspaces: Record<string, Workspace> = {};
    for (const [id, ws] of Object.entries(parsed.workspaces)) {
      const sanitized = validateWorkspace(ws);
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
  } catch {
    return null;
  }
}

/** Loads workspace state from localStorage with migration and corruption recovery. */
export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return getInitialWorkspaceState();
  }

  try {
    const primaryRaw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const primaryState = tryParseAndSanitize(primaryRaw);
    if (primaryState) {
      return primaryState;
    }

    // Primary failed (missing, corrupted JSON, or bad shape). Attempt recovery from .bak (PR-03)
    const backupRaw = window.localStorage.getItem(WORKSPACE_BACKUP_STORAGE_KEY);
    const backupState = tryParseAndSanitize(backupRaw);
    if (backupState) {
      console.warn(
        '[WorkspacePersistence] Primary storage corrupted or bad shape; successfully recovered from backup slot (PR-03).'
      );
      return backupState;
    }

    return getInitialWorkspaceState();
  } catch (err) {
    console.error('[WorkspacePersistence] Error reading workspace state:', err);
    return getInitialWorkspaceState();
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Single shared validated writer routine for both debounced and immediate persistence. */
function persistValidatedWorkspaceState(state: WorkspaceState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // 1. Guard against persisting structurally corrupted state (looping all workspaces)
  if (!isValidWorkspaceState(state)) {
    console.warn('[WorkspacePersistence] Dropping invalid workspace state save.');
    return;
  }

  try {
    const serialized = JSON.stringify(state);
    const existingPrimaryRaw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);

    // 2. Validate existing primary before promoting to backup slot (never promote corruption)
    if (existingPrimaryRaw && existingPrimaryRaw !== serialized) {
      try {
        const parsedExisting = JSON.parse(existingPrimaryRaw);
        if (isValidWorkspaceState(parsedExisting)) {
          window.localStorage.setItem(WORKSPACE_BACKUP_STORAGE_KEY, existingPrimaryRaw);
        }
      } catch {
        // Existing primary was corrupted JSON; keep existing untainted backup slot
      }
    }

    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
  } catch (err) {
    console.error('[WorkspacePersistence] Failed to persist workspace state:', err);
  }
}

/** Debounced persistence to localStorage (300ms window) */
export function saveWorkspaceStateDebounced(state: WorkspaceState, delay = 300): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    persistValidatedWorkspaceState(state);
  }, delay);
}

/** Immediate flush (for window unload or test assertions) */
export function saveWorkspaceStateImmediate(state: WorkspaceState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  persistValidatedWorkspaceState(state);
}
