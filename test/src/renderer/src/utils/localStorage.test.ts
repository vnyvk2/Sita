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
});
