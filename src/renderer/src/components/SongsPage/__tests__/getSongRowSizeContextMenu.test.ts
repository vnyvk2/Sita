import storage from '@renderer/utils/localStorage';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSongRowSizeContextMenuItem } from '../getSongRowSizeContextMenu';

vi.mock('@renderer/utils/localStorage', () => ({
  default: {
    preferences: {
      setPreferences: vi.fn(),
      getPreferences: vi.fn()
    }
  }
}));

describe('getSongRowSizeContextMenuItem', () => {
  const t = vi.fn(
    (key: string, defaultValue?: string) => defaultValue ?? key
  ) as unknown as TFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a context menu item with 2 inner options (normal and small)', () => {
    const item = getSongRowSizeContextMenuItem({
      t,
      currentRowSize: 'normal'
    });

    expect(item.label).toBe('Song Row Size');
    expect(item.iconName).toBe('table_rows');
    expect(item.handlerFunction).toBeNull();
    expect(item.innerContextMenus).toHaveLength(2);

    const [normalItem, smallItem] = item.innerContextMenus!;
    expect(normalItem.label).toBe('Normal (60px)');
    expect(smallItem.label).toBe('Small (48px)');
  });

  it('marks active option with visible checkmark and others with invisible class for normal', () => {
    const item = getSongRowSizeContextMenuItem({
      t,
      currentRowSize: 'normal'
    });

    const [normalItem, smallItem] = item.innerContextMenus!;
    expect(normalItem.iconName).toBe('check');
    expect(normalItem.iconClassName).toBe('');

    expect(smallItem.iconName).toBe('check');
    expect(smallItem.iconClassName).toBe('invisible');
  });

  it('marks active option with visible checkmark and others with invisible class for small', () => {
    const item = getSongRowSizeContextMenuItem({
      t,
      currentRowSize: 'small'
    });

    const [normalItem, smallItem] = item.innerContextMenus!;
    expect(normalItem.iconName).toBe('check');
    expect(normalItem.iconClassName).toBe('invisible');

    expect(smallItem.iconName).toBe('check');
    expect(smallItem.iconClassName).toBe('');
  });

  it('calls onRowSizeChange callback when provided', () => {
    const onRowSizeChange = vi.fn();
    const item = getSongRowSizeContextMenuItem({
      t,
      currentRowSize: 'normal',
      onRowSizeChange
    });

    const [normalItem, smallItem] = item.innerContextMenus!;
    normalItem.handlerFunction?.();
    expect(onRowSizeChange).toHaveBeenCalledWith('normal');

    smallItem.handlerFunction?.();
    expect(onRowSizeChange).toHaveBeenCalledWith('small');
  });

  it('falls back to setSongViewMode when onRowSizeChange is not provided', () => {
    const item = getSongRowSizeContextMenuItem({
      t,
      currentRowSize: 'normal'
    });

    const [, smallItem] = item.innerContextMenus!;
    smallItem.handlerFunction?.();
    expect(storage.preferences.setPreferences).toHaveBeenCalledWith('songViewMode', 'small');
    expect(storage.preferences.setPreferences).toHaveBeenCalledWith('songRowSize', 'small');
    expect(storage.preferences.setPreferences).toHaveBeenCalledWith('isCompactSongView', false);
  });
});
