import { useEffect, useRef } from 'react';
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
import EqualizerSettings from './Settings/EqualizerSettings';
import LanguageSettings from './Settings/LanguageSettings';
import LibrarySettings from './Settings/LibrarySettings';
import LyricsSettings from './Settings/LyricsSettings';
import MetadataSettings from './Settings/MetadataSettings';
import PerformanceSettings from './Settings/PerformanceSettings';
import PreferencesSettings from './Settings/PreferencesSettings';
import {
  SETTINGS_SECTION_KEYS,
  SettingsCollapseProvider,
  useSettingsCollapse,
  useSettingsCollapseActions,
  type SettingsSectionKey
} from './Settings/SettingsCollapseContext';
import { settingsCatalog } from './settingsCatalog';
import SettingsSearchInput from './SettingsSearchInput';
import StartupSettings from './Settings/StartupSettings';
import StorageSettings from './Settings/StorageSettings';

interface SettingsPageProps {
  initialHighlight?: string;
  initialSection?: string;
}

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
    <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex flex-wrap items-center justify-between gap-4 text-3xl font-medium">
      <span>{t('settingsPage.settings')}</span>
      <div className="flex items-center gap-3">
        <SettingsSearchInput />
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
    </div>
  );
};

const SettingsDeepLinkHandler = ({
  initialHighlight,
  initialSection
}: SettingsPageProps) => {
  const collapseActions = useSettingsCollapseActions();
  const collapseContext = useSettingsCollapse();
  const jumpToSetting = collapseActions?.jumpToSetting ?? collapseContext?.jumpToSetting;
  const lastHandledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialHighlight && jumpToSetting) {
      const targetKey = `${initialHighlight}:${initialSection ?? ''}`;
      if (lastHandledKeyRef.current === targetKey) return;
      lastHandledKeyRef.current = targetKey;

      let sectionKey: SettingsSectionKey | undefined;
      if (
        initialSection &&
        SETTINGS_SECTION_KEYS.includes(initialSection as SettingsSectionKey)
      ) {
        sectionKey = initialSection as SettingsSectionKey;
      }

      if (!sectionKey) {
        const found = settingsCatalog.find((e) => e.id === initialHighlight);
        if (found) {
          sectionKey = found.sectionKey;
        }
      }

      if (sectionKey) {
        jumpToSetting(initialHighlight, sectionKey);
      } else {
        console.warn(
          `[Settings] Unable to resolve section for highlight target: ${initialHighlight}`
        );
      }
    }
  }, [initialHighlight, initialSection, jumpToSetting]);

  return null;
};

const SettingsPage = ({ initialHighlight, initialSection }: SettingsPageProps) => {
  return (
    <MainContainer className="main-container settings-container appear-from-bottom text-font-color-black dark:text-font-color-white mb-0! h-fit! [scrollbar-gutter:stable] pr-8 pb-8">
      <SettingsCollapseProvider>
        <SettingsDeepLinkHandler
          initialHighlight={initialHighlight}
          initialSection={initialSection}
        />
        <SettingsHeader />

        <ul className="pl-4">
          {/* APPEARANCE SETTINGS */}
          <AppearanceSettings />

          {/* LANGUAGE SETTINGS */}
          <LanguageSettings />

          {/* AUDIO PLAYBACK SETTINGS */}
          <AudioPlaybackSettings />

          {/* ACCOUNTS SETTINGS */}
          <AccountsSettings />

          {/* LYRICS SETTINGS */}
          <LyricsSettings />

          {/* EQUALIZER SETTINGS */}
          <EqualizerSettings />

          {/* DEFAULT PAGE SETTINGS */}
          <DefaultPageSettings />

          {/* PREFERENCES SETTINGS */}
          <PreferencesSettings />

          {/* METADATA & AUTOTAG SOURCES SETTINGS */}
          <MetadataSettings />

          {/* ACCESSIBILITY SETTINGS */}
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
