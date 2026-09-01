import { LOCAL_STORAGE_DEFAULT_TEMPLATE } from '@renderer/other/appReducer';
import { dispatch, store } from '@renderer/store/store';

import { version } from '../../../../package.json';
import localStorageMigrationData from '../other/localStorageMigrations';
import addMissingPropsToAnObject from './addMissingPropsToAnObject';
import isLatestVersion from './isLatestVersion';
import log from './log';

// import isLatestVersion from './isLatestVersion';

const resetLocalStorage = () => {
  try {
    localStorage.clear();
    const template = JSON.stringify(LOCAL_STORAGE_DEFAULT_TEMPLATE);
    localStorage.setItem('version', version);
    localStorage.setItem('localStorage', template);
  } catch (error) {
    log('An error occurred while resetting the local storage.', { error }, 'ERROR');
  }
};

export type MigrationData = Record<
  /** Version of the app */
  string,
  (localStorage: LocalStorage) => LocalStorage
>;

const migrateLocalStorage = (migrationData: MigrationData, storage: LocalStorage) => {
  let currentLocalStorage = storage;
  let localStorageVersion = localStorage.getItem('version') ?? '1.0.0';

  for (const [migrationVersion, migrationFunction] of Object.entries(migrationData)) {
    const isLocalStorageUpToDate = isLatestVersion(migrationVersion, localStorageVersion);

    if (!isLocalStorageUpToDate) {
      log(
        `Migrating local storage ${localStorageVersion} => ${migrationVersion}`,
        undefined,
        'WARN'
      );
      currentLocalStorage = migrationFunction(currentLocalStorage);
      localStorageVersion = migrationVersion;
    }
  }

  return {
    migratedLocalStorage: currentLocalStorage,
    migratedVersion: localStorageVersion
  };
};

const repairInvalidLocalStorage = (isASupportedStoreVersion: boolean, store: string | null) => {
  log(
    'Inavalid or outdated local storage found. Resetting the local storage to default properties.',
    { isASupportedStoreVersion, store },
    'WARN'
  );
  return resetLocalStorage();
};

const checkLocalStorage = () => {
  const store = localStorage.getItem('localStorage');
  const currentLocalStorageVersion = localStorage.getItem('version');
  const isASupportedStoreVersion = currentLocalStorageVersion !== null;
  const isAValidStore = store && isASupportedStoreVersion;

  if (!isAValidStore) {
    repairInvalidLocalStorage(isASupportedStoreVersion, store);
  } else {
    let jsonStore: LocalStorage | null = null;
    try {
      jsonStore = JSON.parse(store) as LocalStorage;
    } catch (error) {
      // A corrupted payload must not crash startup with a white screen; recover
      // by resetting to the default template like any other invalid store.
      log('Local storage contains malformed JSON. Resetting local storage.', { error }, 'ERROR');
    }

    if (jsonStore === null) {
      repairInvalidLocalStorage(isASupportedStoreVersion, store);
    } else {
      const { migratedLocalStorage, migratedVersion } = migrateLocalStorage(
        localStorageMigrationData,
        jsonStore
      );

      const updatedStore = addMissingPropsToAnObject(
        LOCAL_STORAGE_DEFAULT_TEMPLATE,
        migratedLocalStorage,
        (key) => console.warn(`Added missing '${key}' property to localStorage.`)
      );

      const normalizedStore = normalizeShortcutLabelsToKeys(updatedStore);

      localStorage.setItem('localStorage', JSON.stringify(normalizedStore));
      localStorage.setItem('version', migratedVersion);
    }
  }
  return console.log('local storage check successful.');
};

const getLocalStorage = (): LocalStorage => {
  const storageString = localStorage.getItem('localStorage');
  if (storageString) {
    try {
      const storage = JSON.parse(storageString) as LocalStorage;
      return storage;
    } catch (error) {
      console.error(error);
    }
  }
  return LOCAL_STORAGE_DEFAULT_TEMPLATE;
};

const setLocalStorage = (storage: LocalStorage) => {
  try {
    const updatedStorageString = JSON.stringify(storage);
    localStorage.setItem('localStorage', updatedStorageString);
  } catch (error) {
    console.error(error);
  }
};

const getAllItems = (): LocalStorage => {
  return store.state.localStorage;
};

const setAllItems = (storage: LocalStorage) => {
  try {
    dispatch({ type: 'UPDATE_LOCAL_STORAGE', data: { ...storage } });
  } catch (error) {
    console.error(error);
  }
};

const setFullItem = <ItemType extends keyof LocalStorage, Data extends LocalStorage[ItemType]>(
  itemType: ItemType,
  data: Data
) => {
  const storage = getAllItems();
  try {
    if (itemType in storage || itemType in LOCAL_STORAGE_DEFAULT_TEMPLATE) {
      storage[itemType] = data;

      setAllItems(storage);
    } else {
      throw new Error(`option ${String(itemType)} doesn't exist on localStorage.`);
    }
  } catch (error) {
    console.error(error);
  }
};

const getFullItem = <ItemType extends keyof LocalStorage>(itemType: ItemType) => {
  const storage = getAllItems();
  if (itemType in storage) return storage[itemType];

  if (itemType in LOCAL_STORAGE_DEFAULT_TEMPLATE) {
    storage[itemType] = LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType];
    setAllItems(storage);
    return LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType];
  }

  throw new Error(
    `requested item type '${itemType}' or type '${String(
      itemType
    )}' didn't exist in the local storage.`
  );
};

const setItem = <
  ItemType extends keyof LocalStorage,
  Type extends keyof LocalStorage[ItemType],
  Data extends LocalStorage[ItemType][Type]
>(
  itemType: ItemType,
  type: Type,
  data: Data
) => {
  const storage = { ...getAllItems() };
  try {
    if (
      (itemType in storage && type in storage[itemType]) ||
      (itemType in LOCAL_STORAGE_DEFAULT_TEMPLATE &&
        type in LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType])
    ) {
      storage[itemType][type] = data;

      setAllItems(storage);
    } else {
      throw new Error(`option ${String(type)} doesn't exist on localStorage.`);
    }
  } catch (error) {
    console.error(error);
  }
};

const getItem = <ItemType extends keyof LocalStorage, Type extends keyof LocalStorage[ItemType]>(
  itemType: ItemType,
  type: Type
) => {
  const storage = getAllItems();
  if (itemType in storage && type in storage[itemType]) {
    return storage[itemType][type];
  }

  if (
    itemType in LOCAL_STORAGE_DEFAULT_TEMPLATE &&
    type in LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType]
  ) {
    storage[itemType][type] = LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType][type];
    setAllItems(storage);
    return LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType][type];
  }

  throw new Error(
    `requested item type '${itemType}' or type '${String(type)}' didn't exist in the local storage.`
  );
};

// PREFERENCES

const setPreferences = <Type extends keyof Preferences, Data extends Preferences[Type]>(
  type: Type,
  data: Data
) => {
  const preferences = { ...getFullItem('preferences'), [type]: data };
  dispatch({ type: 'UPDATE_LOCAL_STORAGE_PREFERENCES', data: preferences });
};

const getPreferences = <Type extends keyof Preferences>(type: Type) => getItem('preferences', type);

// PLAYBACK

const setPlaybackOptions = <Type extends keyof Playback, Data extends Playback[Type]>(
  type: Type,
  data: Data
) => setItem('playback', type, data);

const getPlaybackOptions = <Type extends keyof Playback>(type: Type) => getItem('playback', type);

const setCurrentSongOptions = <Type extends keyof CurrentSong, Data extends CurrentSong[Type]>(
  type: Type,
  data: Data
) => {
  const currentSong = getPlaybackOptions('currentSong') as CurrentSong;
  if (type in currentSong) {
    currentSong[type] = data;
    setPlaybackOptions('currentSong', currentSong);
  }
};

const setVolumeOptions = <Type extends keyof Volume, Data extends Volume[Type]>(
  type: Type,
  data: Data
) => {
  const volume = getPlaybackOptions('volume');
  if (type in volume) {
    volume[type] = data;
    setPlaybackOptions('volume', volume);
  }
};

// QUEUE

const setQueue = (queue: QueuesState) => {
  const allItems = getAllItems();
  setAllItems({ ...allItems, queue });
};

const getQueue = () => getAllItems().queue;

// SORTING STATES

const setSortingStates = <Type extends keyof SortingStates, Data extends SortingStates[Type]>(
  type: Type,
  data: Data
) => setItem('sortingStates', type, data);

const getSortingStates = <Type extends keyof SortingStates>(type: Type) =>
  getItem('sortingStates', type);

// KEYBOARD SHORTCUTS (Legacy - stored in localStorage for backward compat)
// Note: These read/write from the store's initial keyboardShortcuts, not database

/**
 * Shortcut labels must be persisted as stable i18n KEYS ('appShortcutsPrompt.playPause'), never
 * runtime translations. Older versions stored translated strings, which permanently desynchronized
 * shortcut matching after a language switch. Rewrite any non-key label to the key at the same
 * category/shortcut position (the shortcut list shape is fixed; custom key bindings are
 * preserved).
 *
 * Idempotent: labels that already match the template keys are left untouched.
 */
export const normalizeShortcutLabelsToKeys = (storageData: LocalStorage): LocalStorage => {
  const templateShortcuts = LOCAL_STORAGE_DEFAULT_TEMPLATE.keyboardShortcuts;
  const persisted = storageData?.keyboardShortcuts;
  if (!Array.isArray(persisted)) return storageData;

  let changed = false;
  const normalized = persisted.map((category, categoryIndex) => {
    const templateCategory = templateShortcuts[categoryIndex];
    if (!templateCategory) return category;

    return {
      ...category,
      shortcutCategoryTitle: templateCategory.shortcutCategoryTitle,
      shortcuts: category.shortcuts.map((shortcut, shortcutIndex) => {
        const templateShortcut = templateCategory.shortcuts[shortcutIndex];
        if (!templateShortcut || shortcut.label === templateShortcut.label) return shortcut;
        changed = true;
        return { ...shortcut, label: templateShortcut.label };
      })
    };
  });

  return changed ? { ...storageData, keyboardShortcuts: normalized } : storageData;
};

const getKeyboardShortcuts = (): ShortcutCategoryList => {
  const storage = getLocalStorage();
  return (storage as any)?.keyboardShortcuts || [];
};

const setKeyboardShortcuts = (label: string, newKeys: string[]): void => {
  const currentData: ShortcutCategoryList = getKeyboardShortcuts();

  const updatedData = currentData.map((category) => ({
    ...category,
    shortcuts: category.shortcuts.map((shortcut) => {
      if (shortcut.label === label) {
        return { ...shortcut, keys: newKeys };
      }
      return shortcut;
    })
  }));

  try {
    const allItems = getAllItems() as any;
    setAllItems({
      ...allItems,
      keyboardShortcuts: updatedData
    });
  } catch (error) {
    console.error('Failed to update keyboard shortcuts:', error);
  }
};

const resetShortcutsToDefaults = (): void => {
  const allItems = getAllItems() as any;
  const defaultShortcuts = (LOCAL_STORAGE_DEFAULT_TEMPLATE as any).keyboardShortcuts;
  if (defaultShortcuts) {
    setAllItems({
      ...allItems,
      keyboardShortcuts: defaultShortcuts
    });
  }
};

// EQUALIZER PRESET (Legacy - stored in localStorage for backward compat)
// Note: New code should use database via useUserPreferences hook

const setEqualizerPreset = <Data extends Equalizer>(data: Data) => {
  // Store in the local storage root (not under playback)
  const allItems = getAllItems() as any;
  setAllItems({
    ...allItems,
    equalizerPreset: data
  });
};

const getEqualizerPreset = () => {
  const storage = getLocalStorage() as any;
  return storage?.equalizerPreset as Equalizer | undefined;
};

// LYRICS EDITOR

const setLyricsEditorSettings = <
  Type extends keyof LyricsEditorSettings,
  Data extends LyricsEditorSettings[Type]
>(
  type: Type,
  data: Data
) => setItem('lyricsEditorSettings', type, data);

const getLyricsEditorSettings = <Type extends keyof LyricsEditorSettings>(type: Type) =>
  getItem('lyricsEditorSettings', type);

// PLAYLIST COVER SETTINGS
const getPlaylistCoverSettings = (
  playlistId: number
): import('@renderer/types/playlistCover').PlaylistCoverSettings | undefined => {
  try {
    const raw = localStorage.getItem(`playlist_cover_settings_${playlistId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch (err) {
    console.error('Failed to parse playlist cover settings:', err);
    return undefined;
  }
};

const setPlaylistCoverSettings = (
  playlistId: number,
  settings: import('@renderer/types/playlistCover').PlaylistCoverSettings
): void => {
  try {
    localStorage.setItem(`playlist_cover_settings_${playlistId}`, JSON.stringify(settings));
    window.dispatchEvent(
      new CustomEvent('playlist-cover-settings-changed', { detail: { playlistId } })
    );
  } catch (err) {
    console.error('Failed to set playlist cover settings:', err);
  }
};

// / / / / / / / / / /

export default {
  preferences: { setPreferences, getPreferences },
  playback: {
    setPlaybackOptions,
    getPlaybackOptions,
    setCurrentSongOptions,
    setVolumeOptions
  },
  queue: { setQueue, getQueue },
  sortingStates: { setSortingStates, getSortingStates },
  lyricsEditorSettings: { setLyricsEditorSettings, getLyricsEditorSettings },
  keyboardShortcuts: {
    resetShortcutsToDefaults,
    getKeyboardShortcuts,
    setKeyboardShortcuts
  },
  equalizerPreset: { setEqualizerPreset, getEqualizerPreset },
  playlistCoverSettings: {
    getSettings: getPlaylistCoverSettings,
    setSettings: setPlaylistCoverSettings
  },
  checkLocalStorage,
  getLocalStorage,
  setLocalStorage,
  resetLocalStorage,
  getAllItems,
  setAllItems,
  getFullItem,
  setFullItem,
  getItem,
  setItem
};
