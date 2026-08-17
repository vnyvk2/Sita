/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */

import { settingsMutation, settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { type KeyboardEvent, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { themeRegistry, type ThemePreset } from '../../../../../common/themeRegistry';
import HomeImgDark from '../../../assets/images/webp/home-skeleton-dark.webp';
import HomeImgLightDark from '../../../assets/images/webp/home-skeleton-light-dark.webp';
import HomeImgLight from '../../../assets/images/webp/home-skeleton-light.webp';
import { useEffectiveAppearance } from '../../../hooks/useEffectiveAppearance';
import storage from '../../../utils/localStorage';
import Checkbox from '../../Checkbox';
import Img from '../../Img';
import DynamicThemeSettings from './DynamicThemeSettings';
import ThemePreviewGrid from './ThemePreviewGrid';

const ThemeSettings = () => {
  const [showThemeGrid, setShowThemeGrid] = useState(false);
  const { data: userSettings } = useQuery(settingsQuery.all);

  const { mutate: changeAppTheme } = useMutation({
    mutationKey: settingsMutation.changeAppTheme.mutationKey,
    mutationFn: async (theme: AppTheme) => window.api.theme.changeAppTheme(theme),
    // When mutate is called:
    onMutate: async (theme) => {
      await queryClient.cancelQueries({ queryKey: settingsQuery.all.queryKey });

      const prevSettings = queryClient.getQueryData<typeof userSettings>(
        settingsQuery.all.queryKey
      );

      const newSettings = {
        ...prevSettings!,
        isDarkMode:
          theme === 'dark' ? true : theme === 'light' ? false : (prevSettings?.isDarkMode ?? false),
        useSystemTheme: theme === 'system'
      };
      queryClient.setQueryData<typeof userSettings>(settingsQuery.all.queryKey, newSettings);

      return { prevSettings, newSettings };
    },
    onError: (_, __, onMutateResult) =>
      queryClient.setQueryData<typeof userSettings>(
        settingsQuery.all.queryKey,
        onMutateResult?.prevSettings
      ),
    onSettled: () => queryClient.invalidateQueries(settingsQuery.all)
  });

  const currentSongPaletteData = useStore(store, (state) => state.currentSongData?.paletteData);
  const enableImageBasedDynamicThemes = useStore(
    store,
    (state) => state.localStorage.preferences?.enableImageBasedDynamicThemes
  );
  const themePreset = useStore(
    store,
    (state) => state.localStorage.preferences?.themePreset ?? 'default'
  );
  const isSongCardDynamicArtworkBackgroundEnabled = useStore(
    store,
    (state) => state.localStorage.preferences?.isSongCardDynamicArtworkBackgroundEnabled ?? false
  );

  const { t } = useTranslation();

  const focusInput = useCallback((e: KeyboardEvent<HTMLLabelElement>) => {
    if (e.key === 'Enter') {
      const inputId = e.currentTarget.htmlFor;
      const inputElement = document.getElementById(inputId);
      inputElement?.click();
    }
  }, []);

  const { isThemeControlled } = useEffectiveAppearance();

  return userSettings ? (
    <li
      className="main-container appearance-settings-container mb-16"
      id="appearance-settings-container"
    >
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center text-2xl font-medium">
        <span className="material-icons-round-outlined mr-2">dark_mode</span>
        {t('settingsPage.appearance')}
      </div>
      <ul className="marker:bg-font-color-highlight dark:marker:bg-dark-font-color-highlight list-disc pl-6">
        <li>
          <div className="description">
            {t('settingsPage.changeTheme')}
            {isThemeControlled && (
              <span className="text-font-color-highlight dark:text-dark-font-color-highlight ml-2 font-medium">
                {t('settingsPage.controlledByTheme', 'Controlled by {{theme}}', {
                  theme: t(
                    (themeRegistry[themePreset as ThemePreset] ?? themeRegistry.default).nameKey
                  )
                })}
              </span>
            )}
          </div>
          <div
            className={`theme-change-radio-btns flex max-w-3xl items-center justify-between pt-4 pl-4 ${isThemeControlled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <label
              htmlFor="lightThemeRadioBtn"
              tabIndex={isThemeControlled ? -1 : 0}
              className={`theme-change-radio-btn bg-background-color-2/75 hover:bg-background-color-2 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 mb-2 flex cursor-pointer flex-col items-center rounded-md p-6 outline-offset-1 focus-within:outline-2 ${
                !userSettings.useSystemTheme &&
                !userSettings.isDarkMode &&
                'bg-background-color-3! dark:bg-dark-background-color-3!'
              }`}
              onKeyDown={focusInput}
            >
              <input
                type="radio"
                name="theme"
                className="peer invisible absolute -left-[9999px] mr-4"
                value="lightTheme"
                id="lightThemeRadioBtn"
                defaultChecked={!userSettings.useSystemTheme && !userSettings.isDarkMode}
                disabled={isThemeControlled}
                onClick={() => changeAppTheme('light')}
              />
              <Img loading="eager" src={HomeImgLight} className="h-24 w-40 shadow-md" />
              <span className="peer-checked:text-font-color-black! dark:peer-checked:text-font-color-black! mt-4">
                {t('settingsPage.lightTheme')}
              </span>
            </label>

            <label
              htmlFor="darkThemeRadioBtn"
              tabIndex={isThemeControlled ? -1 : 0}
              className={`theme-change-radio-btn bg-background-color-2/75 hover:bg-background-color-2 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 mb-2 flex cursor-pointer flex-col items-center rounded-md p-6 outline-offset-1 focus-within:outline-2 ${
                !userSettings.useSystemTheme &&
                userSettings.isDarkMode &&
                'bg-background-color-3! dark:bg-dark-background-color-3!'
              }`}
              onKeyDown={focusInput}
            >
              <input
                type="radio"
                name="theme"
                className="peer invisible absolute -left-[9999px] mr-4"
                value="darkTheme"
                id="darkThemeRadioBtn"
                defaultChecked={!userSettings.useSystemTheme && userSettings.isDarkMode}
                disabled={isThemeControlled}
                onClick={() => changeAppTheme('dark')}
              />
              <Img loading="eager" src={HomeImgDark} className="h-24 w-40 shadow-md" />
              <span className="peer-checked:text-font-color-black! dark:peer-checked:text-font-color-black! mt-4">
                {t('settingsPage.darkTheme')}
              </span>
            </label>

            <label
              htmlFor="systemThemeRadioBtn"
              tabIndex={isThemeControlled ? -1 : 0}
              className={`theme-change-radio-btn hover:bg-background-color bg-background-color-2/75 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 mb-2 flex cursor-pointer flex-col items-center rounded-md p-6 outline-offset-1 focus-within:outline-2 ${
                userSettings.useSystemTheme &&
                'bg-background-color-3! dark:bg-dark-background-color-3!'
              } `}
              onKeyDown={focusInput}
            >
              <input
                type="radio"
                name="theme"
                className="peer invisible absolute -left-[9999px] mr-4"
                value="systemTheme"
                id="systemThemeRadioBtn"
                defaultChecked={userSettings.useSystemTheme}
                disabled={isThemeControlled}
                onClick={() => changeAppTheme('system')}
              />
              <Img loading="eager" src={HomeImgLightDark} className="h-24 w-40 shadow-md" />
              <span className="peer-checked:text-font-color-black! dark:peer-checked:text-font-color-black! mt-4">
                {t('settingsPage.systemTheme')}
              </span>
            </label>
          </div>
        </li>
        <li className="secondary-container change-theme-preset my-4">
          <div className="description">{t('settingsPage.themePresetDescription')}</div>
          <div className="mt-4 flex w-full flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-sm font-medium">
                {t('settingsPage.themePreset')}:{' '}
                <span className="text-font-color-highlight dark:text-dark-font-color-highlight ml-1">
                  {t((themeRegistry[themePreset as ThemePreset] ?? themeRegistry.default).nameKey)}
                </span>
              </span>
              <button
                type="button"
                className="bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                onClick={() => setShowThemeGrid((prev) => !prev)}
              >
                {showThemeGrid
                  ? t('settingsPage.hideThemes', 'Hide Themes')
                  : t('settingsPage.browseThemes', 'Browse Themes')}
              </button>
            </div>

            {showThemeGrid && (
              <div className="animate-in fade-in slide-in-from-top-4 mt-2 duration-300">
                <ThemePreviewGrid
                  currentTheme={themePreset as ThemePreset}
                  onThemeChange={(theme) =>
                    storage.preferences.setPreferences('themePreset', theme)
                  }
                />
              </div>
            )}
          </div>
        </li>

        <li className="secondary-container enable-image-based-dynamic-themes mb-4">
          <div className="description">
            {t('settingsPage.enableImageBasedDynamicThemesDescription')}
          </div>
          <Checkbox
            id="toggleEnableImageBasedDynamicThemes"
            isChecked={enableImageBasedDynamicThemes}
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('enableImageBasedDynamicThemes', state)
            }
            labelContent={t('settingsPage.enableImageBasedDynamicThemes')}
          />
          {enableImageBasedDynamicThemes && (
            <DynamicThemeSettings palette={currentSongPaletteData} />
          )}
        </li>

        <li className="secondary-container enable-song-card-dynamic-artwork-background mb-4">
          <div className="description">
            {t('settingsPage.enableSongCardDynamicArtworkBackgroundDescription')}
          </div>
          <Checkbox
            id="toggleEnableSongCardDynamicArtworkBackground"
            isChecked={isSongCardDynamicArtworkBackgroundEnabled}
            checkedStateUpdateFunction={(state) =>
              storage.preferences.setPreferences('isSongCardDynamicArtworkBackgroundEnabled', state)
            }
            labelContent={t('settingsPage.enableSongCardDynamicArtworkBackground')}
          />
        </li>
      </ul>
    </li>
  ) : null;
};

export default ThemeSettings;
