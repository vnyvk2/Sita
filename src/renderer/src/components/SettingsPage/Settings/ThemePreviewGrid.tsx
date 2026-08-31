import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { themeRegistry, type ThemePreset } from '../../../../../common/themeRegistry';
import { useEffectiveAppearance } from '../../../hooks/useEffectiveAppearance';
import ThemeLayerInspector from './ThemeLayerInspector';

interface ThemePreviewGridProps {
  currentTheme: ThemePreset;
  onThemeChange: (theme: ThemePreset) => void;
}

const themeData = Object.values(themeRegistry);

const ThemePreviewGrid = memo(function ThemePreviewGrid({
  currentTheme,
  onThemeChange
}: ThemePreviewGridProps) {
  const { t } = useTranslation();
  const { isDark } = useEffectiveAppearance();
  const [showInspector, setShowInspector] = useState(false);

  return (
    <div className="mt-4 flex flex-col space-y-4">
      {/* Controls Bar */}
      <div className="flex items-center justify-between">
        <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-medium">
          {t('settingsPage.availableThemes', {
            count: themeData.length,
            defaultValue: 'Available Presets ({{count}})',
            replace: { count: themeData.length }
          })}
        </span>
        <button
          type="button"
          onClick={() => setShowInspector((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            showInspector
              ? 'bg-font-color-highlight/20 text-font-color-highlight dark:bg-dark-font-color-highlight/20 dark:text-dark-font-color-highlight border-font-color-highlight/40 dark:border-dark-font-color-highlight/40 border'
              : 'bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 text-font-color-black dark:text-font-color-white'
          }`}
        >
          <span className="material-icons-round text-sm">tune</span>
          <span>{showInspector ? 'Hide Layer Inspector' : 'Customize Layers'}</span>
        </button>
      </div>

      {/* Grid & Inspector Container */}
      <div
        className={`grid w-full items-start gap-5 ${showInspector ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}
      >
        {/* Compact Theme Cards Grid */}
        <div
          className={`${
            showInspector
              ? 'grid max-h-[540px] grid-cols-2 gap-3 overflow-y-auto pr-1.5 lg:col-span-7'
              : 'col-span-full grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          }`}
        >
          {themeData.map((theme) => {
            const isSelected = currentTheme === theme.id;

            return (
              <button
                type="button"
                key={theme.id}
                onClick={() => onThemeChange(theme.id as ThemePreset)}
                className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-font-color-highlight dark:border-dark-font-color-highlight ring-font-color-highlight/20 dark:ring-dark-font-color-highlight/20 scale-[1.02] shadow-md ring-2'
                    : 'border-background-color-3/40 hover:border-background-color-3 dark:border-dark-background-color-3/40 dark:hover:border-dark-background-color-3 hover:scale-[1.01]'
                }`}
                aria-pressed={isSelected}
                title={t(theme.nameKey)}
              >
                {/* Compact Swatch Area */}
                <div
                  className="relative h-14 w-full p-2.5 transition-colors"
                  style={{ backgroundColor: theme.preview.background }}
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center space-x-1.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full shadow-xs"
                        style={{ backgroundColor: theme.preview.accent }}
                      />
                      <div
                        className="h-1.5 w-12 rounded-sm opacity-60"
                        style={{ backgroundColor: theme.preview.foreground }}
                      />
                    </div>

                    <div className="space-y-1">
                      <div
                        className="h-1 w-2/3 rounded-xs opacity-40"
                        style={{ backgroundColor: theme.preview.foreground }}
                      />
                    </div>
                  </div>

                  {/* Selected checkmark */}
                  {isSelected && (
                    <div className="bg-font-color-highlight dark:bg-dark-font-color-highlight absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full shadow-xs">
                      <span className="material-icons-round text-[11px] text-white">check</span>
                    </div>
                  )}
                </div>

                {/* Compact Label */}
                <div className="bg-background-color-2/70 dark:bg-dark-background-color-2/70 border-background-color-3/30 dark:border-dark-background-color-3/30 flex w-full items-center justify-between border-t px-2.5 py-1.5">
                  <span
                    className={`truncate text-xs font-medium ${
                      isSelected
                        ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-semibold'
                        : 'text-font-color-black dark:text-font-color-white'
                    }`}
                  >
                    {t(theme.nameKey)}
                  </span>
                  {isSelected && (
                    <span className="text-font-color-highlight dark:text-dark-font-color-highlight text-[10px] font-medium opacity-80">
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Layer Inspector Box */}
        {showInspector && (
          <div className="lg:col-span-5">
            <ThemeLayerInspector
              currentTheme={currentTheme}
              isDark={isDark}
              onClose={() => setShowInspector(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
});

ThemePreviewGrid.displayName = 'ThemePreviewGrid';
export default ThemePreviewGrid;
