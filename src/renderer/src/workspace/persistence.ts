import { assertWorkspaceInvariants } from './ops';
import { DEFAULT_PRESET } from './presets/default';
import { MUSICBEE_PRESET } from './presets/musicbee';
import type { Workspace, WorkspaceState } from './types';

export const WORKSPACE_STORAGE_KEY = 'nora.workspaces.v1';
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
    // Assert all invariants
    assertWorkspaceInvariants(ws as Workspace);
    return ws as Workspace;
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
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return getInitialWorkspaceState();
    }

    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (!parsed || !parsed.workspaces || typeof parsed.workspaces !== 'object') {
      return getInitialWorkspaceState();
    }

    const sanitizedWorkspaces: Record<string, Workspace> = {};
    for (const [id, ws] of Object.entries(parsed.workspaces)) {
      const sanitized = sanitizeWorkspace(ws);
      if (sanitized) {
        if (id === DEFAULT_PRESET.id && (sanitized.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
          sanitizedWorkspaces[id] = DEFAULT_PRESET;
        } else if (id === MUSICBEE_PRESET.id && (sanitized.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
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
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
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
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[WorkspacePersistence] Failed to persist workspace state immediately:', err);
  }
}
