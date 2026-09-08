import { Store } from '@tanstack/store';

import {
  type AppReducer,
  type AppReducerStateActions,
  DEFAULT_REDUCER_DATA,
  reducer as appReducer
} from '../other/appReducer';
import storage from '../utils/localStorage';

storage.checkLocalStorage();
export const store = new Store(DEFAULT_REDUCER_DATA);

type StoreSubscriptionState =
  | AppReducer
  | {
      currentVal?: AppReducer;
      prevVal?: AppReducer;
    };

const getCurrentStoreState = (subscriptionState: StoreSubscriptionState): AppReducer => {
  if ('currentVal' in subscriptionState && subscriptionState.currentVal) {
    return subscriptionState.currentVal;
  }

  return subscriptionState as AppReducer;
};

export const dispatch = (options: AppReducerStateActions) => {
  store.setState((state) => {
    return appReducer(state, options);
  });
};

export const reducer = () => {
  return { state: store.state, dispatch };
};

dispatch({
  type: 'UPDATE_LOCAL_STORAGE',
  data: storage.getLocalStorage()
});

let prevLocalStorage: LocalStorage | undefined = store.state?.localStorage;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLocalStorage: LocalStorage | null = null;

export const flushPendingLocalStorage = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pendingLocalStorage) {
    const toWrite = pendingLocalStorage;
    pendingLocalStorage = null;
    storage.setLocalStorage(toWrite);
  }
};

export const __resetPersistenceForTesting = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingLocalStorage = null;
  prevLocalStorage = store.state?.localStorage;
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingLocalStorage);
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingLocalStorage();
    }
  });
}

store.subscribe((state) => {
  const currentState = getCurrentStoreState(state as StoreSubscriptionState);

  if (!currentState?.localStorage) {
    return;
  }

  const currentLocal = currentState.localStorage;
  if (currentLocal === prevLocalStorage) {
    return;
  }

  const queueChanged = currentLocal.queue !== prevLocalStorage?.queue;
  prevLocalStorage = currentLocal;

  if (queueChanged) {
    // Immediate persist on critical queue updates to ensure restart/crash recovery.
    // Discard any debounced prefs snapshot: currentLocal already supersedes it
    // (state is cumulative), so writing both would be a redundant double-write.
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingLocalStorage = null;
    storage.setLocalStorage(currentLocal);
  } else {
    // Debounce non-critical preferences, appearance, sorting changes (250ms)
    pendingLocalStorage = currentLocal;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (pendingLocalStorage) {
        const toWrite = pendingLocalStorage;
        pendingLocalStorage = null;
        storage.setLocalStorage(toWrite);
      }
    }, 250);
  }
});
