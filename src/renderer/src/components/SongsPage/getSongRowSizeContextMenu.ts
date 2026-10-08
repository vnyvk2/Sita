import { setSongViewMode, type SongViewMode } from '@renderer/utils/songViewMode';
import type { TFunction } from 'i18next';

export interface SongRowSizeContextMenuOptions {
  t: TFunction;
  currentRowSize?: 'normal' | 'small';
  currentViewMode?: SongViewMode;
  onRowSizeChange?: (newSize: 'normal' | 'small') => void;
}

export function getSongRowSizeContextMenuItem({
  t,
  currentRowSize = 'normal',
  currentViewMode,
  onRowSizeChange
}: SongRowSizeContextMenuOptions): ContextMenuItem {
  const effectiveSize =
    currentViewMode === 'small'
      ? 'small'
      : currentViewMode === 'normal'
        ? 'normal'
        : currentRowSize;

  const handleSelectSize = (newSize: 'normal' | 'small') => {
    if (onRowSizeChange) {
      onRowSizeChange(newSize);
    } else {
      setSongViewMode(newSize);
    }
  };

  return {
    label: t('settingsPage.songRowSize', 'Song Row Size'),
    iconName: 'table_rows',
    handlerFunction: null,
    innerContextMenus: [
      {
        label: t('settingsPage.rowSizeNormal', 'Normal (60px)'),
        iconName: 'check',
        iconClassName: effectiveSize === 'normal' ? '' : 'invisible',
        handlerFunction: () => handleSelectSize('normal')
      },
      {
        label: t('settingsPage.rowSizeSmall', 'Small (48px)'),
        iconName: 'check',
        iconClassName: effectiveSize === 'small' ? '' : 'invisible',
        handlerFunction: () => handleSelectSize('small')
      }
    ]
  };
}
