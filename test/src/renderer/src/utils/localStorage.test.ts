import { LOCAL_STORAGE_DEFAULT_TEMPLATE } from '@renderer/other/appReducer';
// Import the store first: utils/localStorage participates in a circular import with it, and the
// store must be the entry point of that cycle for its default export to be defined.
import '@renderer/store/store';
import { normalizeShortcutLabelsToKeys } from '@renderer/utils/localStorage';
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

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
