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

store.subscribe((state) => {
  const currentState = getCurrentStoreState(state as StoreSubscriptionState);

  if (!currentState?.localStorage) {
    return;
  }

  storage.setLocalStorage(currentState.localStorage);
});
