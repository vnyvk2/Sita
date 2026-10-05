import storage from '@renderer/utils/localStorage';
import type { TFunction } from 'i18next';

export type AlphabetScrubberPosition = 'off' | 'top-horizontal' | 'left-vertical';

export interface AlphabetScrubberContextMenuOptions {
  t: TFunction;
  currentPosition?: AlphabetScrubberPosition;
  currentSortOrder?: string;
  onAutoSwitchSort?: (order: 'aToZ') => void;
}

export function getAlphabetScrubberContextMenuItem({
  t,
  currentPosition = 'off',
  currentSortOrder,
  onAutoSwitchSort
}: AlphabetScrubberContextMenuOptions): ContextMenuItem {
  const handleSelectPosition = (newPosition: AlphabetScrubberPosition) => {
    storage.preferences.setPreferences('alphabetScrubberPosition', newPosition);
    if (newPosition !== 'off' && currentSortOrder !== 'aToZ' && currentSortOrder !== 'zToA') {
      onAutoSwitchSort?.('aToZ');
    }
  };

  return {
    label: t('settingsPage.alphabetScrubberPosition', 'Alphabet Navigation Bar'),
    iconName: 'sort_by_alpha',
    handlerFunction: null,
    innerContextMenus: [
      {
        label: t('settingsPage.alphabetScrubberOff', 'Off'),
        iconName: 'check',
        iconClassName: currentPosition === 'off' ? '' : 'invisible',
        handlerFunction: () => handleSelectPosition('off')
      },
      {
        label: t('settingsPage.alphabetScrubberTop', 'Top (Horizontal)'),
        iconName: 'check',
        iconClassName: currentPosition === 'top-horizontal' ? '' : 'invisible',
        handlerFunction: () => handleSelectPosition('top-horizontal')
      },
      {
        label: t('settingsPage.alphabetScrubberLeft', 'Left (Vertical)'),
        iconName: 'check',
        iconClassName: currentPosition === 'left-vertical' ? '' : 'invisible',
        handlerFunction: () => handleSelectPosition('left-vertical')
      }
    ]
  };
}
