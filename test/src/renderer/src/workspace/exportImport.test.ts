// @vitest-environment jsdom
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import {
  downloadLayoutFile,
  workspaceActions,
  workspaceHistoryStore,
  workspaceStore,
  type NoraLayoutExport
} from '@renderer/workspace/store';
import type { Workspace } from '@renderer/workspace/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Workspace Layout Export & Import (.nora-layout.json)', () => {
  beforeEach(() => {
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

  describe('Export', () => {
    it('exports active workspace wrapped in NoraLayoutExport metadata', () => {
      const exported = workspaceActions.exportWorkspace();
      expect(exported).not.toBeNull();
      expect(exported?.format).toBe('nora-layout');
      expect(exported?.formatVersion).toBe(2);
      expect(typeof exported?.exportedAt).toBe('string');
      expect(exported?.workspace.id).toBe(DEFAULT_PRESET.id);
      expect(exported?.workspace.name).toBe(DEFAULT_PRESET.name);
    });

    it('exports a specific workspace by ID', () => {
      const exported = workspaceActions.exportWorkspace(MUSICBEE_PRESET.id);
      expect(exported).not.toBeNull();
      expect(exported?.workspace.id).toBe(MUSICBEE_PRESET.id);
      expect(exported?.workspace.name).toBe(MUSICBEE_PRESET.name);
    });

    it('returns null when exporting a non-existent workspace ID', () => {
      const exported = workspaceActions.exportWorkspace('ws_non_existent');
      expect(exported).toBeNull();
    });

    it('triggers file download with sanitized filename', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');
      let clicked = false;
      const originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName);
        if (tagName === 'a') {
          el.click = () => {
            clicked = true;
          };
        }
        return el;
      });

      const exportPayload: NoraLayoutExport = {
        format: 'nora-layout',
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        workspace: {
          ...DEFAULT_PRESET,
          name: 'My Special / Custom * Layout'
        }
      };

      downloadLayoutFile(exportPayload);

      expect(clicked).toBe(true);
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
  });

  describe('Import', () => {
    it('successfully imports a wrapped NoraLayoutExport object with a new ID', () => {
      const customWs: Workspace = {
        id: 'external-custom-id',
        name: 'Studio Pro',
        schemaVersion: 2,
        frame: { playerBar: 'bottom', playerBarCompact: false },
        root: {
          kind: 'split',
          id: 's_imported_root',
          axis: 'x',
          weights: [0.7, 0.3],
          children: [
            { kind: 'panel', panel: 'p_router_imported' },
            { kind: 'panel', panel: 'p_lyrics_imported' }
          ]
        },
        panels: {
          p_router_imported: { id: 'p_router_imported', type: 'router-view', local: {} },
          p_lyrics_imported: { id: 'p_lyrics_imported', type: 'lyrics', local: {} }
        }
      };

      const payload: NoraLayoutExport = {
        format: 'nora-layout',
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        workspace: customWs
      };

      const res = workspaceActions.importWorkspace(payload);
      expect(res.success).toBe(true);
      expect(res.workspaceId).toBeDefined();
      expect(res.workspaceId).not.toBe('external-custom-id');

      const imported = workspaceStore.state.workspaces[res.workspaceId!];
      expect(imported).toBeDefined();
      expect(imported.name).toBe('Studio Pro');
      expect(workspaceStore.state.active).toBe(res.workspaceId);
    });

    it('successfully imports a raw Workspace object directly', () => {
      const rawWs: Workspace = {
        id: 'raw-ws-id',
        name: 'Direct Layout',
        schemaVersion: 2,
        frame: { playerBar: 'top', playerBarCompact: true },
        root: { kind: 'panel', panel: 'p_router_direct' },
        panels: {
          p_router_direct: { id: 'p_router_direct', type: 'router-view', local: {} }
        }
      };

      const res = workspaceActions.importWorkspace(rawWs);
      expect(res.success).toBe(true);
      const imported = workspaceStore.state.workspaces[res.workspaceId!];
      expect(imported.name).toBe('Direct Layout');
    });

    it('handles name collisions by appending (Imported)', () => {
      // Default already exists in workspaces
      const collidingWs: Workspace = {
        id: 'colliding-id',
        name: 'Default',
        schemaVersion: 2,
        frame: { playerBar: 'bottom', playerBarCompact: false },
        root: { kind: 'panel', panel: 'p_router_col' },
        panels: {
          p_router_col: { id: 'p_router_col', type: 'router-view', local: {} }
        }
      };

      const res = workspaceActions.importWorkspace(collidingWs);
      expect(res.success).toBe(true);
      const imported = workspaceStore.state.workspaces[res.workspaceId!];
      expect(imported.name).toBe('Default (Imported)');
    });

    it('rejects invalid or null import data without modifying store', () => {
      const initialWsCount = Object.keys(workspaceStore.state.workspaces).length;

      expect(workspaceActions.importWorkspace(null).success).toBe(false);
      expect(workspaceActions.importWorkspace(undefined).success).toBe(false);
      expect(workspaceActions.importWorkspace('string-data').success).toBe(false);
      expect(workspaceActions.importWorkspace({}).success).toBe(false);

      expect(Object.keys(workspaceStore.state.workspaces).length).toBe(initialWsCount);
    });

    it('rejects layouts failing invariant checks (e.g. missing router-view)', () => {
      const initialWsCount = Object.keys(workspaceStore.state.workspaces).length;

      const invalidWs = {
        id: 'invalid-ws',
        name: 'Corrupt Layout',
        schemaVersion: 2,
        frame: { playerBar: 'bottom', playerBarCompact: false },
        root: { kind: 'panel', panel: 'p_queue_only' },
        panels: {
          p_queue_only: { id: 'p_queue_only', type: 'queue', local: {} }
        }
      };

      const res = workspaceActions.importWorkspace(invalidWs);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();

      // State is untouched
      expect(Object.keys(workspaceStore.state.workspaces).length).toBe(initialWsCount);
    });

    it('clears layout undo/redo history on import', () => {
      workspaceHistoryStore.setState(() => ({
        past: [DEFAULT_PRESET],
        future: [MUSICBEE_PRESET]
      }));

      const rawWs: Workspace = {
        id: 'imported-clean',
        name: 'Clean Import',
        schemaVersion: 2,
        frame: { playerBar: 'bottom', playerBarCompact: false },
        root: { kind: 'panel', panel: 'p_clean_r' },
        panels: {
          p_clean_r: { id: 'p_clean_r', type: 'router-view', local: {} }
        }
      };

      workspaceActions.importWorkspace(rawWs);

      expect(workspaceHistoryStore.state.past).toEqual([]);
      expect(workspaceHistoryStore.state.future).toEqual([]);
    });
  });
});
