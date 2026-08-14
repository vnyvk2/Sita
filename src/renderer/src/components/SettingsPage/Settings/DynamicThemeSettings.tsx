import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import storage from '../../../utils/localStorage';
import { formatHsl, resolveSemanticPalette } from '../../../utils/semanticPalette';
import { type DynamicThemeMode } from '../../../utils/themeResolver';
import Button from '../../Button';

interface DynamicThemeSettingsProps {
  palette?: NodeVibrantPalette;
}

const DynamicThemeSettings = ({ palette }: DynamicThemeSettingsProps) => {
  const { t } = useTranslation();

  const dynamicThemeMode = useStore(
    store,
    (state) => (state.localStorage.preferences?.dynamicThemeMode ?? 'dynamic-accent') as DynamicThemeMode
  );

  const dynamicThemeIntensity = useStore(
    store,
    (state) => state.localStorage.preferences?.dynamicThemeIntensity ?? 100
  );

  const semanticPalette = palette ? resolveSemanticPalette(palette) : undefined;

  const intensitySliderStyle: CSSProperties = {
    ['--seek-before-width' as string]: `${dynamicThemeIntensity}%`
  };

  const handleModeChange = (mode: 'dynamic-accent' | 'full-dynamic') => {
    storage.preferences.setPreferences('dynamicThemeMode', mode);
  };

  const handleIntensityChange = (intensity: number) => {
    storage.preferences.setPreferences('dynamicThemeIntensity', intensity);
  };

  return (
    <div className="mt-4 flex flex-col gap-6 rounded-lg bg-background-color-2/50 dark:bg-dark-background-color-2/50 p-4 border border-background-color-3/20 dark:border-dark-background-color-3/20">
      {/* 1. Dynamic Mode Selection */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
          {t('settingsPage.dynamicThemeMode', 'Dynamic Theme Mode')}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={dynamicThemeMode === 'dynamic-accent'}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ease-in-out ${
              dynamicThemeMode === 'dynamic-accent'
                ? 'bg-font-color-highlight text-background-color-1 dark:bg-dark-font-color-highlight dark:text-dark-background-color-1 shadow-xs'
                : 'bg-background-color-1/70 dark:bg-dark-background-color-1/70 text-text-color dark:text-dark-text-color hover:bg-background-color-1 dark:hover:bg-dark-background-color-1'
            }`}
            onClick={() => handleModeChange('dynamic-accent')}
          >
            {t('settingsPage.dynamicThemeModeAccent', 'Dynamic Accent')}
          </button>
          <button
            type="button"
            aria-pressed={dynamicThemeMode === 'full-dynamic'}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ease-in-out ${
              dynamicThemeMode === 'full-dynamic'
                ? 'bg-font-color-highlight text-background-color-1 dark:bg-dark-font-color-highlight dark:text-dark-background-color-1 shadow-xs'
                : 'bg-background-color-1/70 dark:bg-dark-background-color-1/70 text-text-color dark:text-dark-text-color hover:bg-background-color-1 dark:hover:bg-dark-background-color-1'
            }`}
            onClick={() => handleModeChange('full-dynamic')}
          >
            {t('settingsPage.dynamicThemeModeFull', 'Full Atmosphere')}
          </button>
        </div>
        <div className="text-xs text-text-color-dimmed dark:text-dark-text-color-dimmed mt-1">
          {dynamicThemeMode === 'dynamic-accent'
            ? t(
                'settingsPage.dynamicThemeModeAccentDesc',
                "Preserves active preset backgrounds and surfaces while dynamically coloring accents, highlights, and seekbars from the album artwork."
              )
            : t(
                'settingsPage.dynamicThemeModeFullDesc',
                'Dynamically synthesizes the entire application color scheme from album artwork.'
              )}
        </div>
      </div>

      {/* 2. Theme Intensity Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
            {t('settingsPage.dynamicThemeIntensity', 'Dynamic Theme Intensity')}: {dynamicThemeIntensity}%
          </span>
          <Button
            label={t('settingsPage.resetIntensity', 'Reset to 100%')}
            iconName="restart_alt"
            className="text-xs py-1 px-2.5"
            isDisabled={dynamicThemeIntensity === 100}
            clickHandler={() => handleIntensityChange(100)}
          />
        </div>
        <div className="text-xs text-text-color-dimmed dark:text-dark-text-color-dimmed">
          {t(
            'settingsPage.dynamicThemeIntensityDesc',
            'Controls how strongly album artwork influences the theme.'
          )}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-text-color-dimmed dark:text-dark-text-color-dimmed whitespace-nowrap">
            {t('settingsPage.dynamicThemeIntensityPreset', 'Preset (0%)')}
          </span>
          <input
            type="range"
            name="dynamic-theme-intensity-slider"
            id="dynamic-theme-intensity-slider"
            aria-label={t('settingsPage.dynamicThemeIntensity', 'Dynamic Theme Intensity')}
            className="seek-bar-slider thumb-visible before:bg-font-color-highlight hover:before:bg-font-color-highlight dark:before:bg-font-color-highlight dark:hover:before:bg-dark-font-color-highlight relative float-left mx-1 h-6 w-full appearance-none bg-transparent p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-(--seek-before-width) before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
            min={0}
            step={5}
            max={100}
            value={dynamicThemeIntensity}
            onChange={(e) => handleIntensityChange(e.currentTarget.valueAsNumber)}
            style={intensitySliderStyle}
            title={`${dynamicThemeIntensity}%`}
          />
          <span className="text-xs text-text-color-dimmed dark:text-dark-text-color-dimmed whitespace-nowrap">
            {t('settingsPage.dynamicThemeIntensityArtwork', 'Artwork (100%)')}
          </span>
        </div>
      </div>

      {/* 3. Live Palette & Semantic Role Preview */}
      {semanticPalette && (
        <div className="mt-2 pt-4 border-t border-background-color-3/20 dark:border-dark-background-color-3/20 flex flex-col gap-3">
          <div className="text-xs font-semibold text-text-color-dimmed dark:text-dark-text-color-dimmed uppercase tracking-wider">
            {t('settingsPage.resolvedTones', 'Derived Semantic Tones')}
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-md bg-background-color-1/40 dark:bg-dark-background-color-1/40 text-center">
              <span
                className="h-7 w-full rounded-md shadow-2xs"
                style={{ backgroundColor: `hsl(${formatHsl(semanticPalette.primaryAccent)})` }}
              />
              <span className="text-[11px] font-medium text-text-color dark:text-dark-text-color">
                {t('settingsPage.primaryAccent', 'Primary Accent')}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-md bg-background-color-1/40 dark:bg-dark-background-color-1/40 text-center">
              <span
                className="h-7 w-full rounded-md shadow-2xs"
                style={{ backgroundColor: `hsl(${formatHsl(semanticPalette.secondaryAccent)})` }}
              />
              <span className="text-[11px] font-medium text-text-color dark:text-dark-text-color">
                {t('settingsPage.secondaryAccent', 'Secondary Accent')}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-md bg-background-color-1/40 dark:bg-dark-background-color-1/40 text-center">
              <span
                className="h-7 w-full rounded-md shadow-2xs"
                style={{ backgroundColor: `hsl(${formatHsl(semanticPalette.dark.backgroundBase)})` }}
              />
              <span className="text-[11px] font-medium text-text-color dark:text-dark-text-color">
                {t('settingsPage.darkCanvas', 'Dark Canvas')}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-2 rounded-md bg-background-color-1/40 dark:bg-dark-background-color-1/40 text-center">
              <span
                className="h-7 w-full rounded-md shadow-2xs"
                style={{ backgroundColor: `hsl(${formatHsl(semanticPalette.light.backgroundBase)})` }}
              />
              <span className="text-[11px] font-medium text-text-color dark:text-dark-text-color">
                {t('settingsPage.lightCanvas', 'Light Canvas')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicThemeSettings;
