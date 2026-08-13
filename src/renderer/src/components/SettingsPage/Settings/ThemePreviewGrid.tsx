import { useTranslation } from 'react-i18next';

interface ThemePreviewGridProps {
  currentTheme: ThemePreset;
  onThemeChange: (theme: ThemePreset) => void;
}

import { themeRegistry, type ThemePreset } from '../../../../../common/themeRegistry';

const themeData = Object.values(themeRegistry);

const ThemePreviewGrid = ({ currentTheme, onThemeChange }: ThemePreviewGridProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-6 grid w-full grid-cols-2 gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {themeData.map((theme) => {
        const isSelected = currentTheme === theme.id;
        
        return (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id as ThemePreset)}
            className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 transition-all duration-200 ${
              isSelected 
                ? 'border-font-color-highlight dark:border-dark-font-color-highlight scale-[1.02] shadow-lg' 
                : 'border-background-color-3/50 hover:border-background-color-3 dark:border-dark-background-color-3/50 dark:hover:border-dark-background-color-3 hover:scale-[1.01]'
            }`}
            aria-pressed={isSelected}
            title={t(theme.nameKey)}
          >
            {/* Preview Swatch Area */}
            <div 
              className="relative h-20 w-full p-3"
              style={{ backgroundColor: theme.preview.background }}
            >
              {/* Fake UI elements to show theme colors */}
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                  <div className="h-2 w-16 rounded-md opacity-60" style={{ backgroundColor: theme.preview.foreground }} />
                </div>
                
                <div className="space-y-1.5">
                  <div className="h-1.5 w-3/4 rounded-md opacity-40" style={{ backgroundColor: theme.preview.foreground }} />
                  <div className="h-1.5 w-1/2 rounded-md opacity-40" style={{ backgroundColor: theme.preview.foreground }} />
                </div>
              </div>
              
              {/* Checkmark overlay for selected state */}
              {isSelected && (
                <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-font-color-highlight dark:bg-dark-font-color-highlight shadow-sm">
                  <span className="material-icons-round-outlined text-[14px] text-white">check</span>
                </div>
              )}
            </div>
            
            {/* Label Area */}
            <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 border-background-color-3/30 dark:border-dark-background-color-3/30 w-full border-t px-3 py-2 text-left">
              <span className={`text-sm font-medium ${isSelected ? 'text-font-color-highlight dark:text-dark-font-color-highlight' : 'text-font-color dark:text-dark-font-color'}`}>
                {t(theme.nameKey)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ThemePreviewGrid;
