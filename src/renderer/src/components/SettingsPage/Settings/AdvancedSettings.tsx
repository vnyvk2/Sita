import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import Checkbox from '../../Checkbox';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const AdvancedSettings = () => {
  const { data: userSettings } = useQuery(settingsQuery.all);

  const { t } = useTranslation();

  const { mutate: updateSaveVerboseLogs } = useMutation({
    mutationFn: (enable: boolean) => window.api.settings.updateSaveVerboseLogs(enable),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  return (
    <CollapsibleSettingsSection
      id="advanced-settings-container"
      sectionKey="advanced"
      title={t('settingsPage.advanced')}
      iconName="handyman"
      iconClassName="leading-none"
      className="advanced-settings-container"
    >
      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        <li className="secondary-container toggle-save-verbose-logs mb-4">
          <div className="description">{t('settingsPage.saveVerboseLogsDescription')}</div>
          <Checkbox
            id="toggleSaveVerboseLogs"
            labelContent={t('settingsPage.saveVerboseLogs')}
            isChecked={userSettings ? userSettings.saveVerboseLogs : false}
            checkedStateUpdateFunction={(state) => updateSaveVerboseLogs(state)}
          />
        </li>
      </ul>
    </CollapsibleSettingsSection>
  );
};

export default AdvancedSettings;
