import { useTranslation } from 'react-i18next';

import EqualizerEditor from '../../Equalizer/EqualizerEditor';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const EqualizerSettings = () => {
  const { t } = useTranslation();

  return (
    <CollapsibleSettingsSection
      id="equalizer-settings-container"
      sectionKey="equalizer"
      title={t('settingsPage.equalizer')}
      iconName="graphic_eq"
      className="equalizer-settings-container"
    >
      <div className="pl-6">
        <EqualizerEditor />
      </div>
    </CollapsibleSettingsSection>
  );
};

export default EqualizerSettings;
