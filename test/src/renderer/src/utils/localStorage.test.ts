import { version } from '../../../../../package.json';
import { LOCAL_STORAGE_DEFAULT_TEMPLATE } from '@renderer/other/appReducer';
// Import the store first: utils/localStorage participates in a circular import with it, and the
// store must be the entry point of that cycle for its default export to be defined.
import '@renderer/store/store';
import storage, {
  __resetDegradedStateForTesting,
  getIsQueueStorageDegraded,
  isQuotaExceededError,
  normalizeShortcutLabelsToKeys,
  stripQueuePayload,
  stripSelectiveQueuePayload
} from '@renderer/utils/localStorage';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Shortcut labels must be persisted as stable i18n keys ('appShortcutsPrompt.*'), never runtime
 * translations. Older versions stored translated strings which permanently desynchronized shortcut
 * matching after a language switch. normalizeShortcutLabelsToKeys repairs that.
 */
describe('normalizeShortcutLabelsToKeys', () => {
  const cloneTemplateShortcuts = () =>
    JSON.parse(JSON.stringify(LOCAL_STORAGE_DEFAULT_TEMPLATE.keyboardShortcuts));

  it('rewrites translated labels positionally back to stable i18n keys', () => {
    const shortcuts = cloneTemplateShortcuts();
    // Simulate legacy persisted state: runtime translations instead of keys
    shortcuts[0].shortcutCategoryTitle = 'Lecture multimédia';
    shortcuts[0].shortcuts[0].label = 'Lecture / Pause';
    shortcuts[0].shortcuts[1].label = 'Couper le son';

    const result = normalizeShortcutLabelsToKeys({ keyboardShortcuts: shortcuts } as never);

    expect(result.keyboardShortcuts[0].shortcutCategoryTitle).toBe(
      'appShortcutsPrompt.mediaPlayback'
    );
    expect(result.keyboardShortcuts[0].shortcuts[0].label).toBe('appShortcutsPrompt.playPause');
    expect(result.keyboardShortcuts[0].shortcuts[1].label).toBe('appShortcutsPrompt.toggleMute');
  });

  it('preserves customized key bindings while repairing labels', () => {
    const shortcuts = cloneTemplateShortcuts();
    shortcuts[0].shortcuts[0].label = 'Play Pause';
    shortcuts[0].shortcuts[0].keys = ['Ctrl', 'P'];

    const result = normalizeShortcutLabelsToKeys({ keyboardShortcuts: shortcuts } as never);

    expect(result.keyboardShortcuts[0].shortcuts[0].label).toBe('appShortcutsPrompt.playPause');
    expect(result.keyboardShortcuts[0].shortcuts[0].keys).toEqual(['Ctrl', 'P']);
  });

  it('is idempotent for storage that already uses stable keys', () => {
    const shortcuts = cloneTemplateShortcuts();
    const input = { keyboardShortcuts: shortcuts };

    const result = normalizeShortcutLabelsToKeys(input);

    expect(result).toBe(input);
  });

  it('tolerates missing or malformed shortcut lists', () => {
    expect(normalizeShortcutLabelsToKeys({} as never)).toEqual({});
    expect(
      normalizeShortcutLabelsToKeys({ keyboardShortcuts: [] } as never).keyboardShortcuts
    ).toEqual([]);
  });

  it('appends missing categories like panels from template while preserving custom key bindings', () => {
    const shortcuts = cloneTemplateShortcuts();
    // Simulate user state from an older version that didn't have the panels category
    const withoutPanels = shortcuts.filter(
      (cat: ShortcutCategory) => cat.shortcutCategoryTitle !== 'appShortcutsPrompt.panels'
    );
    expect(withoutPanels.length).toBeLessThan(shortcuts.length);

    // Customize a key in an existing category
    withoutPanels[0].shortcuts[0].keys = ['Ctrl', 'Shift', 'Space'];

    const input = { keyboardShortcuts: withoutPanels };
    const result = normalizeShortcutLabelsToKeys(input as never);

    expect(result).not.toBe(input);
    expect(result.keyboardShortcuts.length).toBe(shortcuts.length);

    const panelsCategory = result.keyboardShortcuts.find(
      (cat: ShortcutCategory) => cat.shortcutCategoryTitle === 'appShortcutsPrompt.panels'
    );
    expect(panelsCategory).toBeDefined();
    expect(panelsCategory?.shortcuts.map((s) => s.label)).toEqual([
      'appShortcutsPrompt.toggleQueuePanel',
      'appShortcutsPrompt.toggleLyricsPanel',
      'appShortcutsPrompt.togglePlaylistsPanel',
      'appShortcutsPrompt.toggleVisualizerPanel',
      'appShortcutsPrompt.toggleNowPlayingPanel',
      'appShortcutsPrompt.saveWorkspaceLayout'
    ]);

    // Verify customized key was preserved
    expect(result.keyboardShortcuts[0].shortcuts[0].keys).toEqual(['Ctrl', 'Shift', 'Space']);
  });

  it('appends missing shortcuts to an existing category from template', () => {
    const shortcuts = cloneTemplateShortcuts();
    // Drop the last shortcut from mediaPlayback
    const originalCount = shortcuts[0].shortcuts.length;
    const removedShortcutLabel = shortcuts[0].shortcuts[originalCount - 1].label;
    shortcuts[0].shortcuts = shortcuts[0].shortcuts.slice(0, -1);

    const input = { keyboardShortcuts: shortcuts };
    const result = normalizeShortcutLabelsToKeys(input as never);

    expect(result).not.toBe(input);
    expect(result.keyboardShortcuts[0].shortcuts.length).toBe(originalCount);
    const reAdded = result.keyboardShortcuts[0].shortcuts.find(
      (s: Shortcut) => s.label === removedShortcutLabel
    );
    expect(reAdded).toBeDefined();
  });
});

describe('localStorage Quota Fallback & Queue Stripping', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetDegradedStateForTesting();
  });

  it('stripQueuePayload strips songIds and queueBeforeShuffle while preserving metadata and positions', () => {
    const sampleStorage = {
      ...LOCAL_STORAGE_DEFAULT_TEMPLATE,
      queue: {
        currentQueueIndex: 0,
        queues: [
          {
            id: 'q1',
            songIds: [1, 2, 3, 4, 5],
            position: 2,
            queueBeforeShuffle: [5, 4, 3, 2, 1],
            metadata: { title: 'Main Queue', isLocked: true }
          }
        ]
      }
    };

    const stripped = stripQueuePayload(sampleStorage as never);
    expect(stripped.queue.queues[0].songIds).toEqual([]);
    expect(stripped.queue.queues[0].queueBeforeShuffle).toBeUndefined();
    expect(stripped.queue.queues[0].position).toBe(0);
    expect(stripped.queue.queues[0].metadata?.title).toBe('Main Queue');
    expect(stripped.queue.queues[0].metadata?.isLocked).toBe(true);
  });

  it('stripSelectiveQueuePayload only strips queues with >1000 songs and preserves smaller queues', () => {
    const sampleStorage = {
      ...LOCAL_STORAGE_DEFAULT_TEMPLATE,
      queue: {
        currentQueueIndex: 0,
        queues: [
          {
            id: 'q-small',
            songIds: [1, 2, 3],
            position: 1
          },
          {
            id: 'q-large',
            songIds: Array.from({ length: 1500 }, (_, i) => i),
            position: 50
          }
        ]
      }
    };

    const stripped = stripSelectiveQueuePayload(sampleStorage as never, 1000);
    expect(stripped.queue.queues[0].songIds).toEqual([1, 2, 3]);
    expect(stripped.queue.queues[0].position).toBe(1);
    expect(stripped.queue.queues[1].songIds).toEqual([]);
    expect(stripped.queue.queues[1].position).toBe(0);
  });

  it('isQuotaExceededError detects standard and synthetic quota errors', () => {
    expect(isQuotaExceededError(new DOMException('quota', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError(new Error('Generic failure'))).toBe(false);
  });

  it('setLocalStorage catches QuotaExceededError, degrades storage, and recovers when queue shrinks below 1000 songs', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    let callCount = 0;

    setItemSpy.mockImplementation((key, val) => {
      callCount++;
      if (callCount === 1) {
        throw new DOMException('Disk full', 'QuotaExceededError');
      }
    });

    const largeStorage = {
      ...LOCAL_STORAGE_DEFAULT_TEMPLATE,
      queue: {
        currentQueueIndex: 0,
        queues: [
          {
            id: 'q1',
            songIds: Array.from({ length: 5000 }, (_, i) => i),
            position: 5
          }
        ]
      }
    };

    storage.setLocalStorage(largeStorage as never);

    expect(getIsQueueStorageDegraded()).toBe(true);
    // Should have attempted first write (which threw) and then wrote stripped fallback
    expect(callCount).toBe(2);
    const lastWrite = JSON.parse(setItemSpy.mock.calls[1][1]);
    expect(lastWrite.queue.queues[0].songIds).toEqual([]);
    expect(lastWrite.queue.queues[0].position).toBe(0);

    // Now test recovery: user shrinks queue to < 1000 songs
    const smallStorage = {
      ...LOCAL_STORAGE_DEFAULT_TEMPLATE,
      queue: {
        currentQueueIndex: 0,
        queues: [
          {
            id: 'q1',
            songIds: [10, 20, 30],
            position: 1
          }
        ]
      }
    };

    storage.setLocalStorage(smallStorage as never);
    // Recovery successful: unstripped payload written, degraded state cleared
    expect(getIsQueueStorageDegraded()).toBe(false);
    const recoveredWrite = JSON.parse(setItemSpy.mock.calls[2][1]);
    expect(recoveredWrite.queue.queues[0].songIds).toEqual([10, 20, 30]);

    setItemSpy.mockRestore();
  });

  it('checkLocalStorage strips queues when startup payload exceeds 4MB threshold', () => {
    const hugeQueue = {
      ...LOCAL_STORAGE_DEFAULT_TEMPLATE,
      queue: {
        currentQueueIndex: 0,
        queues: [
          {
            id: 'q-huge',
            // Create a payload larger than 4MB
            songIds: Array.from({ length: 700000 }, (_, i) => i),
            position: 10
          }
        ]
      }
    };

    const jsonStr = JSON.stringify(hugeQueue);
    expect(jsonStr.length).toBeGreaterThan(4 * 1024 * 1024);

    localStorage.setItem('version', '4.0.0-alpha.5');
    localStorage.setItem('localStorage', jsonStr);

    storage.checkLocalStorage();

    expect(getIsQueueStorageDegraded()).toBe(true);
    const stored = JSON.parse(localStorage.getItem('localStorage')!);
    expect(stored.queue.queues[0].songIds).toEqual([]);
    expect(stored.queue.queues[0].position).toBe(0);
  });
});
