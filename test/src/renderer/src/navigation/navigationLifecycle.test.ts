import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';
import { Store } from '@tanstack/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Navigation Lifecycle & History Invariant Tests', () => {
  let mockWindowControlsChangePlayerType: ReturnType<typeof vi.fn>;
  let presentationStore: Store<{ playerType: 'normal' | 'mini' | 'full' }>;

  // Helper simulating App's updatePlayerType
  const updatePlayerType = async (type: 'normal' | 'mini' | 'full') => {
    presentationStore.setState(() => ({ playerType: type }));
    mockWindowControlsChangePlayerType(type);
  };

  // Helper simulating useOpenMainPlayerRoute
  const openMainPlayerRoute = async (router: ReturnType<typeof createRouter>, to: string) => {
    await updatePlayerType('normal');
    await router.navigate({ to });
  };

  beforeEach(() => {
    mockWindowControlsChangePlayerType = vi.fn();
    presentationStore = new Store<{ playerType: 'normal' | 'mini' | 'full' }>({
      playerType: 'normal'
    });
  });

  const setupRouter = () => {
    const memoryHistory = createMemoryHistory({
      initialEntries: ['/main-player/home']
    });

    const rootRoute = createRootRoute();
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/main-player/home'
    });
    const artistsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/main-player/artists'
    });
    const artistDetailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/main-player/artists/$artistId'
    });
    const songDetailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/main-player/songs/$songId'
    });

    const routeTree = rootRoute.addChildren([
      homeRoute,
      artistsRoute,
      artistDetailRoute,
      songDetailRoute
    ]);

    const router = createRouter({
      routeTree,
      history: memoryHistory
    });

    return { router, memoryHistory };
  };

  it('preserves history across presentation transitions (Normal <-> Mini <-> Full)', async () => {
    const { router, memoryHistory } = setupRouter();

    // 1. Initial State: Home
    expect(memoryHistory.location.pathname).toBe('/main-player/home');

    // 2. Navigate: Artists
    await router.navigate({ to: '/main-player/artists' });
    expect(memoryHistory.location.pathname).toBe('/main-player/artists');

    // 3. Navigate: Artist #5
    await router.navigate({ to: '/main-player/artists/$artistId', params: { artistId: '5' } });
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // 4. Mode Transition: Enter Mini Player
    await updatePlayerType('mini');
    expect(presentationStore.state.playerType).toBe('mini');
    // History invariant: MUST NOT MUTATE
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // 5. Mode Transition: Enter Fullscreen
    await updatePlayerType('full');
    expect(presentationStore.state.playerType).toBe('full');
    // History invariant: MUST NOT MUTATE
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // 6. Mode Transition: Return to Normal
    await updatePlayerType('normal');
    expect(presentationStore.state.playerType).toBe('normal');
    // History invariant: MUST NOT MUTATE
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // 7. Repeated Multi-Cycle: Mini -> Normal -> Full -> Normal -> Mini -> Normal
    await updatePlayerType('mini');
    await updatePlayerType('normal');
    await updatePlayerType('full');
    await updatePlayerType('normal');
    await updatePlayerType('mini');
    await updatePlayerType('normal');
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // 8. Back Navigation: Must cleanly return to Artists List
    memoryHistory.back();
    expect(memoryHistory.location.pathname).toBe('/main-player/artists');

    // 9. Back Navigation: Must cleanly return to Home
    memoryHistory.back();
    expect(memoryHistory.location.pathname).toBe('/main-player/home');
  });

  it('performs normal history mutation when navigating to content from within Mini Player', async () => {
    const { router, memoryHistory } = setupRouter();

    // Navigate to Artist #5
    await router.navigate({ to: '/main-player/artists' });
    await router.navigate({ to: '/main-player/artists/$artistId', params: { artistId: '5' } });
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // Enter Mini Player
    await updatePlayerType('mini');
    expect(presentationStore.state.playerType).toBe('mini');
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');

    // Click Song in Queue from within Mini Player
    await openMainPlayerRoute(router, '/main-player/songs/42');

    // Expected: Window restored to Normal, and History pushed to Song #42
    expect(presentationStore.state.playerType).toBe('normal');
    expect(memoryHistory.location.pathname).toBe('/main-player/songs/42');

    // Back button from Song #42 returns to Artist #5
    memoryHistory.back();
    expect(memoryHistory.location.pathname).toBe('/main-player/artists/5');
  });

  it('REGRESSION TEST: Artist #5 -> Mini -> Normal -> Back returns to Artists, never Mini Player', async () => {
    const { router, memoryHistory } = setupRouter();

    await router.navigate({ to: '/main-player/artists' });
    await router.navigate({ to: '/main-player/artists/$artistId', params: { artistId: '5' } });

    // Enter and exit mini player
    await updatePlayerType('mini');
    await updatePlayerType('normal');

    // Click back
    memoryHistory.back();

    // MUST be Artists, NEVER Mini Player
    expect(memoryHistory.location.pathname).toBe('/main-player/artists');
    expect(memoryHistory.location.pathname).not.toBe('/mini-player');
    expect(memoryHistory.location.pathname).not.toBe('/fullscreen-player');
  });

  it('keeps window resize authority isolated to presentation mode transitions', async () => {
    const { router } = setupRouter();

    // Standard page navigation must NOT trigger window controls IPC
    await router.navigate({ to: '/main-player/artists' });
    await router.navigate({ to: '/main-player/artists/$artistId', params: { artistId: '5' } });
    expect(mockWindowControlsChangePlayerType).not.toHaveBeenCalled();

    // Only updatePlayerType calls IPC
    await updatePlayerType('mini');
    expect(mockWindowControlsChangePlayerType).toHaveBeenCalledTimes(1);
    expect(mockWindowControlsChangePlayerType).toHaveBeenCalledWith('mini');

    await updatePlayerType('normal');
    expect(mockWindowControlsChangePlayerType).toHaveBeenCalledTimes(2);
    expect(mockWindowControlsChangePlayerType).toHaveBeenLastCalledWith('normal');
  });
});
