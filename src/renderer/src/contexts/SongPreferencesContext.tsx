import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from '@tanstack/react-store';
import { store } from '@renderer/store/store';
import { resolveSongViewMode, type SongViewMode } from '@renderer/utils/songViewMode';

export interface SongPreferences {
  showTrackNumberAsSongIndex: boolean;
  showEqualizerOnTracklist: boolean;
  isAnimationDisabled: boolean;
  doNotShowBlacklistSongConfirm: boolean;
  bodyBackgroundImage: boolean;
  isCompactSongView: boolean;
  songViewMode: SongViewMode;
  pinnedSubFilterTools: string[];
}

export const defaultSongPreferences: SongPreferences = {
  showTrackNumberAsSongIndex: false,
  showEqualizerOnTracklist: true,
  isAnimationDisabled: false,
  doNotShowBlacklistSongConfirm: false,
  bodyBackgroundImage: false,
  isCompactSongView: false,
  songViewMode: 'normal',
  pinnedSubFilterTools: ['compactView', 'language', 'genre']
};

export const SongPreferencesContext = createContext<SongPreferences>(defaultSongPreferences);

export const useSongPreferences = (): SongPreferences => useContext(SongPreferencesContext);

export function SongPreferencesProvider({ children }: { children: ReactNode }) {
  const showTrackNumberAsSongIndex = useStore(
    store,
    (state) => Boolean(state.localStorage?.preferences?.showTrackNumberAsSongIndex)
  );
  const showEqualizerOnTracklist = useStore(
    store,
    (state) => state.localStorage?.preferences?.showEqualizerOnTracklist ?? true
  );
  const isAnimationDisabled = useStore(
    store,
    (state) =>
      Boolean(state.localStorage?.preferences?.isReducedMotion) ||
      Boolean(
        state.isOnBatteryPower && state.localStorage?.preferences?.removeAnimationsOnBatteryPower
      )
  );
  const doNotShowBlacklistSongConfirm = useStore(
    store,
    (state) => Boolean(state.localStorage?.preferences?.doNotShowBlacklistSongConfirm)
  );
  const bodyBackgroundImage = useStore(store, (state) => Boolean(state.bodyBackgroundImage));
  const rawSongViewMode = useStore(
    store,
    (state) => state.localStorage?.preferences?.songViewMode
  );
  const rawIsCompact = useStore(
    store,
    (state) => state.localStorage?.preferences?.isCompactSongView
  );
  const songViewMode = resolveSongViewMode(rawSongViewMode, rawIsCompact);
  const isCompactSongView = songViewMode === 'compact';

  const pinnedSubFilterTools = useStore(
    store,
    (state) => state.localStorage?.preferences?.pinnedSubFilterTools ?? defaultSongPreferences.pinnedSubFilterTools
  );

  const value = useMemo(
    () => ({
      showTrackNumberAsSongIndex,
      showEqualizerOnTracklist,
      isAnimationDisabled,
      doNotShowBlacklistSongConfirm,
      bodyBackgroundImage,
      isCompactSongView,
      songViewMode,
      pinnedSubFilterTools
    }),
    [
      showTrackNumberAsSongIndex,
      showEqualizerOnTracklist,
      isAnimationDisabled,
      doNotShowBlacklistSongConfirm,
      bodyBackgroundImage,
      isCompactSongView,
      songViewMode,
      pinnedSubFilterTools
    ]
  );

  return (
    <SongPreferencesContext.Provider value={value}>
      {children}
    </SongPreferencesContext.Provider>
  );
}
