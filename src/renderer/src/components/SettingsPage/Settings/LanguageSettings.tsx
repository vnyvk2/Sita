import { settingsQuery } from '@renderer/queries/settings';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import i18n, { supportedLanguagesDropdownOptions } from '../../../i18n';
import Dropdown from '../../Dropdown';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const LanguageSettings = () => {
  const { t } = useTranslation();
  const { data: userSettings } = useQuery(settingsQuery.all);

  const { addNewNotifications } = useContext(AppUpdateContext);
  const appLang = userSettings?.language || 'en';

  return (
    <CollapsibleSettingsSection
      id="language-settings-container"
      sectionKey="language"
      title={t('settingsPage.language')}
      iconName="translate"
      iconClassName="leading-none"
      className="language-settings-container"
    >
      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        <li className="seekbar-scroll-interval mb-4">
          <div className="description">{t('settingsPage.languageDescription')}</div>
          <Dropdown
            className="mt-4"
            name="supportedLanguagesDropdown"
            value={appLang}
            options={supportedLanguagesDropdownOptions}
            onChange={(e) => {
              const val = e.currentTarget.value as LanguageCodes;

              i18n.reloadResources();
              // if (i18n.languages.includes(val))
              return i18n
                .changeLanguage(val, (err) => {
                  if (err) return console.warn(err);
                  window.api.userData.saveUserData('language', val);
                  return window.api.appControls.restartRenderer(`App language changed to ${val}`);
                })
                .then(() =>
                  addNewNotifications([
                    {
                      id: 'languageChanged',
                      content: t('notifications.languageChanged'),
                      iconName: 'translate'
                    }
                  ])
                );
              // return console.error(`App doesn't support the selected language '${val}'`, {
              //   supportedLanguages: i18n.languages
              // });
            }}
          />
        </li>
      </ul>
    </CollapsibleSettingsSection>
  );
};

export default LanguageSettings;
