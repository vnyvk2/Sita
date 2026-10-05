import storage from '@renderer/utils/localStorage';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAlphabetScrubberContextMenuItem } from '../getAlphabetScrubberContextMenu';

vi.mock('@renderer/utils/localStorage', () => ({
  default: {
    preferences: {
      setPreferences: vi.fn(),
      getPreferences: vi.fn()
    }
  }
}));

describe('getAlphabetScrubberContextMenuItem', () => {
  const t = vi.fn(
    (key: string, defaultValue?: string) => defaultValue ?? key
  ) as unknown as TFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a context menu item with 3 inner options', () => {
    const item = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'off',
      currentSortOrder: 'aToZ'
    });

    expect(item.label).toBe('Alphabet Navigation Bar');
    expect(item.iconName).toBe('sort_by_alpha');
    expect(item.handlerFunction).toBeNull();
    expect(item.innerContextMenus).toHaveLength(3);

    const [offItem, topItem, leftItem] = item.innerContextMenus!;
    expect(offItem.label).toBe('Off');
    expect(topItem.label).toBe('Top (Horizontal)');
    expect(leftItem.label).toBe('Left (Vertical)');
  });

  it('marks active option with visible checkmark and others with invisible class', () => {
    const itemTop = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'top-horizontal',
      currentSortOrder: 'aToZ'
    });

    const [offItem, topItem, leftItem] = itemTop.innerContextMenus!;
    expect(offItem.iconName).toBe('check');
    expect(offItem.iconClassName).toBe('invisible');

    expect(topItem.iconName).toBe('check');
    expect(topItem.iconClassName).toBe('');

    expect(leftItem.iconName).toBe('check');
    expect(leftItem.iconClassName).toBe('invisible');
  });

  it('sets preference to off and does not trigger sort auto-switch', () => {
    const onAutoSwitchSort = vi.fn();
    const item = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'top-horizontal',
      currentSortOrder: 'dateAddedAscending',
      onAutoSwitchSort
    });

    const [offItem] = item.innerContextMenus!;
    offItem.handlerFunction!();

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith(
      'alphabetScrubberPosition',
      'off'
    );
    expect(onAutoSwitchSort).not.toHaveBeenCalled();
  });

  it('auto-switches sort to aToZ when enabling top-horizontal from a non-A-Z sort', () => {
    const onAutoSwitchSort = vi.fn();
    const item = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'off',
      currentSortOrder: 'dateAddedAscending',
      onAutoSwitchSort
    });

    const [, topItem] = item.innerContextMenus!;
    topItem.handlerFunction!();

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith(
      'alphabetScrubberPosition',
      'top-horizontal'
    );
    expect(onAutoSwitchSort).toHaveBeenCalledTimes(1);
    expect(onAutoSwitchSort).toHaveBeenCalledWith('aToZ');
  });

  it('auto-switches sort to aToZ when enabling left-vertical from a customOrder sort', () => {
    const onAutoSwitchSort = vi.fn();
    const item = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'off',
      currentSortOrder: 'customOrder',
      onAutoSwitchSort
    });

    const [, , leftItem] = item.innerContextMenus!;
    leftItem.handlerFunction!();

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith(
      'alphabetScrubberPosition',
      'left-vertical'
    );
    expect(onAutoSwitchSort).toHaveBeenCalledTimes(1);
    expect(onAutoSwitchSort).toHaveBeenCalledWith('aToZ');
  });

  it('does NOT auto-switch sort when already sorted by aToZ', () => {
    const onAutoSwitchSort = vi.fn();
    const item = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'off',
      currentSortOrder: 'aToZ',
      onAutoSwitchSort
    });

    const [, topItem] = item.innerContextMenus!;
    topItem.handlerFunction!();

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith(
      'alphabetScrubberPosition',
      'top-horizontal'
    );
    expect(onAutoSwitchSort).not.toHaveBeenCalled();
  });

  it('does NOT auto-switch sort when already sorted by zToA', () => {
    const onAutoSwitchSort = vi.fn();
    const item = getAlphabetScrubberContextMenuItem({
      t,
      currentPosition: 'off',
      currentSortOrder: 'zToA',
      onAutoSwitchSort
    });

    const [, , leftItem] = item.innerContextMenus!;
    leftItem.handlerFunction!();

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith(
      'alphabetScrubberPosition',
      'left-vertical'
    );
    expect(onAutoSwitchSort).not.toHaveBeenCalled();
  });
});
