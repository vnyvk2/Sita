import { useTranslation } from 'react-i18next';

import Button from '../Button';
import MainContainer from '../MainContainer';
import AboutSettings from './Settings/AboutSettings';
import AccessibilitySettings from './Settings/AccessibilitySettings';
import AccountsSettings from './Settings/AccountsSettings';
import AdvancedSettings from './Settings/AdvancedSettings';
import AppearanceSettings from './Settings/AppearanceSettings';
import AudioPlaybackSettings from './Settings/AudioPlaybackSettings';
import DefaultPageSettings from './Settings/DefaultPageSettings';
import DownloadsSettings from './Settings/DownloadsSettings';
// import StorageSettings from './Settings/StorageSettings';
import EqualizerSettings from './Settings/EqualizerSettings';
import LanguageSettings from './Settings/LanguageSettings';
import LibrarySettings from './Settings/LibrarySettings';
import LyricsSettings from './Settings/LyricsSettings';
import MetadataSettings from './Settings/MetadataSettings';
import PerformanceSettings from './Settings/PerformanceSettings';
import PreferencesSettings from './Settings/PreferencesSettings';
import {
  SettingsCollapseProvider,
  useSettingsCollapse
} from './Settings/SettingsCollapseContext';
import StartupSettings from './Settings/StartupSettings';
import StorageSettings from './Settings/StorageSettings';

const SettingsHeader = () => {
  const { t } = useTranslation();
  const collapseContext = useSettingsCollapse();

  const areAllCollapsed = collapseContext?.areAllCollapsed ?? false;

  const handleToggleAll = () => {
    if (!collapseContext) return;
    if (areAllCollapsed) {
      collapseContext.expandAll();
    } else {
      collapseContext.collapseAll();
    }
  };

  return (
    <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center justify-between text-3xl font-medium">
      <span>{t('settingsPage.settings')}</span>
      {collapseContext && (
        <Button
          tooltipLabel={
            areAllCollapsed
              ? t('settingsPage.expandAll', 'Expand all')
              : t('settingsPage.collapseAll', 'Collapse all')
          }
          iconName={areAllCollapsed ? 'unfold_more' : 'unfold_less'}
          iconClassName="text-xl!"
          className="mr-0 h-10 w-10 cursor-pointer p-0 text-sm font-normal"
          clickHandler={handleToggleAll}
        />
      )}
    </div>
  );
};

const SettingsPage = () => {
  return (
    <MainContainer className="main-container settings-container appear-from-bottom text-font-color-black dark:text-font-color-white mb-0! h-fit! [scrollbar-gutter:stable] pr-8 pb-8">
      <SettingsCollapseProvider>
        <SettingsHeader />

        <ul className="pl-4">
          {/*  APPEARANCE SETTINGS */}
          <AppearanceSettings />

          {/*  LANGUAGE SETTINGS */}
          <LanguageSettings />

          {/* ? AUDIO PLAYBACK SETTINGS */}
          <AudioPlaybackSettings />

          {/* ? ACCOUNTS SETTINGS */}
          <AccountsSettings />

          {/* ? LYRICS SETTINGS */}
          <LyricsSettings />

          {/* ? EQUALIZER SETTINGS */}
          <EqualizerSettings />

          {/* DEFAULT PAGE SETTINGS */}
          <DefaultPageSettings />

          {/* ? PREFERENCES SETTINGS */}
          <PreferencesSettings />

          {/* METADATA & AUTOTAG SOURCES SETTINGS */}
          <MetadataSettings />

          {/* ? ACCESSIBILITY SETTINGS */}
          <AccessibilitySettings />

          {/* PERFORMANCE SETTINGS */}
          <PerformanceSettings />

          {/* ONLINE DOWNLOADS SETTINGS */}
          <DownloadsSettings />

          {/* LIBRARY SCANNING SETTINGS */}
          <LibrarySettings />

          {/* STARTUP SETTINGS */}
          <StartupSettings />

          {/* STORAGE SETTINGS */}
          <StorageSettings />

          {/* ADVANCED SETTINGS */}
          <AdvancedSettings />

          {/* ABOUT SETTINGS */}
          <AboutSettings />
        </ul>
      </SettingsCollapseProvider>
    </MainContainer>
  );
};

export default SettingsPage;
