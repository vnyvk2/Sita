import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import {
  hexToHslString,
  hslStringToHex,
  PRESET_RAW_TOKENS,
  THEME_CUSTOMIZABLE_LAYERS,
  type ThemeLayerDescriptor,
  type ThemeTokenKey
} from '@renderer/utils/themeResolver';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { themeRegistry, type ThemePreset } from '../../../../../common/themeRegistry';

interface ThemeLayerInspectorProps {
  currentTheme: ThemePreset;
  isDark?: boolean;
  onClose?: () => void;
}

const ThemeLayerInspector = memo(function ThemeLayerInspector({
  currentTheme,
  isDark = true,
  onClose
}: ThemeLayerInspectorProps) {
  const { t } = useTranslation();

  const customThemeOverrides = useStore(
    store,
    (state) => state.localStorage.preferences?.customThemeOverrides
  );

  const presetMeta = themeRegistry[currentTheme] ?? themeRegistry.default;
  const rawTokens = PRESET_RAW_TOKENS[currentTheme] ?? PRESET_RAW_TOKENS.default;
  const currentOverrides = customThemeOverrides?.[currentTheme] ?? {};

  const handleColorChange = useCallback(
    (tokenKey: ThemeTokenKey, hexValue: string) => {
      const hslVal = hexToHslString(hexValue);
      const prevOverrides = storage.preferences.getPreferences('customThemeOverrides') ?? {};
      const presetOverrides = { ...(prevOverrides[currentTheme] ?? {}) };

      presetOverrides[tokenKey] = hslVal;

      const newOverrides = {
        ...prevOverrides,
        [currentTheme]: presetOverrides
      };

      storage.preferences.setPreferences('customThemeOverrides', newOverrides);
    },
    [currentTheme]
  );

  const handleResetPreset = useCallback(() => {
    const prevOverrides = storage.preferences.getPreferences('customThemeOverrides') ?? {};
    if (!prevOverrides[currentTheme]) return;

    const newOverrides = { ...prevOverrides };
    delete newOverrides[currentTheme];

    storage.preferences.setPreferences('customThemeOverrides', newOverrides);
  }, [currentTheme]);

  // Group layers by category
  const surfaceLayers = THEME_CUSTOMIZABLE_LAYERS.filter((l) => l.category === 'surfaces');
  const textLayers = THEME_CUSTOMIZABLE_LAYERS.filter((l) => l.category === 'text');
  const controlLayers = THEME_CUSTOMIZABLE_LAYERS.filter((l) => l.category === 'controls');

  const renderLayerRow = (layer: ThemeLayerDescriptor) => {
    const tokenKey = isDark ? layer.darkToken : layer.lightToken;
    const currentHsl = currentOverrides[tokenKey] ?? rawTokens[tokenKey] ?? '0 0% 50%';
    const hex = hslStringToHex(currentHsl);

    return (
      <div
        key={layer.key}
        className="bg-background-color-2/40 hover:bg-background-color-2/70 dark:bg-dark-background-color-2/40 dark:hover:bg-dark-background-color-2/70 border-background-color-3/30 dark:border-dark-background-color-3/30 flex items-center justify-between rounded-lg border p-2 transition-colors"
      >
        <div className="flex flex-col pr-2">
          <span className="text-font-color-black dark:text-font-color-white text-xs font-medium">
            {layer.name}
          </span>
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-mono text-[10px]">
            {tokenKey}
          </span>
        </div>

        <div className="bg-background-color-2/80 dark:bg-dark-background-color-2/80 border-background-color-3/50 dark:border-dark-background-color-3/50 flex items-center gap-1.5 rounded-md border px-2 py-1 shadow-xs">
          <input
            type="color"
            value={hex}
            onChange={(e) => handleColorChange(tokenKey, e.target.value)}
            className="h-5 w-5 cursor-pointer rounded-xs border-0 bg-transparent p-0"
            title={`Pick color for ${layer.name}`}
          />
          <span className="text-font-color-black/80 dark:text-font-color-white/80 font-mono text-[11px] font-semibold">
            {hex}
          </span>
        </div>
      </div>
    );
  };

  // Preview colors for miniature card
  const bg2Token = isDark ? '--dark-background-color-2' : '--background-color-2';
  const bg3Token = isDark ? '--dark-background-color-3' : '--background-color-3';
  const fontPrimaryToken = isDark ? '--dark-text-color' : '--text-color';
  const fontDimmedToken = isDark ? '--dark-text-color-dimmed' : '--text-color-dimmed';
  const highlightToken = isDark ? '--dark-text-color-highlight' : '--text-color-highlight';

  const previewBg2 = hslStringToHex(
    currentOverrides[bg2Token] ?? rawTokens[bg2Token] ?? '0 0% 12%'
  );
  const previewBg3 = hslStringToHex(
    currentOverrides[bg3Token] ?? rawTokens[bg3Token] ?? '0 0% 20%'
  );
  const previewFont = hslStringToHex(
    currentOverrides[fontPrimaryToken] ?? rawTokens[fontPrimaryToken] ?? '0 0% 95%'
  );
  const previewDimmed = hslStringToHex(
    currentOverrides[fontDimmedToken] ?? rawTokens[fontDimmedToken] ?? '0 0% 60%'
  );
  const previewHighlight = hslStringToHex(
    currentOverrides[highlightToken] ?? rawTokens[highlightToken] ?? '212 100% 63%'
  );

  return (
    <div className="bg-background-color-2/60 dark:bg-dark-background-color-2/60 border-background-color-3/50 dark:border-dark-background-color-3/50 flex w-full flex-col space-y-4 rounded-xl border p-4 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="border-background-color-3/40 dark:border-dark-background-color-3/40 flex items-center justify-between border-b pb-3">
        <div>
          <div className="text-font-color-highlight dark:text-dark-font-color-highlight flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <span className="material-icons-round text-base">tune</span>
            <span>Theme Layer Inspector</span>
          </div>
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
            {t(presetMeta.nameKey)} ({isDark ? 'Dark Mode' : 'Light Mode'})
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetPreset}
            className="bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            title="Reset this preset to default values"
          >
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-font-color-dimmed dark:text-dark-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white p-1 transition-colors"
              title="Close Inspector"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Layer Groups (Scrollable) */}
      <div className="max-h-[320px] space-y-3.5 overflow-y-auto pr-1">
        {/* Surface & Backgrounds */}
        <div className="space-y-1.5">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-semibold tracking-wider uppercase">
            Surfaces & Backgrounds
          </div>
          <div className="space-y-1.5">{surfaceLayers.map(renderLayerRow)}</div>
        </div>

        {/* Text & Accents */}
        <div className="space-y-1.5">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-semibold tracking-wider uppercase">
            Text & Accents
          </div>
          <div className="space-y-1.5">{textLayers.map(renderLayerRow)}</div>
        </div>

        {/* Controls & Sliders */}
        <div className="space-y-1.5">
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-semibold tracking-wider uppercase">
            Controls & Sliders
          </div>
          <div className="space-y-1.5">{controlLayers.map(renderLayerRow)}</div>
        </div>
      </div>

      {/* Live Mini Preview Box */}
      <div className="border-background-color-3/40 dark:border-dark-background-color-3/40 border-t pt-3">
        <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mb-2 text-[10px] font-semibold tracking-wider uppercase">
          Live Reactive Preview
        </div>
        <div
          className="space-y-2 rounded-lg border p-2.5 transition-colors"
          style={{ backgroundColor: previewBg2, borderColor: previewBg3 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold text-white shadow-xs"
                style={{ backgroundColor: previewHighlight }}
              >
                ♪
              </div>
              <div className="flex flex-col">
                <span
                  className="truncate text-xs leading-tight font-bold"
                  style={{ color: previewFont }}
                >
                  Now Playing Preview
                </span>
                <span className="text-[10px]" style={{ color: previewDimmed }}>
                  Nora Music Player
                </span>
              </div>
            </div>
            <span
              className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: previewBg3, color: previewHighlight }}
            >
              Active
            </span>
          </div>

          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: previewBg3 }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: '60%', backgroundColor: previewHighlight }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

ThemeLayerInspector.displayName = 'ThemeLayerInspector';
export default ThemeLayerInspector;
