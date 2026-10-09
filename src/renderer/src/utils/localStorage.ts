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

      // Check startup raw store size: if raw stored blob > 4MB (4,194,304 bytes),
      // strip large queue arrays (>1000 songs) to prevent quota exhaustion.
      let finalStore = normalizedStore;
      const rawPayloadLength = store.length;
      const STARTUP_STRIP_THRESHOLD_BYTES = 4 * 1024 * 1024;
      if (rawPayloadLength > STARTUP_STRIP_THRESHOLD_BYTES) {
        log(
          `Startup localStorage payload size (${(rawPayloadLength / 1024 / 1024).toFixed(2)} MB) exceeds 4MB threshold. Stripping large (>1000 songs) queues to prevent quota exhaustion.`,
          undefined,
          'WARN'
        );
        isQueueStorageDegraded = true;
        let candidate = stripSelectiveQueuePayload(normalizedStore, 1000);
        if (JSON.stringify(candidate).length > STARTUP_STRIP_THRESHOLD_BYTES) {
          candidate = stripQueuePayload(normalizedStore);
        }
        finalStore = candidate;
        setTimeout(() => dispatchQueueDegradedToast(), 0);
      }

      localStorage.setItem('localStorage', JSON.stringify(finalStore));
      localStorage.setItem('version', migratedVersion);
    }
  }
  return console.log('local storage check successful.');
};

const dispatchQueueDegradedToast = () => {
  try {
    const currentNotifications = store?.state?.notificationPanelData?.notifications ?? [];
    if (currentNotifications.some((n) => n.id === 'queue-storage-degraded')) {
      return;
    }
    const newNotification: AppNotification = {
      id: 'queue-storage-degraded',
      duration: 10000,
      content: 'Storage quota exceeded. Large queues were trimmed to preserve app settings.',
      iconName: 'warning'
    };
    dispatch({
      type: 'ADD_NEW_NOTIFICATIONS',
      data: [newNotification, ...currentNotifications]
    });
  } catch {
    // Silently continue if store or dispatch is not initialized yet
  }
};

export const stripSelectiveQueuePayload = (
  storage: LocalStorage,
  threshold = 1000
): LocalStorage => {
  if (!storage || !storage.queue || !Array.isArray(storage.queue.queues)) {
    return storage;
  }
  return {
    ...storage,
    queue: {
      ...storage.queue,
      queues: storage.queue.queues.map((q) => {
        if (Array.isArray(q.songIds) && q.songIds.length > threshold) {
          return {
            ...q,
            songIds: [],
            position: 0,
            queueBeforeShuffle: undefined
          };
        }
        return q;
      })
    }
  };
};

export const stripQueuePayload = (storage: LocalStorage): LocalStorage => {
  if (!storage || !storage.queue || !Array.isArray(storage.queue.queues)) {
    return storage;
  }
  return {
    ...storage,
    queue: {
      ...storage.queue,
      queues: storage.queue.queues.map((q) => ({
        ...q,
        songIds: [],
        position: 0,
        queueBeforeShuffle: undefined
      }))
    }
  };
};

export const countTotalQueuedSongs = (storage: LocalStorage): number => {
  if (!storage?.queue?.queues || !Array.isArray(storage.queue.queues)) return 0;
  return storage.queue.queues.reduce((sum, q) => sum + (q.songIds?.length ?? 0), 0);
};

let isQueueStorageDegraded = false;
let hasLoggedQuotaDegraded = false;

export const getIsQueueStorageDegraded = () => isQueueStorageDegraded;

export const __resetDegradedStateForTesting = () => {
  isQueueStorageDegraded = false;
  hasLoggedQuotaDegraded = false;
};

export const isQuotaExceededError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.code === 22 ||
      error.code === 1014 ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }
  if (error && typeof error === 'object') {
    const err = error as { name?: string; code?: number };
    return (
      err.name === 'QuotaExceededError' ||
      err.code === 22 ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }
  return false;
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
  // Degraded mode recovery: if queues shrank under 1000 songs, attempt unstripped write
  if (isQueueStorageDegraded && countTotalQueuedSongs(storage) < 1000) {
    try {
      const unstrippedString = JSON.stringify(storage);
      localStorage.setItem('localStorage', unstrippedString);
      isQueueStorageDegraded = false;
      hasLoggedQuotaDegraded = false;
      return;
    } catch {
      // Still exceeds quota or failed; continue with degraded write
    }
  }

  const payload = isQueueStorageDegraded
    ? stripSelectiveQueuePayload(storage, 1000)
    : storage;

  try {
    const updatedStorageString = JSON.stringify(payload);
    localStorage.setItem('localStorage', updatedStorageString);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      isQueueStorageDegraded = true;
      if (!hasLoggedQuotaDegraded) {
        hasLoggedQuotaDegraded = true;
        log(
          'LocalStorage quota exceeded. Degrading queue persistence by stripping large (>1000 songs) queues to protect user preferences.',
          { error },
          'WARN'
        );
        dispatchQueueDegradedToast();
      }
      try {
        // Selective strip first
        const selectiveStripped = stripSelectiveQueuePayload(storage, 1000);
        localStorage.setItem('localStorage', JSON.stringify(selectiveStripped));
      } catch (selectiveError) {
        // Blanket strip fallback as last resort
        if (isQuotaExceededError(selectiveError)) {
          try {
            const blanketStripped = stripQueuePayload(storage);
            localStorage.setItem('localStorage', JSON.stringify(blanketStripped));
          } catch (blanketError) {
            log(
              'Failed to write stripped localStorage fallback after quota exceeded.',
              { blanketError },
              'ERROR'
            );
          }
        }
      }
    } else {
      console.error(error);
    }
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
  const current = getAllItems();
  const parent = current[itemType] ?? LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType];
  const storage: LocalStorage = {
    ...current,
    [itemType]: {
      ...(typeof parent === 'object' && parent !== null ? parent : {}),
      [type]: data
    }
  };
  try {
    if (
      (itemType in current && type in (current[itemType] as object)) ||
      (itemType in LOCAL_STORAGE_DEFAULT_TEMPLATE &&
        type in (LOCAL_STORAGE_DEFAULT_TEMPLATE[itemType] as object))
    ) {
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
  if (!Array.isArray(persisted) || persisted.length === 0) return storageData;

  let changed = false;
  const normalized: ShortcutCategoryList = persisted.map((category, categoryIndex) => {
    const templateCategory =
      templateShortcuts.find((tc) => tc.shortcutCategoryTitle === category.shortcutCategoryTitle) ||
      templateShortcuts[categoryIndex];
    if (!templateCategory) return category;

    if (category.shortcutCategoryTitle !== templateCategory.shortcutCategoryTitle) {
      changed = true;
    }

    const currentShortcuts = Array.isArray(category.shortcuts) ? category.shortcuts : [];
    const normalizedShortcuts = currentShortcuts.map((shortcut, shortcutIndex) => {
      const templateShortcut = templateCategory.shortcuts[shortcutIndex];
      if (templateShortcut && shortcut.label === templateShortcut.label) return shortcut;
      if (templateCategory.shortcuts.some((ts) => ts.label === shortcut.label)) return shortcut;

      if (templateShortcut) {
        changed = true;
        return { ...shortcut, label: templateShortcut.label };
      }
      return shortcut;
    });

    const presentLabels = new Set(normalizedShortcuts.map((s) => s.label));
    for (const templateShortcut of templateCategory.shortcuts) {
      if (!presentLabels.has(templateShortcut.label)) {
        normalizedShortcuts.push({
          label: templateShortcut.label,
          keys: [...templateShortcut.keys]
        });
        changed = true;
      }
    }

    return {
      ...category,
      shortcutCategoryTitle: templateCategory.shortcutCategoryTitle,
      shortcuts: normalizedShortcuts
    };
  });

  const presentCategoryTitles = new Set(normalized.map((c) => c.shortcutCategoryTitle));
  for (const templateCategory of templateShortcuts) {
    if (!presentCategoryTitles.has(templateCategory.shortcutCategoryTitle)) {
      normalized.push({
        shortcutCategoryTitle: templateCategory.shortcutCategoryTitle,
        shortcuts: templateCategory.shortcuts.map((s) => ({
          label: s.label,
          keys: [...s.keys]
        }))
      });
      changed = true;
    }
  }

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
