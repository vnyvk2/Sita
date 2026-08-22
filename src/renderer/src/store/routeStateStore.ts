import { Store } from '@tanstack/react-store';

export const DEFAULT_ROUTE_STATE_DATA: RouteStates = {
  'lyrics-editor': {
    songId: 0,
    lyrics: []
  }
};

export const routeStateStore = new Store(DEFAULT_ROUTE_STATE_DATA);

export const updateRouteState = <T extends Routes>(route: T, data: RouteStates[T]) =>
  routeStateStore.setState((state) => ({ ...state, [route]: data }));

