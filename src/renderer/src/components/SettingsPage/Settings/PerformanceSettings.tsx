import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useTranslation } from 'react-i18next';

import storage from '../../../utils/localStorage';
import Checkbox from '../../Checkbox';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const PerformanceSettings = () => {
  const localStorageData = useStore(store, (state) => state.localStorage);

  const { t } = useTranslation();

  return (
    <CollapsibleSettingsSection
      id="performance-settings-container"
      sectionKey="performance"
      title={t('settingsPage.performance')}
      iconName="offline_bolt"
      iconClassName="leading-none"
      className="performance-settings-container"
    >
      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        <li className="secondary-container toggle-remove-animations-on-battery-power mb-4">
          <div className="description">{t('settingsPage.removeAnimationOnBatteryDescription')}</div>
          <Checkbox
            id="removeAnimationsOnBatteryPower"
            labelContent={t('settingsPage.removeAnimationOnBattery')}
            isChecked={
              localStorageData !== undefined &&
              localStorageData.preferences.removeAnimationsOnBatteryPower
            }
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('removeAnimationsOnBatteryPower', state)
            }
          />
        </li>
        <li className="secondary-container toggle-reduce-visual-effects-on-battery mb-4">
          <div className="description">
            {t('settingsPage.reduceVisualEffectsOnBatteryDescription')}
          </div>
          <Checkbox
            id="reduceVisualEffectsOnBattery"
            labelContent={t('settingsPage.reduceVisualEffectsOnBattery')}
            isChecked={
              localStorageData !== undefined &&
              (localStorageData.preferences.reduceVisualEffectsOnBattery ?? false)
            }
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('reduceVisualEffectsOnBattery', state)
            }
          />
        </li>
        <li className="secondary-container toggle-allow-to-prevent-screen-sleeping mb-4">
          <div className="description">
            {t('settingsPage.allowToPreventScreenSleepingDescription')}
          </div>
          <Checkbox
            id="allowToPreventScreenSleeping"
            labelContent={t('settingsPage.allowToPreventScreenSleeping')}
            isChecked={
              localStorageData !== undefined &&
              localStorageData.preferences.allowToPreventScreenSleeping
            }
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('allowToPreventScreenSleeping', state)
            }
          />
        </li>
      </ul>
    </CollapsibleSettingsSection>
  );
};

export default PerformanceSettings;
