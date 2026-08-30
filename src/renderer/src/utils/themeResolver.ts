import type { ThemePreset } from '../../../common/themeRegistry';
import {
  formatHsl,
  parseHslString,
  type HslColor,
  type SemanticDynamicPalette
} from './semanticPalette';

export type DynamicThemeMode = 'dynamic-accent' | 'full-dynamic';

export const THEME_TOKEN_KEYS = [
  '--background-color-1',
  '--background-color-2',
  '--background-color-3',
  '--background-color-dimmed',
  '--side-bar-background',
  '--text-color',
  '--text-color-dimmed',
  '--text-color-highlight',
  '--text-color-highlight-2',
  '--context-menu-background',
  '--context-menu-list-hover',
  '--seekbar-background-color',
  '--seekbar-track-background-color',
  '--foreground-color-1',
  '--dark-background-color-1',
  '--dark-background-color-2',
  '--dark-background-color-3',
  '--dark-background-color-dimmed',
  '--dark-side-bar-background',
  '--dark-text-color',
  '--dark-text-color-dimmed',
  '--dark-text-color-highlight',
  '--dark-text-color-highlight-2',
  '--dark-context-menu-background',
  '--dark-context-menu-list-hover',
  '--dark-seekbar-background-color',
  '--dark-seekbar-track-background-color',
  '--dark-foreground-color-1'
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];

export const ACCENT_TOKEN_KEYS = [
  '--text-color-highlight',
  '--text-color-highlight-2',
  '--seekbar-background-color',
  '--seekbar-track-background-color',
  '--background-color-3',
  '--foreground-color-1',
  '--dark-text-color-highlight',
  '--dark-text-color-highlight-2',
  '--dark-seekbar-background-color',
  '--dark-seekbar-track-background-color',
  '--dark-background-color-3',
  '--dark-foreground-color-1'
] as const;

export type AccentTokenKey = (typeof ACCENT_TOKEN_KEYS)[number];

export type ThemeTokens = Record<ThemeTokenKey, string>;

// Preset Raw Token Map matching styles.css exactly
export const PRESET_RAW_TOKENS: Record<ThemePreset, Record<ThemeTokenKey, string>> = {
  default: {
    '--background-color-1': '0 0% 100%',
    '--background-color-2': '212 48% 94%',
    '--background-color-3': '213 80% 88%',
    '--side-bar-background': '212 50% 94%',
    '--background-color-dimmed': '0 0% 30%',
    '--text-color': '0 0% 0%',
    '--text-color-dimmed': '0 0% 50%',
    '--text-color-highlight': '203 39% 44%',
    '--text-color-highlight-2': '247 74% 63%',
    '--context-menu-background': '0 0% 100%',
    '--context-menu-list-hover': '198 18% 89%',
    '--seekbar-background-color': '0 0% 20%',
    '--seekbar-track-background-color': '0 0% 80%',
    '--foreground-color-1': '247 74% 65%',
    '--dark-background-color-1': '228 7% 14%',
    '--dark-background-color-2': '225 8% 20%',
    '--dark-background-color-3': '213 80% 88%',
    '--dark-side-bar-background': '228 7% 20%',
    '--dark-text-color': '0 0% 100%',
    '--dark-text-color-dimmed': '0 0% 50%',
    '--dark-text-color-highlight': '213 80% 88%',
    '--dark-text-color-highlight-2': '244 98% 80%',
    '--dark-context-menu-background': '228 7% 14%',
    '--dark-context-menu-list-hover': '224 8% 28%',
    '--dark-seekbar-background-color': '240 1% 83%',
    '--dark-seekbar-track-background-color': '0 0% 25%',
    '--dark-background-color-dimmed': '228 7% 20%',
    '--dark-foreground-color-1': '244 98% 80%'
  },
  nord: {
    '--background-color-1': '220 16% 96%',
    '--background-color-2': '216 28% 90%',
    '--background-color-3': '193 48% 82%',
    '--side-bar-background': '216 28% 90%',
    '--background-color-dimmed': '220 16% 30%',
    '--text-color-highlight': '213 32% 42%',
    '--text-color-highlight-2': '193 43% 50%',
    '--context-menu-background': '220 16% 96%',
    '--context-menu-list-hover': '213 32% 85%',
    '--seekbar-background-color': '213 32% 35%',
    '--seekbar-track-background-color': '216 28% 80%',
    '--foreground-color-1': '193 43% 50%',
    '--text-color': '220 26% 14%',
    '--text-color-dimmed': '220 16% 30%',
    '--dark-background-color-1': '220 26% 14%',
    '--dark-background-color-2': '220 16% 22%',
    '--dark-background-color-3': '193 43% 50%',
    '--dark-side-bar-background': '220 16% 22%',
    '--dark-text-color-highlight': '193 43% 67%',
    '--dark-text-color-highlight-2': '193 48% 78%',
    '--dark-context-menu-background': '220 26% 14%',
    '--dark-context-menu-list-hover': '220 16% 28%',
    '--dark-seekbar-background-color': '193 43% 75%',
    '--dark-seekbar-track-background-color': '220 26% 28%',
    '--dark-background-color-dimmed': '220 16% 28%',
    '--dark-text-color': '220 16% 96%',
    '--dark-text-color-dimmed': '216 28% 80%',
    '--dark-foreground-color-1': '193 43% 67%'
  },
  emerald: {
    '--background-color-1': '150 20% 97%',
    '--background-color-2': '152 24% 91%',
    '--background-color-3': '158 55% 82%',
    '--side-bar-background': '152 24% 91%',
    '--background-color-dimmed': '165 20% 30%',
    '--text-color-highlight': '160 84% 30%',
    '--text-color-highlight-2': '158 64% 42%',
    '--context-menu-background': '150 20% 97%',
    '--context-menu-list-hover': '152 24% 84%',
    '--seekbar-background-color': '160 84% 25%',
    '--seekbar-track-background-color': '152 24% 80%',
    '--foreground-color-1': '158 64% 42%',
    '--text-color': '165 25% 10%',
    '--text-color-dimmed': '165 20% 30%',
    '--dark-background-color-1': '165 25% 10%',
    '--dark-background-color-2': '165 20% 16%',
    '--dark-background-color-3': '158 64% 45%',
    '--dark-side-bar-background': '165 20% 16%',
    '--dark-text-color-highlight': '158 64% 55%',
    '--dark-text-color-highlight-2': '158 70% 70%',
    '--dark-context-menu-background': '165 25% 10%',
    '--dark-context-menu-list-hover': '165 20% 22%',
    '--dark-seekbar-background-color': '158 64% 75%',
    '--dark-seekbar-track-background-color': '165 25% 20%',
    '--dark-background-color-dimmed': '165 20% 24%',
    '--dark-text-color': '150 20% 97%',
    '--dark-text-color-dimmed': '152 24% 80%',
    '--dark-foreground-color-1': '158 64% 55%'
  },
  dracula: {
    '--background-color-1': '260 20% 97%',
    '--background-color-2': '260 20% 92%',
    '--background-color-3': '265 60% 86%',
    '--side-bar-background': '260 20% 92%',
    '--background-color-dimmed': '265 20% 30%',
    '--text-color-highlight': '265 60% 45%',
    '--text-color-highlight-2': '265 75% 55%',
    '--context-menu-background': '260 20% 97%',
    '--context-menu-list-hover': '260 20% 86%',
    '--seekbar-background-color': '265 60% 35%',
    '--seekbar-track-background-color': '260 20% 82%',
    '--foreground-color-1': '265 75% 55%',
    '--text-color': '231 15% 14%',
    '--text-color-dimmed': '265 20% 30%',
    '--dark-background-color-1': '231 15% 14%',
    '--dark-background-color-2': '232 14% 20%',
    '--dark-background-color-3': '265 75% 65%',
    '--dark-side-bar-background': '232 14% 20%',
    '--dark-text-color-highlight': '265 89% 75%',
    '--dark-text-color-highlight-2': '265 95% 82%',
    '--dark-context-menu-background': '231 15% 14%',
    '--dark-context-menu-list-hover': '232 14% 26%',
    '--dark-seekbar-background-color': '265 89% 82%',
    '--dark-seekbar-track-background-color': '232 14% 28%',
    '--dark-background-color-dimmed': '232 14% 26%',
    '--dark-text-color': '260 20% 97%',
    '--dark-text-color-dimmed': '260 20% 80%',
    '--dark-foreground-color-1': '265 89% 75%'
  },
  solarized: {
    '--background-color-1': '44 87% 94%',
    '--background-color-2': '44 74% 89%',
    '--background-color-3': '45 45% 75%',
    '--side-bar-background': '44 74% 89%',
    '--background-color-dimmed': '45 45% 75%',
    '--text-color-highlight': '205 69% 41%',
    '--text-color-highlight-2': '175 59% 40%',
    '--context-menu-background': '44 87% 94%',
    '--context-menu-list-hover': '44 74% 89%',
    '--seekbar-background-color': '205 69% 41%',
    '--seekbar-track-background-color': '45 45% 75%',
    '--foreground-color-1': '175 59% 40%',
    '--text-color': '192 100% 11%',
    '--text-color-dimmed': '192 81% 14%',
    '--dark-background-color-1': '192 100% 11%',
    '--dark-background-color-2': '192 81% 14%',
    '--dark-background-color-3': '192 65% 20%',
    '--dark-side-bar-background': '192 81% 14%',
    '--dark-text-color-highlight': '205 69% 41%',
    '--dark-text-color-highlight-2': '175 59% 40%',
    '--dark-context-menu-background': '192 100% 11%',
    '--dark-context-menu-list-hover': '192 81% 14%',
    '--dark-seekbar-background-color': '205 69% 41%',
    '--dark-seekbar-track-background-color': '192 65% 20%',
    '--dark-background-color-dimmed': '192 81% 14%',
    '--dark-text-color': '44 87% 94%',
    '--dark-text-color-dimmed': '44 74% 89%',
    '--dark-foreground-color-1': '205 69% 41%'
  },
  monokai: {
    '--background-color-1': '70 8% 15%',
    '--background-color-2': '70 8% 20%',
    '--background-color-3': '70 8% 25%',
    '--side-bar-background': '70 8% 20%',
    '--background-color-dimmed': '70 8% 25%',
    '--text-color-highlight': '338 95% 56%',
    '--text-color-highlight-2': '190 81% 67%',
    '--context-menu-background': '70 8% 15%',
    '--context-menu-list-hover': '70 8% 25%',
    '--seekbar-background-color': '338 95% 56%',
    '--seekbar-track-background-color': '70 8% 25%',
    '--foreground-color-1': '190 81% 67%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '70 8% 15%',
    '--dark-background-color-2': '70 8% 20%',
    '--dark-background-color-3': '70 8% 25%',
    '--dark-side-bar-background': '70 8% 20%',
    '--dark-text-color-highlight': '338 95% 56%',
    '--dark-text-color-highlight-2': '190 81% 67%',
    '--dark-context-menu-background': '70 8% 15%',
    '--dark-context-menu-list-hover': '70 8% 25%',
    '--dark-seekbar-background-color': '338 95% 56%',
    '--dark-seekbar-track-background-color': '70 8% 25%',
    '--dark-background-color-dimmed': '70 8% 20%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '338 95% 56%'
  },
  catppuccin: {
    '--background-color-1': '220 23% 95%',
    '--background-color-2': '220 23% 92%',
    '--background-color-3': '220 23% 85%',
    '--side-bar-background': '220 23% 92%',
    '--background-color-dimmed': '220 23% 85%',
    '--text-color-highlight': '266 85% 58%',
    '--text-color-highlight-2': '316 73% 65%',
    '--context-menu-background': '220 23% 95%',
    '--context-menu-list-hover': '220 23% 85%',
    '--seekbar-background-color': '266 85% 58%',
    '--seekbar-track-background-color': '220 23% 85%',
    '--foreground-color-1': '316 73% 65%',
    '--text-color': '240 21% 15%',
    '--text-color-dimmed': '240 21% 12%',
    '--dark-background-color-1': '240 21% 15%',
    '--dark-background-color-2': '240 21% 12%',
    '--dark-background-color-3': '240 21% 20%',
    '--dark-side-bar-background': '240 21% 12%',
    '--dark-text-color-highlight': '266 85% 75%',
    '--dark-text-color-highlight-2': '316 73% 75%',
    '--dark-context-menu-background': '240 21% 15%',
    '--dark-context-menu-list-hover': '240 21% 20%',
    '--dark-seekbar-background-color': '266 85% 75%',
    '--dark-seekbar-track-background-color': '240 21% 20%',
    '--dark-background-color-dimmed': '240 21% 12%',
    '--dark-text-color': '220 23% 95%',
    '--dark-text-color-dimmed': '220 23% 92%',
    '--dark-foreground-color-1': '266 85% 75%'
  },
  tokyonight: {
    '--background-color-1': '235 19% 13%',
    '--background-color-2': '235 19% 10%',
    '--background-color-3': '235 19% 18%',
    '--side-bar-background': '235 19% 10%',
    '--background-color-dimmed': '235 19% 18%',
    '--text-color-highlight': '250 85% 65%',
    '--text-color-highlight-2': '190 70% 55%',
    '--context-menu-background': '235 19% 13%',
    '--context-menu-list-hover': '235 19% 18%',
    '--seekbar-background-color': '250 85% 65%',
    '--seekbar-track-background-color': '235 19% 18%',
    '--foreground-color-1': '190 70% 55%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '235 19% 13%',
    '--dark-background-color-2': '235 19% 10%',
    '--dark-background-color-3': '235 19% 18%',
    '--dark-side-bar-background': '235 19% 10%',
    '--dark-text-color-highlight': '250 85% 65%',
    '--dark-text-color-highlight-2': '190 70% 55%',
    '--dark-context-menu-background': '235 19% 13%',
    '--dark-context-menu-list-hover': '235 19% 18%',
    '--dark-seekbar-background-color': '250 85% 65%',
    '--dark-seekbar-track-background-color': '235 19% 18%',
    '--dark-background-color-dimmed': '235 19% 10%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '250 85% 65%'
  },
  rosepine: {
    '--background-color-1': '249 22% 12%',
    '--background-color-2': '249 22% 9%',
    '--background-color-3': '249 22% 17%',
    '--side-bar-background': '249 22% 9%',
    '--background-color-dimmed': '249 22% 17%',
    '--text-color-highlight': '343 35% 69%',
    '--text-color-highlight-2': '318 43% 66%',
    '--context-menu-background': '249 22% 12%',
    '--context-menu-list-hover': '249 22% 17%',
    '--seekbar-background-color': '343 35% 69%',
    '--seekbar-track-background-color': '249 22% 17%',
    '--foreground-color-1': '318 43% 66%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '249 22% 12%',
    '--dark-background-color-2': '249 22% 9%',
    '--dark-background-color-3': '249 22% 17%',
    '--dark-side-bar-background': '249 22% 9%',
    '--dark-text-color-highlight': '343 35% 69%',
    '--dark-text-color-highlight-2': '318 43% 66%',
    '--dark-context-menu-background': '249 22% 12%',
    '--dark-context-menu-list-hover': '249 22% 17%',
    '--dark-seekbar-background-color': '343 35% 69%',
    '--dark-seekbar-track-background-color': '249 22% 17%',
    '--dark-background-color-dimmed': '249 22% 9%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '343 35% 69%'
  },
  gruvbox: {
    '--background-color-1': '49 32% 89%',
    '--background-color-2': '48 37% 83%',
    '--background-color-3': '47 43% 76%',
    '--side-bar-background': '48 37% 83%',
    '--background-color-dimmed': '47 43% 76%',
    '--text-color-highlight': '9 72% 43%',
    '--text-color-highlight-2': '67 43% 40%',
    '--context-menu-background': '49 32% 89%',
    '--context-menu-list-hover': '47 43% 76%',
    '--seekbar-background-color': '9 72% 43%',
    '--seekbar-track-background-color': '47 43% 76%',
    '--foreground-color-1': '67 43% 40%',
    '--text-color': '233 13% 16%',
    '--text-color-dimmed': '233 13% 13%',
    '--dark-background-color-1': '233 13% 16%',
    '--dark-background-color-2': '233 13% 13%',
    '--dark-background-color-3': '233 13% 21%',
    '--dark-side-bar-background': '233 13% 13%',
    '--dark-text-color-highlight': '9 84% 63%',
    '--dark-text-color-highlight-2': '67 74% 60%',
    '--dark-context-menu-background': '233 13% 16%',
    '--dark-context-menu-list-hover': '233 13% 21%',
    '--dark-seekbar-background-color': '9 84% 63%',
    '--dark-seekbar-track-background-color': '233 13% 21%',
    '--dark-background-color-dimmed': '233 13% 13%',
    '--dark-text-color': '49 32% 89%',
    '--dark-text-color-dimmed': '48 37% 83%',
    '--dark-foreground-color-1': '9 84% 63%'
  },
  synthwave: {
    '--background-color-1': '259 34% 15%',
    '--background-color-2': '259 34% 12%',
    '--background-color-3': '259 34% 20%',
    '--side-bar-background': '259 34% 12%',
    '--background-color-dimmed': '259 34% 20%',
    '--text-color-highlight': '320 85% 65%',
    '--text-color-highlight-2': '185 85% 55%',
    '--context-menu-background': '259 34% 15%',
    '--context-menu-list-hover': '259 34% 20%',
    '--seekbar-background-color': '320 85% 65%',
    '--seekbar-track-background-color': '259 34% 20%',
    '--foreground-color-1': '185 85% 55%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '259 34% 15%',
    '--dark-background-color-2': '259 34% 12%',
    '--dark-background-color-3': '259 34% 20%',
    '--dark-side-bar-background': '259 34% 12%',
    '--dark-text-color-highlight': '320 85% 65%',
    '--dark-text-color-highlight-2': '185 85% 55%',
    '--dark-context-menu-background': '259 34% 15%',
    '--dark-context-menu-list-hover': '259 34% 20%',
    '--dark-seekbar-background-color': '320 85% 65%',
    '--dark-seekbar-track-background-color': '259 34% 20%',
    '--dark-background-color-dimmed': '259 34% 12%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '320 85% 65%'
  },
  cyberpunk: {
    '--background-color-1': '240 100% 5%',
    '--background-color-2': '240 100% 3%',
    '--background-color-3': '240 100% 10%',
    '--side-bar-background': '240 100% 3%',
    '--background-color-dimmed': '240 100% 10%',
    '--text-color-highlight': '52 100% 50%',
    '--text-color-highlight-2': '180 100% 50%',
    '--context-menu-background': '240 100% 5%',
    '--context-menu-list-hover': '240 100% 10%',
    '--seekbar-background-color': '52 100% 50%',
    '--seekbar-track-background-color': '240 100% 15%',
    '--foreground-color-1': '180 100% 50%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '240 100% 5%',
    '--dark-background-color-2': '240 100% 3%',
    '--dark-background-color-3': '240 100% 10%',
    '--dark-side-bar-background': '240 100% 3%',
    '--dark-text-color-highlight': '52 100% 50%',
    '--dark-text-color-highlight-2': '180 100% 50%',
    '--dark-context-menu-background': '240 100% 5%',
    '--dark-context-menu-list-hover': '240 100% 10%',
    '--dark-seekbar-background-color': '52 100% 50%',
    '--dark-seekbar-track-background-color': '240 100% 15%',
    '--dark-background-color-dimmed': '240 100% 3%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '52 100% 50%'
  },
  oceanic: {
    '--background-color-1': '200 40% 15%',
    '--background-color-2': '200 40% 12%',
    '--background-color-3': '200 40% 20%',
    '--side-bar-background': '200 40% 12%',
    '--background-color-dimmed': '200 40% 20%',
    '--text-color-highlight': '180 60% 50%',
    '--text-color-highlight-2': '210 60% 60%',
    '--context-menu-background': '200 40% 15%',
    '--context-menu-list-hover': '200 40% 20%',
    '--seekbar-background-color': '180 60% 50%',
    '--seekbar-track-background-color': '200 40% 20%',
    '--foreground-color-1': '210 60% 60%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '200 40% 15%',
    '--dark-background-color-2': '200 40% 12%',
    '--dark-background-color-3': '200 40% 20%',
    '--dark-side-bar-background': '200 40% 12%',
    '--dark-text-color-highlight': '180 60% 50%',
    '--dark-text-color-highlight-2': '210 60% 60%',
    '--dark-context-menu-background': '200 40% 15%',
    '--dark-context-menu-list-hover': '200 40% 20%',
    '--dark-seekbar-background-color': '180 60% 50%',
    '--dark-seekbar-track-background-color': '200 40% 20%',
    '--dark-background-color-dimmed': '200 40% 12%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '180 60% 50%'
  },
  midnight: {
    '--background-color-1': '0 0% 0%',
    '--background-color-2': '0 0% 5%',
    '--background-color-3': '0 0% 10%',
    '--side-bar-background': '0 0% 5%',
    '--background-color-dimmed': '0 0% 10%',
    '--text-color-highlight': '215 100% 65%',
    '--text-color-highlight-2': '280 100% 70%',
    '--context-menu-background': '0 0% 5%',
    '--context-menu-list-hover': '0 0% 12%',
    '--seekbar-background-color': '215 100% 65%',
    '--seekbar-track-background-color': '0 0% 15%',
    '--foreground-color-1': '280 100% 70%',
    '--text-color': '0 0% 95%',
    '--text-color-dimmed': '0 0% 75%',
    '--dark-background-color-1': '0 0% 0%',
    '--dark-background-color-2': '0 0% 5%',
    '--dark-background-color-3': '0 0% 10%',
    '--dark-side-bar-background': '0 0% 5%',
    '--dark-text-color-highlight': '215 100% 65%',
    '--dark-text-color-highlight-2': '280 100% 70%',
    '--dark-context-menu-background': '0 0% 5%',
    '--dark-context-menu-list-hover': '0 0% 12%',
    '--dark-seekbar-background-color': '215 100% 65%',
    '--dark-seekbar-track-background-color': '0 0% 15%',
    '--dark-background-color-dimmed': '0 0% 5%',
    '--dark-text-color': '0 0% 95%',
    '--dark-text-color-dimmed': '0 0% 75%',
    '--dark-foreground-color-1': '215 100% 65%'
  },
  linear: {
    '--background-color-1': '225 21% 7%',
    '--background-color-2': '225 22% 11%',
    '--background-color-3': '223 22% 14%',
    '--side-bar-background': '225 22% 11%',
    '--background-color-dimmed': '225 22% 11%',
    '--text-color-highlight': '239 84% 67%',
    '--text-color-highlight-2': '199 89% 60%',
    '--context-menu-background': '225 22% 11%',
    '--context-menu-list-hover': '222 21% 21%',
    '--seekbar-background-color': '239 84% 67%',
    '--seekbar-track-background-color': '222 21% 21%',
    '--foreground-color-1': '239 84% 67%',
    '--text-color': '220 17% 96%',
    '--text-color-dimmed': '219 14% 69%',
    '--dark-background-color-1': '225 21% 7%',
    '--dark-background-color-2': '225 22% 11%',
    '--dark-background-color-3': '223 22% 14%',
    '--dark-side-bar-background': '225 22% 11%',
    '--dark-text-color-highlight': '239 84% 67%',
    '--dark-text-color-highlight-2': '199 89% 60%',
    '--dark-context-menu-background': '225 22% 11%',
    '--dark-context-menu-list-hover': '222 21% 21%',
    '--dark-seekbar-background-color': '239 84% 67%',
    '--dark-seekbar-track-background-color': '222 21% 21%',
    '--dark-background-color-dimmed': '225 22% 11%',
    '--dark-text-color': '220 17% 96%',
    '--dark-text-color-dimmed': '219 14% 69%',
    '--dark-foreground-color-1': '239 84% 67%'
  },
  spotify: {
    '--background-color-1': '0 0% 7%',
    '--background-color-2': '0 0% 9%',
    '--background-color-3': '0 0% 16%',
    '--side-bar-background': '0 0% 7%',
    '--background-color-dimmed': '0 0% 9%',
    '--text-color-highlight': '141 73% 42%',
    '--text-color-highlight-2': '141 76% 48%',
    '--context-menu-background': '0 0% 16%',
    '--context-menu-list-hover': '0 0% 23%',
    '--seekbar-background-color': '141 73% 42%',
    '--seekbar-track-background-color': '0 0% 23%',
    '--foreground-color-1': '141 73% 42%',
    '--text-color': '0 0% 100%',
    '--text-color-dimmed': '0 0% 70%',
    '--dark-background-color-1': '0 0% 7%',
    '--dark-background-color-2': '0 0% 9%',
    '--dark-background-color-3': '0 0% 16%',
    '--dark-side-bar-background': '0 0% 7%',
    '--dark-text-color-highlight': '141 73% 42%',
    '--dark-text-color-highlight-2': '141 76% 48%',
    '--dark-context-menu-background': '0 0% 16%',
    '--dark-context-menu-list-hover': '0 0% 23%',
    '--dark-seekbar-background-color': '141 73% 42%',
    '--dark-seekbar-track-background-color': '0 0% 23%',
    '--dark-background-color-dimmed': '0 0% 9%',
    '--dark-text-color': '0 0% 100%',
    '--dark-text-color-dimmed': '0 0% 70%',
    '--dark-foreground-color-1': '141 73% 42%'
  }
};

export function interpolateHsl(from: HslColor, to: HslColor, intensity: number): HslColor {
  const t = Math.min(1, Math.max(0, intensity / 100));
  if (t <= 0) return { ...from };
  if (t >= 1) return { ...to };

  // Shortest angular hue distance
  const diffH = ((((to.h - from.h) % 360) + 540) % 360) - 180;
  const h = Math.round((((from.h + diffH * t) % 360) + 360) % 360);
  const s = Math.round(from.s + (to.s - from.s) * t);
  const l = Math.round(from.l + (to.l - from.l) * t);

  return { h, s, l };
}

export function buildDynamicTokens(
  palette: SemanticDynamicPalette
): Record<ThemeTokenKey, HslColor> {
  return {
    // Light Surfaces & Accents
    '--background-color-1': palette.light.backgroundBase,
    '--background-color-2': palette.light.surfaceBase,
    '--background-color-3': palette.accentContainer,
    '--background-color-dimmed': {
      h: palette.light.backgroundBase.h,
      s: palette.light.backgroundBase.s,
      l: 75
    },
    '--side-bar-background': palette.light.sidebar,
    '--text-color': palette.light.textPrimary,
    '--text-color-dimmed': palette.light.textMuted,
    '--text-color-highlight': palette.primaryAccent,
    '--text-color-highlight-2': palette.secondaryAccent,
    '--context-menu-background': palette.light.surfaceElevated,
    '--context-menu-list-hover': palette.light.surfaceBase,
    '--seekbar-background-color': palette.primaryAccent,
    '--seekbar-track-background-color': palette.light.seekbarTrack,
    '--foreground-color-1': palette.secondaryAccent,

    // Dark Surfaces & Accents
    '--dark-background-color-1': palette.dark.backgroundBase,
    '--dark-background-color-2': palette.dark.surfaceBase,
    '--dark-background-color-3': palette.primaryAccent,
    '--dark-background-color-dimmed': {
      h: palette.dark.backgroundBase.h,
      s: palette.dark.backgroundBase.s,
      l: 20
    },
    '--dark-side-bar-background': palette.dark.sidebar,
    '--dark-text-color': palette.dark.textPrimary,
    '--dark-text-color-dimmed': palette.dark.textMuted,
    '--dark-text-color-highlight': palette.primaryAccent,
    '--dark-text-color-highlight-2': palette.secondaryAccent,
    '--dark-context-menu-background': palette.dark.surfaceElevated,
    '--dark-context-menu-list-hover': {
      h: palette.dark.surfaceElevated.h,
      s: palette.dark.surfaceElevated.s,
      l: 28
    },
    '--dark-seekbar-background-color': palette.primaryAccent,
    '--dark-seekbar-track-background-color': palette.dark.seekbarTrack,
    '--dark-foreground-color-1': palette.primaryAccent
  };
}

export interface ResolveThemeOptions {
  preset?: ThemePreset;
  palette?: SemanticDynamicPalette;
  mode?: DynamicThemeMode;
  intensity?: number;
}

export function resolveTheme(options: ResolveThemeOptions): ThemeTokens {
  const presetKey = options.preset ?? 'default';
  const rawPreset = PRESET_RAW_TOKENS[presetKey] ?? PRESET_RAW_TOKENS.default;
  const mode = options.mode ?? 'dynamic-accent';
  const intensity = options.intensity ?? 100;
  const palette = options.palette;

  // 1. Missing Palette or 0% Intensity -> Return Preset directly
  if (!palette || intensity <= 0) {
    const result = {} as ThemeTokens;
    for (const key of THEME_TOKEN_KEYS) {
      result[key] = rawPreset[key];
    }
    return result;
  }

  const dynamicHslTokens = buildDynamicTokens(palette);
  const accentKeySet = new Set<string>(ACCENT_TOKEN_KEYS);

  // 2. Full Dynamic Mode -> All 28 tokens dynamically blended
  if (mode === 'full-dynamic') {
    const result = {} as ThemeTokens;
    for (const key of THEME_TOKEN_KEYS) {
      const presetHsl = parseHslString(rawPreset[key]);
      const dynamicHsl = dynamicHslTokens[key];
      const blendedHsl = interpolateHsl(presetHsl, dynamicHsl, intensity);
      result[key] = formatHsl(blendedHsl);
    }
    return result;
  }

  // 3. Dynamic Accent Mode -> Exactly 12 accent tokens dynamically blended, 16 preset tokens retained
  const result = {} as ThemeTokens;
  for (const key of THEME_TOKEN_KEYS) {
    if (accentKeySet.has(key)) {
      const presetHsl = parseHslString(rawPreset[key]);
      const dynamicHsl = dynamicHslTokens[key];
      const blendedHsl = interpolateHsl(presetHsl, dynamicHsl, intensity);
      result[key] = formatHsl(blendedHsl);
    } else {
      result[key] = rawPreset[key];
    }
  }

  return result;
}
