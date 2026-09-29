import type { SettingsSectionKey } from './Settings/SettingsCollapseContext';

export interface SettingCatalogEntry {
  /** DOM element id targeted for scrollIntoView and spotlight pulse */
  id: string;
  /** Section key indicating which collapsible section owns this setting */
  sectionKey: SettingsSectionKey;
  /** i18n key for the title */
  titleKey: string;
  /** Default English title if translation is missing */
  defaultTitle: string;
  /** Optional i18n key for the description */
  descriptionKey?: string;
  /** Default English description */
  defaultDescription?: string;
  /** Universal keywords/aliases (brand names, tech acronyms, synonyms) */
  keywords: string[];
}

export interface SectionMeta {
  titleKey: string;
  defaultTitle: string;
}

export const SECTION_METADATA: Record<SettingsSectionKey, SectionMeta> = {
  appearance: { titleKey: 'settingsPage.appearance', defaultTitle: 'Appearance' },
  language: { titleKey: 'settingsPage.language', defaultTitle: 'Language' },
  audioPlayback: { titleKey: 'settingsPage.audioPlayback', defaultTitle: 'Audio Playback' },
  accounts: { titleKey: 'settingsPage.accounts', defaultTitle: 'Accounts & Integrations' },
  lyrics: { titleKey: 'settingsPage.lyrics', defaultTitle: 'Lyrics' },
  equalizer: { titleKey: 'settingsPage.equalizer', defaultTitle: 'Equalizer' },
  defaultPage: { titleKey: 'settingsPage.defaultPage', defaultTitle: 'Default Page' },
  preferences: { titleKey: 'settingsPage.preferences', defaultTitle: 'Preferences' },
  metadata: { titleKey: 'settingsPage.metadataSources', defaultTitle: 'Metadata & AutoTag Sources' },
  accessibility: { titleKey: 'settingsPage.accessibility', defaultTitle: 'Accessibility' },
  performance: { titleKey: 'settingsPage.performance', defaultTitle: 'Performance' },
  downloads: { titleKey: 'settingsPage.downloads.title', defaultTitle: 'Online downloads' },
  library: { titleKey: 'settingsPage.libraryScanning', defaultTitle: 'Library & Folders' },
  startup: { titleKey: 'settingsPage.startupAndWindowCustomization', defaultTitle: 'Startup & Window' },
  storage: { titleKey: 'settingsPage.storage', defaultTitle: 'Storage' },
  advanced: { titleKey: 'settingsPage.advanced', defaultTitle: 'Advanced' },
  about: { titleKey: 'settingsPage.about', defaultTitle: 'About' }
};

export const getSectionDisplayName = (
  sectionKey: SettingsSectionKey,
  t: (key: string, options?: Record<string, unknown>) => unknown
): string => {
  const meta = SECTION_METADATA[sectionKey];
  if (!meta) return sectionKey;
  const translated = t(meta.titleKey, { defaultValue: meta.defaultTitle });
  return typeof translated === 'string' && translated.length > 0 ? translated : meta.defaultTitle;
};

export const settingsCatalog: SettingCatalogEntry[] = [
  // --- APPEARANCE ---
  {
    id: 'setting-appearance-theme-mode',
    sectionKey: 'appearance',
    titleKey: 'settingsPage.changeTheme',
    defaultTitle: 'Change app theme',
    keywords: ['dark mode', 'light mode', 'system theme', 'night mode', 'dark', 'light']
  },
  {
    id: 'setting-appearance-theme-preset',
    sectionKey: 'appearance',
    titleKey: 'settingsPage.themePreset',
    defaultTitle: 'Theme Preset',
    descriptionKey: 'settingsPage.themePresetDescription',
    defaultDescription: 'Choose from a curated collection of beautiful themes.',
    keywords: [
      'nord',
      'emerald',
      'dracula',
      'solarized',
      'monokai',
      'catppuccin',
      'tokyonight',
      'rosepine',
      'gruvbox',
      'synthwave',
      'cyberpunk',
      'colors',
      'palette'
    ]
  },
  {
    id: 'setting-appearance-image-dynamic-theme',
    sectionKey: 'appearance',
    titleKey: 'settingsPage.enableImageBasedDynamicThemes',
    defaultTitle: 'Enable dynamic theme from music artwork',
    descriptionKey: 'settingsPage.enableImageBasedDynamicThemesDescription',
    defaultDescription:
      'Dynamically adapt application theme accents and tones to match current song artwork.',
    keywords: ['dynamic theme', 'artwork colors', 'palette', 'album cover colors']
  },
  {
    id: 'setting-appearance-dynamic-artwork-card',
    sectionKey: 'appearance',
    titleKey: 'settingsPage.enableSongCardDynamicArtworkBackground',
    defaultTitle: 'Enable dynamic song card background',
    descriptionKey: 'settingsPage.enableSongCardDynamicArtworkBackgroundDescription',
    defaultDescription:
      'Apply dynamic colored backgrounds to song cards matching album artwork.',
    keywords: ['song card', 'card background', 'artwork background']
  },
  {
    id: 'setting-appearance-ambient-particles',
    sectionKey: 'appearance',
    titleKey: 'settingsPage.ambientParticles',
    defaultTitle: 'Ambient visual particles',
    descriptionKey: 'settingsPage.ambientParticlesDescription',
    defaultDescription: 'Show floating visual particles on the background.',
    keywords: ['particles', 'ambient', 'floating', 'animation', 'effects']
  },

  // --- LANGUAGE ---
  {
    id: 'setting-language-dropdown',
    sectionKey: 'language',
    titleKey: 'settingsPage.language',
    defaultTitle: 'App language',
    descriptionKey: 'settingsPage.languageDescription',
    defaultDescription: 'Change the language of the user interface.',
    keywords: ['language', 'locale', 'translate', 'english', 'turkish', 'french', 'portuguese', 'vietnamese']
  },

  // --- AUDIO PLAYBACK ---
  {
    id: 'setting-audio-playback-rate',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.playbackRate',
    defaultTitle: 'Playback rate',
    descriptionKey: 'settingsPage.playbackRateDescription',
    defaultDescription: 'Adjust audio playback speed.',
    keywords: ['speed', 'playback speed', 'tempo', 'rate', 'fast', 'slow']
  },
  {
    id: 'setting-audio-seekbar-scroll-interval',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.seekbarScrollInterval',
    defaultTitle: 'Seekbar scroll interval',
    descriptionKey: 'settingsPage.seekbarScrollIntervalDescription',
    defaultDescription: 'Set how far the track skips when scrolling on the seekbar.',
    keywords: ['seek', 'skip', 'forward', 'rewind', 'seconds', 'scroll seek']
  },
  {
    id: 'setting-audio-crossfade',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.crossfade',
    defaultTitle: 'Crossfade',
    descriptionKey: 'settingsPage.crossfadeDescription',
    defaultDescription: 'Smoothly crossfade between songs.',
    keywords: ['crossfade', 'fade', 'transition', 'gapless', 'overlap']
  },
  {
    id: 'setting-audio-replaygain',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.replayGain',
    defaultTitle: 'ReplayGain (Loudness Normalization)',
    descriptionKey: 'settingsPage.replayGainDescription',
    defaultDescription: 'Normalize perceived loudness across tracks.',
    keywords: ['replaygain', 'loudness', 'normalize', 'volume level', 'rg']
  },
  {
    id: 'setting-audio-prevent-clipping',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.preventClipping',
    defaultTitle: 'Prevent audio clipping',
    descriptionKey: 'settingsPage.preventClippingDescription',
    defaultDescription: 'Automatically scale gain down to avoid distortion.',
    keywords: ['clipping', 'distortion', 'limiter', 'preamp peak']
  },
  {
    id: 'setting-audio-preamp',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.preamp',
    defaultTitle: 'Preamp gain',
    descriptionKey: 'settingsPage.preampDescription',
    defaultDescription: 'Adjust base gain before equalizer and output.',
    keywords: ['preamp', 'gain', 'boost', 'decibels', 'db']
  },
  {
    id: 'setting-audio-fx',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.audioFx',
    defaultTitle: 'Audio effects & equalizer preset',
    descriptionKey: 'settingsPage.audioFxDescription',
    defaultDescription: 'Access quick audio presets, reverb, and equalizer tools.',
    keywords: ['audio fx', 'effects', 'dsp', 'sound effects']
  },
  {
    id: 'setting-audio-waveform-seekbar',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.enableWaveformSeekbar',
    defaultTitle: 'Waveform seekbar',
    descriptionKey: 'settingsPage.enableWaveformSeekbarDescription',
    defaultDescription: 'Show dynamic audio waveform visualization on the seekbar.',
    keywords: ['waveform', 'wave', 'seekbar', 'visualizer', 'audio graph']
  },
  {
    id: 'setting-audio-remaining-duration',
    sectionKey: 'audioPlayback',
    titleKey: 'settingsPage.showRemainingSongDuration',
    defaultTitle: 'Show remaining song duration',
    descriptionKey: 'settingsPage.showRemainingSongDurationDescription',
    defaultDescription: 'Display remaining song duration instead of total duration.',
    keywords: ['remaining', 'duration', 'time', 'countdown', 'elapsed']
  },

  // --- ACCOUNTS ---
  {
    id: 'setting-accounts-discord-rpc',
    sectionKey: 'accounts',
    titleKey: 'settingsPage.enableDiscordRpc',
    defaultTitle: 'Enable Discord Rich Presence',
    descriptionKey: 'settingsPage.enableDiscordRpcDescription',
    defaultDescription: 'Integrate Discord Rich Presence with Nora',
    keywords: ['discord', 'rpc', 'rich presence', 'gaming status', 'now playing discord']
  },
  {
    id: 'setting-accounts-lastfm',
    sectionKey: 'accounts',
    titleKey: 'settingsPage.lastFm',
    defaultTitle: 'Last.fm Scrobbler',
    descriptionKey: 'settingsPage.lastFmDescription',
    defaultDescription: 'Scrobble listening activity to your Last.fm profile.',
    keywords: ['last.fm', 'lastfm', 'scrobble', 'scrobbling', 'now playing', 'profile']
  },
  {
    id: 'setting-accounts-listenbrainz',
    sectionKey: 'accounts',
    titleKey: 'settingsPage.listenBrainz',
    defaultTitle: 'ListenBrainz Scrobbler',
    descriptionKey: 'settingsPage.listenBrainzDescription',
    defaultDescription: 'Submit listens and loves to MetaBrainz ListenBrainz service.',
    keywords: ['listenbrainz', 'metabrainz', 'scrobble', 'open source scrobbler']
  },
  {
    id: 'setting-accounts-spotify',
    sectionKey: 'accounts',
    titleKey: 'settingsPage.spotify',
    defaultTitle: 'Spotify Integration',
    descriptionKey: 'settingsPage.spotifyDescription',
    defaultDescription: 'Import playlists and sync libraries with Spotify.',
    keywords: ['spotify', 'playlist import', 'sync', 'streaming']
  },

  // --- LYRICS ---
  {
    id: 'setting-lyrics-auto-save',
    sectionKey: 'lyrics',
    titleKey: 'settingsPage.automaticallySaveLyrics',
    defaultTitle: 'Automatically save lyrics',
    descriptionKey: 'settingsPage.automaticallySaveLyricsDescription',
    defaultDescription: 'Choose whether to automatically cache and save lyrics.',
    keywords: ['save lyrics', 'cache lyrics', 'lrc download', 'auto lyrics']
  },
  {
    id: 'setting-lyrics-save-in-lrc',
    sectionKey: 'lyrics',
    titleKey: 'settingsPage.saveLyricsInLrcFiles',
    defaultTitle: 'Save lyrics as .lrc files',
    descriptionKey: 'settingsPage.saveLyricsInLrcFilesDescription',
    defaultDescription: 'Save lyrics in companion .lrc files alongside songs.',
    keywords: ['lrc', 'lrc files', 'companion file', 'synced lyrics file']
  },
  {
    id: 'setting-lyrics-custom-location',
    sectionKey: 'lyrics',
    titleKey: 'settingsPage.customLrcFilesSaveLocation',
    defaultTitle: 'Custom .lrc files save location',
    descriptionKey: 'settingsPage.customLrcFilesSaveLocationDescription',
    defaultDescription: 'Specify a custom folder where .lrc files are stored.',
    keywords: ['lrc folder', 'lyrics folder', 'lrc path']
  },
  {
    id: 'setting-lyrics-background-style',
    sectionKey: 'lyrics',
    titleKey: 'settingsPage.lyricsBackground',
    defaultTitle: 'Lyrics viewer background style',
    descriptionKey: 'settingsPage.lyricsBackgroundDescription',
    defaultDescription: 'Configure blur, darkness, and artwork animation in lyrics mode.',
    keywords: ['lyrics background', 'lyrics blur', 'lyrics animation', 'theatre lyrics']
  },

  // --- EQUALIZER ---
  {
    id: 'setting-equalizer-preset',
    sectionKey: 'equalizer',
    titleKey: 'settingsPage.equalizerPresets',
    defaultTitle: 'Equalizer presets',
    keywords: ['equalizer preset', 'eq preset', 'bass boost', 'rock', 'pop', 'jazz', 'vocal']
  },
  {
    id: 'setting-equalizer-sliders',
    sectionKey: 'equalizer',
    titleKey: 'settingsPage.equalizerBands',
    defaultTitle: '10-Band Graphic Equalizer',
    keywords: ['equalizer', 'eq', 'bands', 'frequencies', 'bass', 'treble', 'midrange', 'hz', 'khz']
  },

  // --- DEFAULT PAGE ---
  {
    id: 'setting-default-page-startup',
    sectionKey: 'defaultPage',
    titleKey: 'settingsPage.defaultPage',
    defaultTitle: 'Default page on startup',
    descriptionKey: 'settingsPage.changeDefaultPageDescription',
    defaultDescription: 'Select which page opens automatically when Nora starts.',
    keywords: ['startup page', 'home page', 'default tab', 'opening page']
  },

  // --- PREFERENCES ---
  {
    id: 'setting-preferences-song-indexing',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.enableSongIndexing',
    defaultTitle: 'Enable song indexing',
    descriptionKey: 'settingsPage.songIndexingDescription',
    defaultDescription: 'Show numbers next to songs in lists.',
    keywords: ['indexing', 'track numbers', 'list numbers', 'song index', 'row numbers']
  },
  {
    id: 'setting-preferences-track-number',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.showTrackNumberAsSongIndex',
    defaultTitle: 'Show track number as song index',
    descriptionKey: 'settingsPage.showTrackNumberAsSongIndexDescription',
    defaultDescription: 'Display metadata track number instead of alphabetical index.',
    keywords: ['track number', 'album track', 'tag track number']
  },
  {
    id: 'setting-preferences-alphabet-scrubber',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.alphabetScrubberPosition',
    defaultTitle: 'Alphabet navigation bar',
    descriptionKey: 'settingsPage.alphabetScrubberDescription',
    defaultDescription: 'Quickly jump to songs starting with a letter using an A–Z navigation bar.',
    keywords: ['a-z', 'alphabet', 'scrubber', 'letters', 'quick jump', 'jump bar']
  },
  {
    id: 'setting-preferences-song-row-density',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.songViewMode',
    defaultTitle: 'Song row density',
    descriptionKey: 'settingsPage.songViewModeDescription',
    defaultDescription: 'Choose the row height and visual density for songs in the library.',
    keywords: ['row density', 'compact view', 'small row', 'dense list', 'row height']
  },
  {
    id: 'setting-preferences-show-equalizer',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.showEqualizerOnTracklist',
    defaultTitle: 'Show equalizer indicator on tracklist',
    descriptionKey: 'settingsPage.showEqualizerOnTracklistDescription',
    defaultDescription: 'Display animated equalizer icon on currently playing song.',
    keywords: ['equalizer indicator', 'soundbars', 'playing icon', 'tracklist equalizer']
  },
  {
    id: 'setting-preferences-artist-artwork',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.showArtistArtworkNearSongControls',
    defaultTitle: 'Show artist artwork in player bar',
    descriptionKey: 'settingsPage.showArtistArtworkNearSongControlsDescription',
    defaultDescription: 'Display artist circular artwork near the playback controls.',
    keywords: ['artist artwork', 'artist picture', 'player bar artist']
  },
  {
    id: 'setting-preferences-disable-background-artwork',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.disableBackgroundArtworks',
    defaultTitle: 'Disable background artwork',
    descriptionKey: 'settingsPage.disableBackgroundArtworksDescription',
    defaultDescription: 'Prevent blurred song artwork from displaying on the window background.',
    keywords: ['background artwork', 'blurred artwork', 'window background']
  },
  {
    id: 'setting-preferences-experimental-workspace',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.enableModularWorkspace',
    defaultTitle: 'Enable modular workspace system (Experimental)',
    keywords: ['workspace', 'musicbee', 'docking', 'columns', 'panels', 'sidebars']
  },
  {
    id: 'setting-preferences-playlist-artworks',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.enablePlaylistArtworks',
    defaultTitle: 'Generate artwork from playlist song covers',
    descriptionKey: 'settingsPage.playlistArtworksDescription',
    defaultDescription: 'Automatically build collage covers for playlists from contained songs.',
    keywords: ['playlist cover', 'collage', 'playlist artwork', 'grid cover']
  },
  {
    id: 'setting-preferences-sidebar-tabs',
    sectionKey: 'preferences',
    titleKey: 'settingsPage.sidebarNavigation',
    defaultTitle: 'Sidebar visible tabs',
    descriptionKey: 'settingsPage.sidebarNavigationDescription',
    defaultDescription: 'Choose which navigation items appear in the sidebar.',
    keywords: ['sidebar tabs', 'navigation items', 'hide tabs', 'genres', 'folders', 'insights']
  },

  // --- METADATA ---
  {
    id: 'setting-metadata-providers',
    sectionKey: 'metadata',
    titleKey: 'settingsPage.metadataCenter',
    defaultTitle: 'Metadata and autotag providers',
    descriptionKey: 'settingsPage.metadataProvidersDescription',
    defaultDescription: 'Configure MusicBrainz, Spotify, and ranking weights for autotagging.',
    keywords: ['musicbrainz', 'autotag', 'tagger', 'metadata', 'provider', 'release ranking']
  },

  // --- ACCESSIBILITY ---
  {
    id: 'setting-accessibility-reduced-motion',
    sectionKey: 'accessibility',
    titleKey: 'settingsPage.enableReducedMotion',
    defaultTitle: 'Enable reduced motion',
    descriptionKey: 'settingsPage.reducedMotionDescription',
    defaultDescription: 'Reduce transition animations and motion effects throughout the app.',
    keywords: ['reduced motion', 'motion', 'animations', 'accessibility', 'vestibular']
  },

  // --- PERFORMANCE ---
  {
    id: 'setting-performance-battery-animations',
    sectionKey: 'performance',
    titleKey: 'settingsPage.removeAnimationOnBattery',
    defaultTitle: 'Reduce animations on battery power',
    descriptionKey: 'settingsPage.removeAnimationOnBatteryDescription',
    defaultDescription: 'Conserve battery by disabling non-critical UI transitions.',
    keywords: ['battery', 'power saving', 'animations', 'laptop battery']
  },
  {
    id: 'setting-performance-visual-effects',
    sectionKey: 'performance',
    titleKey: 'settingsPage.reduceVisualEffectsOnBattery',
    defaultTitle: 'Reduce visual effects on battery power',
    descriptionKey: 'settingsPage.reduceVisualEffectsOnBatteryDescription',
    defaultDescription: 'Disable blur effects and complex shadows on battery power.',
    keywords: ['visual effects', 'battery effects', 'blur', 'shadows']
  },
  {
    id: 'setting-performance-screen-sleep',
    sectionKey: 'performance',
    titleKey: 'settingsPage.allowToPreventScreenSleeping',
    defaultTitle: 'Prevent screen sleeping during playback',
    descriptionKey: 'settingsPage.allowToPreventScreenSleepingDescription',
    defaultDescription: 'Keep display awake while audio is actively playing.',
    keywords: ['screen sleep', 'keep awake', 'display sleep', 'screensaver']
  },

  // --- DOWNLOADS ---
  {
    id: 'setting-downloads-folder',
    sectionKey: 'downloads',
    titleKey: 'settingsPage.downloads.folderTitle',
    defaultTitle: 'Downloads folder location',
    descriptionKey: 'settingsPage.downloads.folderDescription',
    defaultDescription: 'Folder where downloaded songs are saved.',
    keywords: ['downloads', 'download folder', 'online downloads', 'save folder']
  },
  {
    id: 'setting-downloads-add-to-library',
    sectionKey: 'downloads',
    titleKey: 'settingsPage.downloads.addToLibrary',
    defaultTitle: 'Add downloaded songs to library automatically',
    keywords: ['auto add downloads', 'library download', 'import downloads']
  },
  {
    id: 'setting-downloads-duplicate-policy',
    sectionKey: 'downloads',
    titleKey: 'settingsPage.downloads.duplicatePolicy',
    defaultTitle: 'Duplicate file handling policy',
    keywords: ['duplicates', 'overwrite', 'skip duplicates', 'keep both']
  },

  // --- LIBRARY ---
  {
    id: 'setting-library-scan-mode',
    sectionKey: 'library',
    titleKey: 'settingsPage.libraryScanMode',
    defaultTitle: 'Library scan mode',
    descriptionKey: 'settingsPage.libraryScanModeDescription',
    defaultDescription: 'Select whether library updates automatically or only on manual trigger.',
    keywords: ['scanner', 'rescan', 'automatic scan', 'library scan', 'watch folders']
  },
  {
    id: 'setting-library-folders',
    sectionKey: 'library',
    titleKey: 'settingsPage.musicFolders',
    defaultTitle: 'Music folders',
    descriptionKey: 'settingsPage.musicFoldersDescription',
    defaultDescription: 'Manage directories watched and indexed for your audio library.',
    keywords: ['music folders', 'directories', 'folder watch', 'library folders']
  },

  // --- STARTUP ---
  {
    id: 'setting-startup-auto-launch',
    sectionKey: 'startup',
    titleKey: 'settingsPage.autoLaunchAtStart',
    defaultTitle: 'Launch Nora automatically on system start',
    descriptionKey: 'settingsPage.autoLaunchAtStartDescription',
    defaultDescription: 'Open the application automatically when you log into your system.',
    keywords: ['startup', 'boot', 'launch on boot', 'autostart']
  },
  {
    id: 'setting-startup-open-hidden',
    sectionKey: 'startup',
    titleKey: 'settingsPage.openWindowAsHiddenOnSystemStart',
    defaultTitle: 'Start minimized / hidden in system tray',
    descriptionKey: 'settingsPage.openWindowAsHiddenOnSystemStartDescription',
    defaultDescription: 'Launch into the background without popping up the main window.',
    keywords: ['start hidden', 'start minimized', 'tray start', 'background startup']
  },
  {
    id: 'setting-startup-hide-on-close',
    sectionKey: 'startup',
    titleKey: 'settingsPage.hideWindowOnClose',
    defaultTitle: 'Hide window instead of closing on exit',
    descriptionKey: 'settingsPage.hideWindowOnCloseDescription',
    defaultDescription: 'Keep music playing in background when clicking close button.',
    keywords: ['close button', 'minimize to tray', 'keep playing on close', 'tray']
  },
  {
    id: 'setting-startup-tray-single-click',
    sectionKey: 'startup',
    titleKey: 'settingsPage.openWindowWithSingleClickOnTrayIcon',
    defaultTitle: 'Restore window on single tray click',
    descriptionKey: 'settingsPage.openWindowWithSingleClickOnTrayIconDescription',
    defaultDescription: 'Click system tray icon once to show or hide the application.',
    keywords: ['tray click', 'system tray icon', 'tray restore']
  },
  {
    id: 'setting-startup-hide-mini-player',
    sectionKey: 'startup',
    titleKey: 'settingsPage.hideMiniPlayerFromTaskbar',
    defaultTitle: 'Hide mini-player from taskbar',
    descriptionKey: 'settingsPage.hideMiniPlayerFromTaskbarDescription',
    defaultDescription: 'Keep mini-player floating without occupying taskbar space.',
    keywords: ['mini-player taskbar', 'floating mini player', 'taskbar icon']
  },

  // --- STORAGE ---
  {
    id: 'setting-storage-metrics',
    sectionKey: 'storage',
    titleKey: 'settingsPage.storageMetrics',
    defaultTitle: 'Storage usage metrics',
    keywords: ['storage', 'disk space', 'database size', 'cache size', 'logs size']
  },

  // --- ADVANCED ---
  {
    id: 'setting-advanced-save-verbose-logs',
    sectionKey: 'advanced',
    titleKey: 'settingsPage.saveVerboseLogs',
    defaultTitle: 'Save verbose debug logs',
    descriptionKey: 'settingsPage.saveVerboseLogsDescription',
    defaultDescription: 'Record detailed diagnostic logs for troubleshooting issues.',
    keywords: ['verbose logs', 'debug logs', 'troubleshooting', 'developer logging']
  },

  // --- ABOUT ---
  {
    id: 'setting-about-app-version',
    sectionKey: 'about',
    titleKey: 'settingsPage.appVersion',
    defaultTitle: 'App version and release info',
    keywords: ['version', 'update', 'changelog', 'release notes']
  },
  {
    id: 'setting-about-app-shortcuts',
    sectionKey: 'about',
    titleKey: 'settingsPage.appShortcuts',
    defaultTitle: 'Keyboard shortcuts manager',
    keywords: ['shortcuts', 'hotkeys', 'keybindings', 'keyboard']
  },
  {
    id: 'setting-about-reset-app',
    sectionKey: 'about',
    titleKey: 'settingsPage.resetApp',
    defaultTitle: 'Reset application settings',
    keywords: ['reset', 'factory reset', 'defaults', 'restore settings']
  },
  {
    id: 'setting-about-clear-localstorage',
    sectionKey: 'about',
    titleKey: 'settingsPage.clearOptionalData',
    defaultTitle: 'Clear optional local storage data',
    keywords: ['clear data', 'localstorage', 'reset preferences']
  },
  {
    id: 'setting-about-clear-history',
    sectionKey: 'about',
    titleKey: 'settingsPage.clearHistory',
    defaultTitle: 'Clear listening history',
    keywords: ['history', 'clear history', 'listening history', 'scrobbles']
  },
  {
    id: 'setting-about-export-app-data',
    sectionKey: 'about',
    titleKey: 'settingsPage.exportAppData',
    defaultTitle: 'Export app configuration data',
    keywords: ['export', 'backup', 'backup settings', 'json export']
  },
  {
    id: 'setting-about-import-app-data',
    sectionKey: 'about',
    titleKey: 'settingsPage.importAppData',
    defaultTitle: 'Import app configuration data',
    keywords: ['import', 'restore backup', 'json import']
  }
];
