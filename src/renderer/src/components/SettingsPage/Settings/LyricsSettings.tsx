import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '../../../i18n';
import storage from '../../../utils/localStorage';
import Button from '../../Button';
import Checkbox from '../../Checkbox';
import Dropdown, { type DropdownOption } from '../../Dropdown';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const automaticallySaveLyricsOptions: DropdownOption<AutomaticallySaveLyricsTypes>[] = [
  {
    label: i18n.t('settingsPage.doNotSaveLyricsAutomatically'),
    value: 'NONE'
  },
  { label: i18n.t('settingsPage.syncedLyricsOnly'), value: 'SYNCED' },
  {
    label: i18n.t('settingsPage.saveEitherLyrics'),
    value: 'SYNCED_OR_UN_SYNCED'
  }
];

const LyricsSettings = () => {
  const { data: userSettings } = useQuery(settingsQuery.all);
  const { t } = useTranslation();

  const lyricsBackground = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsBackground ?? 'default'
  );
  const lyricsArtworkBlur = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsArtworkBlur ?? 40
  );
  const lyricsArtworkDarkness = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsArtworkDarkness ?? 50
  );
  const lyricsArtworkAnimation = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsArtworkAnimation ?? true
  );

  const [lyricsAutomaticallySaveState, setLyricsAutomaticallySaveState] =
    useState<AutomaticallySaveLyricsTypes>('NONE');

  const { mutate: updateSaveLyricsInLrcFilesForSupportedSongs } = useMutation({
    mutationFn: (enableSave: boolean) =>
      window.api.settings.updateSaveLyricsInLrcFilesForSupportedSongs(enableSave),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const { mutate: updateCustomLrcFilesSaveLocation } = useMutation({
    mutationFn: (location: string) =>
      window.api.settings.updateCustomLrcFilesSaveLocation(location),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  useEffect(() => {
    const lyricsSaveState = storage.preferences.getPreferences('lyricsAutomaticallySaveState');
    setLyricsAutomaticallySaveState(lyricsSaveState);
  }, []);

  const [autoTranslateLyrics, setAutoTranslateLyrics] = useState(false);

  useEffect(() => {
    const autoTranslateLyrics = storage.preferences.getPreferences('autoTranslateLyrics');
    setAutoTranslateLyrics(autoTranslateLyrics);
  }, []);

  const [autoConvertLyrics, setAutoConvertLyrics] = useState(false);

  useEffect(() => {
    const autoConvertLyrics = storage.preferences.getPreferences('autoConvertLyrics');
    setAutoConvertLyrics(autoConvertLyrics);
  }, []);

  const handleBackgroundChange = (mode: 'default' | 'artwork') => {
    storage.preferences.setPreferences('lyricsBackground', mode);
  };

  const handleBlurChange = (val: number) => {
    storage.preferences.setPreferences('lyricsArtworkBlur', val);
  };

  const handleDarknessChange = (val: number) => {
    storage.preferences.setPreferences('lyricsArtworkDarkness', val);
  };

  const handleAnimationChange = (val: boolean) => {
    storage.preferences.setPreferences('lyricsArtworkAnimation', val);
  };

  const blurSliderStyle: CSSProperties = {
    ['--seek-before-width' as string]: `${((lyricsArtworkBlur - 20) / 60) * 100}%`
  };

  const darknessSliderStyle: CSSProperties = {
    ['--seek-before-width' as string]: `${((lyricsArtworkDarkness - 20) / 60) * 100}%`
  };

  return (
    <CollapsibleSettingsSection
      id="lyrics-settings-container"
      sectionKey="lyrics"
      title={t('settingsPage.lyrics')}
      iconName="notes"
      className="lyrics-settings-container"
      defaultExpanded={false}
    >
      <ul className="marker:bg-font-color-highlight dark:marker:bg-dark-font-color-highlight appear-from-bottom list-disc pl-6">
          {/* 1. Lyrics Appearance (Default vs Artwork background) */}
          <li className="lyrics-appearance-section mb-6 -ml-6 list-none">
            <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 border-background-color-3/20 dark:border-dark-background-color-3/20 flex flex-col gap-4 rounded-lg border p-4">
              <div className="flex flex-col gap-1">
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm font-medium">
                  {t('settingsPage.lyricsAppearance', 'Lyrics Appearance')}
                </div>
                <div className="text-text-color-dimmed dark:text-dark-text-color-dimmed text-xs">
                  {t(
                    'settingsPage.lyricsAppearanceDescription',
                    'Choose the background style for the lyrics view.'
                  )}
                </div>
              </div>

              {/* Segmented Mode Toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={lyricsBackground === 'default'}
                  className={`flex-1 cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ease-in-out ${
                    lyricsBackground === 'default'
                      ? 'bg-font-color-highlight text-background-color-1 dark:bg-dark-font-color-highlight dark:text-dark-background-color-1 shadow-xs'
                      : 'bg-background-color-1/70 dark:bg-dark-background-color-1/70 text-text-color dark:text-dark-text-color hover:bg-background-color-1 dark:hover:bg-dark-background-color-1'
                  }`}
                  onClick={() => handleBackgroundChange('default')}
                >
                  {t('settingsPage.lyricsBackgroundDefault', 'Default')}
                </button>
                <button
                  type="button"
                  aria-pressed={lyricsBackground === 'artwork'}
                  className={`flex-1 cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ease-in-out ${
                    lyricsBackground === 'artwork'
                      ? 'bg-font-color-highlight text-background-color-1 dark:bg-dark-font-color-highlight dark:text-dark-background-color-1 shadow-xs'
                      : 'bg-background-color-1/70 dark:bg-dark-background-color-1/70 text-text-color dark:text-dark-text-color hover:bg-background-color-1 dark:hover:bg-dark-background-color-1'
                  }`}
                  onClick={() => handleBackgroundChange('artwork')}
                >
                  {t('settingsPage.lyricsBackgroundArtwork', 'Artwork Background')}
                </button>
              </div>

              {/* Nested Artwork Background Controls */}
              {lyricsBackground === 'artwork' && (
                <div className="border-background-color-3/20 dark:border-dark-background-color-3/20 mt-2 flex flex-col gap-5 border-t pt-4">
                  {/* Blur Intensity Slider */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm font-medium">
                        {t('settingsPage.blurIntensity', 'Blur Intensity')}: {lyricsArtworkBlur}px
                      </span>
                      <Button
                        label={t('settingsPage.resetBlur', 'Reset to 40px')}
                        iconName="restart_alt"
                        className="px-2.5 py-1 text-xs"
                        isDisabled={lyricsArtworkBlur === 40}
                        clickHandler={() => handleBlurChange(40)}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-text-color-dimmed dark:text-dark-text-color-dimmed text-xs whitespace-nowrap">
                        20px
                      </span>
                      <input
                        type="range"
                        name="lyrics-blur-slider"
                        id="lyrics-blur-slider"
                        aria-label={t('settingsPage.blurIntensity', 'Blur Intensity')}
                        className="seek-bar-slider thumb-visible before:bg-font-color-highlight hover:before:bg-font-color-highlight dark:before:bg-font-color-highlight dark:hover:before:bg-dark-font-color-highlight relative float-left mx-1 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
                        min={20}
                        max={80}
                        step={1}
                        value={lyricsArtworkBlur}
                        onChange={(e) => handleBlurChange(e.currentTarget.valueAsNumber)}
                        style={blurSliderStyle}
                        title={`${lyricsArtworkBlur}px`}
                      />
                      <span className="text-text-color-dimmed dark:text-dark-text-color-dimmed text-xs whitespace-nowrap">
                        80px
                      </span>
                    </div>
                  </div>

                  {/* Background Darkness Slider */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm font-medium">
                        {t('settingsPage.backgroundDarkness', 'Background Darkness')}:{' '}
                        {lyricsArtworkDarkness}%
                      </span>
                      <Button
                        label={t('settingsPage.resetDarkness', 'Reset to 50%')}
                        iconName="restart_alt"
                        className="px-2.5 py-1 text-xs"
                        isDisabled={lyricsArtworkDarkness === 50}
                        clickHandler={() => handleDarknessChange(50)}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-text-color-dimmed dark:text-dark-text-color-dimmed text-xs whitespace-nowrap">
                        20%
                      </span>
                      <input
                        type="range"
                        name="lyrics-darkness-slider"
                        id="lyrics-darkness-slider"
                        aria-label={t('settingsPage.backgroundDarkness', 'Background Darkness')}
                        className="seek-bar-slider thumb-visible before:bg-font-color-highlight hover:before:bg-font-color-highlight dark:before:bg-font-color-highlight dark:hover:before:bg-dark-font-color-highlight relative float-left mx-1 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
                        min={20}
                        max={80}
                        step={1}
                        value={lyricsArtworkDarkness}
                        onChange={(e) => handleDarknessChange(e.currentTarget.valueAsNumber)}
                        style={darknessSliderStyle}
                        title={`${lyricsArtworkDarkness}%`}
                      />
                      <span className="text-text-color-dimmed dark:text-dark-text-color-dimmed text-xs whitespace-nowrap">
                        80%
                      </span>
                    </div>
                  </div>

                  {/* Subtle Animation Toggle */}
                  <div className="mt-1 flex flex-col gap-1">
                    <Checkbox
                      id="lyricsArtworkAnimation"
                      isChecked={lyricsArtworkAnimation}
                      checkedStateUpdateFunction={(state) => handleAnimationChange(state)}
                      labelContent={t('settingsPage.subtleAnimation', 'Subtle animation')}
                    />
                    <div className="text-text-color-dimmed dark:text-dark-text-color-dimmed pl-7 text-xs">
                      {t(
                        'settingsPage.subtleAnimationDescription',
                        'Gentle ambient motion for artwork background.'
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </li>

          {/* Existing lyrics settings */}
          <li className="save-lyrics-automatically mb-4">
            <div className="description">
              {t('settingsPage.saveLyricsAutomaticallyDescription')}
            </div>
            <div className="mt-4 flex flex-row items-center">
              <Dropdown
                name="lyricsAutomaticallySaveState"
                value={lyricsAutomaticallySaveState}
                options={automaticallySaveLyricsOptions}
                onChange={(e) => {
                  const val = e.currentTarget.value as AutomaticallySaveLyricsTypes;
                  setLyricsAutomaticallySaveState(val);
                  storage.preferences.setPreferences('lyricsAutomaticallySaveState', val);
                }}
              />
              <span
                className="material-icons-round-outlined text-font-color-highlight dark:text-dark-font-color-highlight ml-4 cursor-pointer text-2xl"
                title={t('settingsPage.saveLyricsAutomaticallyInfo')}
              >
                help
              </span>
            </div>
          </li>

          <li className="secondary-container always-save-lrc-files mb-4">
            <div className="description">{t('settingsPage.saveLyricsInLrcFilesDescription')}</div>
            <Checkbox
              id="saveLyricsInLrcFilesForSupportedSongs"
              isChecked={
                userSettings !== undefined && userSettings.saveLyricsInLrcFilesForSupportedSongs
              }
              checkedStateUpdateFunction={(state) =>
                updateSaveLyricsInLrcFilesForSupportedSongs(state)
              }
              labelContent={t('settingsPage.saveLyricsInLrcFiles')}
            />
          </li>

          <li className="lrc-files-custom-save-location mb-4">
            <div className="description">
              {t('settingsPage.lrcFileCustomSaveLocationDescription')}
            </div>
            <div className="mt-4 ml-2 flex-row text-sm">
              {userSettings?.customLrcFilesSaveLocation && (
                <>
                  <span>{t('settingsPage.selectedCustomLocation')}: </span>
                  <span className="text-font-color-highlight dark:text-dark-font-color-highlight mr-4">
                    {userSettings.customLrcFilesSaveLocation}
                  </span>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-row items-center">
              <Button
                label={t('settingsPage.setCustomLocation')}
                iconName="location_on"
                iconClassName="material-icons-round-outlined"
                clickHandler={() =>
                  window.api.settingsHelpers
                    .getFolderLocation()
                    .then((folderPath) => updateCustomLrcFilesSaveLocation(folderPath))
                    .catch((err) => console.warn(err))
                }
              />
            </div>
          </li>

          <li className="secondary-container auto-translate-lyrics mb-4">
            <div className="description">{t('settingsPage.autoTranslateLyricsDescription')}</div>
            <Checkbox
              id="autoTranslateLyrics"
              isChecked={autoTranslateLyrics}
              checkedStateUpdateFunction={(state) => {
                setAutoTranslateLyrics(state);
                storage.preferences.setPreferences('autoTranslateLyrics', state);
              }}
              labelContent={t('settingsPage.autoTranslateLyrics')}
            />
          </li>

          <li className="secondary-container auto-convert-lyrics mb-4">
            <div className="description">{t('settingsPage.autoConvertLyricsDescription')}</div>
            <Checkbox
              id="autoConvertLyrics"
              isChecked={autoConvertLyrics}
              checkedStateUpdateFunction={(state) => {
                setAutoConvertLyrics(state);
                storage.preferences.setPreferences('autoConvertLyrics', state);
              }}
              labelContent={t('settingsPage.autoConvertLyrics')}
            />
          </li>
        </ul>
    </CollapsibleSettingsSection>
  );
};

export default LyricsSettings;
