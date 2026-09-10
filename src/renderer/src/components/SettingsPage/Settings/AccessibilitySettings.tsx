import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useTranslation } from 'react-i18next';

import storage from '../../../utils/localStorage';
import Checkbox from '../../Checkbox';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const AccessibilitySettings = () => {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { t } = useTranslation();

  return (
    <CollapsibleSettingsSection
      id="accessibility-settings-container"
      sectionKey="accessibility"
      title={t('settingsPage.accessibility')}
      iconName="settings_accessibility"
      className="accessibility-settings-container"
    >
      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        <li className="secondary-container toggle-reduced-motion mb-4">
          <div className="description">{t('settingsPage.reducedMotionDescription')}</div>
          <Checkbox
            id="enableReducedMotion"
            labelContent={t('settingsPage.enableReducedMotion')}
            isChecked={preferences?.isReducedMotion}
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('isReducedMotion', state)
            }
          />
        </li>
      </ul>
    </CollapsibleSettingsSection>
  );
};

export default AccessibilitySettings;
