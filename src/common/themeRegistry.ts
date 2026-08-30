export type ThemeModePolicy = 'light' | 'dark' | 'adaptive';

export type ThemeNameKey =
  | 'settingsPage.defaultThemePreset'
  | 'settingsPage.nordThemePreset'
  | 'settingsPage.emeraldThemePreset'
  | 'settingsPage.draculaThemePreset'
  | 'settingsPage.solarizedThemePreset'
  | 'settingsPage.monokaiThemePreset'
  | 'settingsPage.catppuccinThemePreset'
  | 'settingsPage.tokyonightThemePreset'
  | 'settingsPage.rosepineThemePreset'
  | 'settingsPage.gruvboxThemePreset'
  | 'settingsPage.synthwaveThemePreset'
  | 'settingsPage.cyberpunkThemePreset'
  | 'settingsPage.oceanicThemePreset'
  | 'settingsPage.midnightThemePreset'
  | 'settingsPage.linearThemePreset'
  | 'settingsPage.spotifyThemePreset';

export interface ThemeDefinition {
  id: string;
  nameKey: ThemeNameKey;
  mode: ThemeModePolicy;
  preview: {
    background: string;
    foreground: string;
    accent: string;
  };
}

export type ThemePreset =
  | 'default'
  | 'nord'
  | 'emerald'
  | 'dracula'
  | 'solarized'
  | 'monokai'
  | 'catppuccin'
  | 'tokyonight'
  | 'rosepine'
  | 'gruvbox'
  | 'synthwave'
  | 'cyberpunk'
  | 'oceanic'
  | 'midnight'
  | 'linear'
  | 'spotify';

export const themeRegistry: Record<ThemePreset, ThemeDefinition> = {
  default: {
    id: 'default',
    nameKey: 'settingsPage.defaultThemePreset',
    mode: 'adaptive',
    preview: { background: '#ffffff', foreground: '#f0f0f0', accent: '#44a3ff' }
  },
  nord: {
    id: 'nord',
    nameKey: 'settingsPage.nordThemePreset',
    mode: 'adaptive',
    preview: { background: '#eceff4', foreground: '#e5e9f0', accent: '#88c0d0' }
  },
  emerald: {
    id: 'emerald',
    nameKey: 'settingsPage.emeraldThemePreset',
    mode: 'adaptive',
    preview: { background: '#f8fafc', foreground: '#f1f5f9', accent: '#10b981' }
  },
  dracula: {
    id: 'dracula',
    nameKey: 'settingsPage.draculaThemePreset',
    mode: 'dark',
    preview: { background: '#282a36', foreground: '#44475a', accent: '#bd93f9' }
  },
  solarized: {
    id: 'solarized',
    nameKey: 'settingsPage.solarizedThemePreset',
    mode: 'adaptive',
    preview: { background: '#fdf6e3', foreground: '#eee8d5', accent: '#268bd2' }
  },
  monokai: {
    id: 'monokai',
    nameKey: 'settingsPage.monokaiThemePreset',
    mode: 'dark',
    preview: { background: '#272822', foreground: '#3e3d32', accent: '#f92672' }
  },
  catppuccin: {
    id: 'catppuccin',
    nameKey: 'settingsPage.catppuccinThemePreset',
    mode: 'adaptive',
    preview: { background: '#eff1f5', foreground: '#e6e9ef', accent: '#ca9ee6' }
  },
  tokyonight: {
    id: 'tokyonight',
    nameKey: 'settingsPage.tokyonightThemePreset',
    mode: 'dark',
    preview: { background: '#1a1b26', foreground: '#16161e', accent: '#7aa2f7' }
  },
  rosepine: {
    id: 'rosepine',
    nameKey: 'settingsPage.rosepineThemePreset',
    mode: 'dark',
    preview: { background: '#191724', foreground: '#1f1d2e', accent: '#ebbcba' }
  },
  gruvbox: {
    id: 'gruvbox',
    nameKey: 'settingsPage.gruvboxThemePreset',
    mode: 'adaptive',
    preview: { background: '#fbf1c7', foreground: '#ebdbb2', accent: '#cc241d' }
  },
  synthwave: {
    id: 'synthwave',
    nameKey: 'settingsPage.synthwaveThemePreset',
    mode: 'dark',
    preview: { background: '#262335', foreground: '#1f1b2e', accent: '#ff7edb' }
  },
  cyberpunk: {
    id: 'cyberpunk',
    nameKey: 'settingsPage.cyberpunkThemePreset',
    mode: 'dark',
    preview: { background: '#000000', foreground: '#0a0a0a', accent: '#fcee0a' }
  },
  oceanic: {
    id: 'oceanic',
    nameKey: 'settingsPage.oceanicThemePreset',
    mode: 'dark',
    preview: { background: '#1b2b34', foreground: '#16252d', accent: '#5fb3b3' }
  },
  midnight: {
    id: 'midnight',
    nameKey: 'settingsPage.midnightThemePreset',
    mode: 'dark',
    preview: { background: '#000000', foreground: '#0d0d0d', accent: '#4d4dff' }
  },
  linear: {
    id: 'linear',
    nameKey: 'settingsPage.linearThemePreset',
    mode: 'dark',
    preview: { background: '#0f1117', foreground: '#1b1f2a', accent: '#6366f1' }
  },
  spotify: {
    id: 'spotify',
    nameKey: 'settingsPage.spotifyThemePreset',
    mode: 'dark',
    preview: { background: '#121212', foreground: '#282828', accent: '#1db954' }
  }
};
