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

// Position-only updates MUST preserve songIds/queueBeforeShuffle array references
// (spread the queue object, never clone the arrays). Cloning fails closed —
// a full write is scheduled, which is safe but reintroduces the serialization stall.
const isStructuralQueueEqual = (
  curr?: LocalStorage['queue'],
  prev?: LocalStorage['queue']
): boolean => {
  if (!curr || !prev) return curr === prev;
  if (curr.currentQueueIndex !== prev.currentQueueIndex) return false;
  if (!Array.isArray(curr.queues) || !Array.isArray(prev.queues)) return curr.queues === prev.queues;
  if (curr.queues.length !== prev.queues.length) return false;
  for (let i = 0; i < curr.queues.length; i++) {
    const qCurr = curr.queues[i];
    const qPrev = prev.queues[i];
    if (
      qCurr.id !== qPrev.id ||
      qCurr.songIds !== qPrev.songIds ||
      qCurr.queueBeforeShuffle !== qPrev.queueBeforeShuffle
    ) {
      return false;
    }
  }
  return true;
};

store.subscribe((state) => {
  const currentState = getCurrentStoreState(state as StoreSubscriptionState);

  if (!currentState?.localStorage) {
    return;
  }

  const currentLocal = currentState.localStorage;
  if (currentLocal === prevLocalStorage) {
    return;
  }

  const prevQueue = prevLocalStorage?.queue;
  const queueChanged = currentLocal.queue !== prevQueue;
  prevLocalStorage = currentLocal;

  if (queueChanged) {
    if (
      currentState.queueUpdateKind === 'position' &&
      isStructuralQueueEqual(currentLocal.queue, prevQueue)
    ) {
      // Position is persisted via 'nora:playback-queue-position'.
      // Structural arrays (songIds, queueBeforeShuffle) are unchanged,
      // so skip full serialization safely even if unknown writers touch state.
      return;
    }
    // Crash-recovery contract:
    // - Playback position: ALWAYS recovered (immediate tiny-key write per positionChange).
    // - Structural queue edits: best-effort. Debounced 500ms, flushed on
    //   beforeunload/visibilitychange. A hard kill inside the window can lose
    //   ≤500ms of structural edits.
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
    }, 500);
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
