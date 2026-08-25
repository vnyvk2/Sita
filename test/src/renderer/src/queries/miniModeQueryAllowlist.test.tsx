import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { useAppUpdates } from '@renderer/hooks/useAppUpdates';
import { useUserPreferences } from '@renderer/hooks/useUserPreferences';
import { userPreferencesQuery } from '@renderer/queries/userPreferences';
import { dispatch, store } from '@renderer/store/store';
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vitest workers may not expose file:// import.meta.url URLs, so resolve from the project root
const AppSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/App.tsx'), 'utf-8');

/**
 * Regression guard: Mini player mode must keep the renderer passive.
 *
 * Allowed activity in Mini mode:
 *
 * - SettingsQuery.all (mini player UI settings)
 * - SongQuery.queue (queue display)
 * - LyricsQuery (lyrics panels)
 *
 * Disallowed in Mini mode (asserted here at the IPC/network boundary):
 *
 * - UserPreferencesQuery.* (5 preference DB round-trips)
 * - Remote changelog polling (useAppUpdates timers/prompt)
 *
 * Note: collection undo/redo shortcuts moved into the playlist route
 * (useCollectionMutations), which is unmounted entirely in mini mode, so they
 * no longer require a global playerType gate.
 */

const changePromptMenuDataMock = vi.fn();

const settingsHelpersMocks = {
  getUserKeyboardShortcuts: vi.fn(),
  getUserEqualizerPreset: vi.fn(),
  getIgnoredArtists: vi.fn(),
  getIgnoredFeaturingArtists: vi.fn(),
  getIgnoredDuplicateMetadata: vi.fn()
};

vi.mock('@renderer/api/CollectionClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('@renderer/api/CollectionClient')>();
  return {
    ...original,
    CollectionClient: {
      ...original.CollectionClient,
      undo: vi.fn().mockResolvedValue(undefined),
      redo: vi.fn().mockResolvedValue(undefined)
    }
  };
});

const setPlayerType = (type: 'normal' | 'mini' | 'full') => {
  dispatch({ type: 'UPDATE_PLAYER_TYPE', data: type });
};

describe('Mini Mode Query Allowlist (regression guard)', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const Wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return Wrapper;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setPlayerType('normal');

    (window as unknown as { api: Record<string, unknown> }).api = {
      ...((window as unknown as { api?: Record<string, unknown> }).api ?? {}),
      properties: { isInDevelopment: false },
      settingsHelpers: settingsHelpersMocks
    };

    settingsHelpersMocks.getUserKeyboardShortcuts.mockResolvedValue([]);
    settingsHelpersMocks.getUserEqualizerPreset.mockResolvedValue({});
    settingsHelpersMocks.getIgnoredArtists.mockResolvedValue([]);
    settingsHelpersMocks.getIgnoredFeaturingArtists.mockResolvedValue([]);
    settingsHelpersMocks.getIgnoredDuplicateMetadata.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    setPlayerType('normal');
  });

  describe('userPreferencesQuery family', () => {
    it('performs zero preference lookups when gated for mini mode', async () => {
      setPlayerType('mini');
      const Wrapper = createWrapper();

      renderHook(() => useUserPreferences({ enabled: store.state.playerType !== 'mini' }), {
        wrapper: Wrapper
      });

      // Allow any (incorrect) fetch attempts to settle
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      expect(settingsHelpersMocks.getUserKeyboardShortcuts).not.toHaveBeenCalled();
      expect(settingsHelpersMocks.getUserEqualizerPreset).not.toHaveBeenCalled();
      expect(settingsHelpersMocks.getIgnoredArtists).not.toHaveBeenCalled();
      expect(settingsHelpersMocks.getIgnoredFeaturingArtists).not.toHaveBeenCalled();
      expect(settingsHelpersMocks.getIgnoredDuplicateMetadata).not.toHaveBeenCalled();

      const cachedPreferenceData = queryClient
        .getQueryCache()
        .getAll()
        .filter(
          (query) =>
            query.queryKey[0] === userPreferencesQuery.keyboardShortcuts.queryKey[0] &&
            query.state.status === 'success'
        );
      expect(cachedPreferenceData).toHaveLength(0);
    });

    it('fetches all five preference queries when not in mini mode (control case)', async () => {
      const Wrapper = createWrapper();

      renderHook(() => useUserPreferences(), { wrapper: Wrapper });

      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      expect(settingsHelpersMocks.getUserKeyboardShortcuts).toHaveBeenCalledTimes(1);
      expect(settingsHelpersMocks.getUserEqualizerPreset).toHaveBeenCalledTimes(1);
      expect(settingsHelpersMocks.getIgnoredArtists).toHaveBeenCalledTimes(1);
      expect(settingsHelpersMocks.getIgnoredFeaturingArtists).toHaveBeenCalledTimes(1);
      expect(settingsHelpersMocks.getIgnoredDuplicateMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe('remote changelog polling (useAppUpdates)', () => {
    const stubChangelogFetch = () =>
      vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ status: 200, text: () => Promise.resolve('') } as Response);

    it('never contacts the remote changelog while gated for mini mode', async () => {
      vi.useFakeTimers();
      const fetchSpy = stubChangelogFetch();
      setPlayerType('mini');

      renderHook(() =>
        useAppUpdates({
          changePromptMenuData: changePromptMenuDataMock,
          isOnline: true,
          isEnabled: store.state.playerType !== 'mini'
        })
      );

      // Advance well past the 5s startup check AND multiple 15-minute polling intervals
      await vi.advanceTimersByTimeAsync(1000 * 60 * 45);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(changePromptMenuDataMock).not.toHaveBeenCalled();
    });

    it('checks for updates after the startup delay when not gated (control case)', async () => {
      vi.useFakeTimers();
      const fetchSpy = stubChangelogFetch();

      renderHook(() =>
        useAppUpdates({
          changePromptMenuData: changePromptMenuDataMock,
          isOnline: true,
          isEnabled: true
        })
      );

      await vi.advanceTimersByTimeAsync(5100);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not repeat the startup changelog check across mini/normal toggles', async () => {
      vi.useFakeTimers();
      const fetchSpy = stubChangelogFetch();

      const { rerender } = renderHook(
        ({ isEnabled }: { isEnabled: boolean }) =>
          useAppUpdates({
            changePromptMenuData: changePromptMenuDataMock,
            isOnline: true,
            isEnabled
          }),
        { initialProps: { isEnabled: true } }
      );

      // Startup check fires once
      await vi.advanceTimersByTimeAsync(5100);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Enter mini (gates polling) and return to normal within the same session
      rerender({ isEnabled: false });
      rerender({ isEnabled: true });

      // Advance 10 minutes: periodic interval (15 min) has not fired yet, and the startup
      // check must NOT re-run just because the hook was re-enabled
      await vi.advanceTimersByTimeAsync(1000 * 60 * 10);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('App wiring guard', () => {
    it('gates user preferences and app updates on non-mini player type', () => {
      // The hook-level contracts above only hold if App actually wires the gates to playerType.
      // This assertion fails if someone removes the wiring from App.tsx.
      expect(AppSource).toMatch(
        /useUserPreferences\(\{\s*enabled:\s*playerType\s*!==\s*'mini'\s*\}\)/
      );
      expect(AppSource).toMatch(/isEnabled:\s*playerType\s*!==\s*'mini'/);
    });
  });
});
