import { Store, useStore } from '@tanstack/react-store';
import { useEffect, useRef } from 'react';

import { store } from '../store/store';
import { useVisualAssetsState } from './useVisualSlot';

export const dynamicIconStore = new Store<{
  activeDynamicArtworkUrl: string | null;
}>({
  activeDynamicArtworkUrl: null
});

export const DYNAMIC_ICON_DEBOUNCE_MS = 3500;

/**
 * Manages the dynamic now-playing app icon lifecycle across in-app UI and native OS surfaces.
 *
 * Rules: 1. Initial track: Applies immediately when dynamic mode is enabled and a song is already
 * loaded, or when the first song loads while enabled (no 3.5s delay). 2. Track transitions:
 * Debounces subsequent song changes for 3.5s, keeping the prior artwork visible to prevent icon
 * thrashing during rapid skipping. 3. Artwork validity: Distinguishes genuine artwork from default
 * placeholders (`isDefaultArtwork`). Missing or default artwork restores the user's selected static
 * icon after stabilization. 4. Playback state: Stays active across pause and resume. 5.
 * Invalidation: Restores the user's selected static icon immediately when dynamic mode is disabled
 * or when the playback queue is cleared.
 */
export function useDynamicAppIcon(): { activeDynamicArtworkUrl: string | null } {
  const { data: visualAssetsState } = useVisualAssetsState();
  const isDynamicEnabled = Boolean(visualAssetsState?.config?.dynamicNowPlayingIcon);

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const currentSongId = currentSongData?.songId ?? null;

  const activeArtworkUrl = useStore(dynamicIconStore, (s) => s.activeDynamicArtworkUrl);

  const hasInitialSyncedRef = useRef(false);
  const activeSongIdRef = useRef<number | null>(null);
  const appliedArtworkSrcRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const applyArtworkToStoreAndNative = (src: string | null) => {
    dynamicIconStore.setState(() => ({ activeDynamicArtworkUrl: src }));
    appliedArtworkSrcRef.current = src;
    window.api?.visualAssets
      ?.setDynamicNowPlayingIcon?.(src)
      .then((res) => {
        // Rollback optimistic store only if this response is for the currently applied source
        // and main process rejected artwork and reverted to static
        if (
          appliedArtworkSrcRef.current === src &&
          res &&
          !res.applied &&
          res.reason !== 'stale_request'
        ) {
          dynamicIconStore.setState(() => ({ activeDynamicArtworkUrl: null }));
          appliedArtworkSrcRef.current = null;
        }
      })
      .catch(() => {
        if (appliedArtworkSrcRef.current === src) {
          dynamicIconStore.setState(() => ({ activeDynamicArtworkUrl: null }));
          appliedArtworkSrcRef.current = null;
        }
      });
  };

  useEffect(() => {
    // 1. Dynamic mode is disabled -> restore static icon immediately and reset refs
    if (!isDynamicEnabled) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      hasInitialSyncedRef.current = false;
      activeSongIdRef.current = null;
      appliedArtworkSrcRef.current = null;
      dynamicIconStore.setState(() => ({ activeDynamicArtworkUrl: null }));
      window.api?.visualAssets?.setDynamicNowPlayingIcon?.(null).catch(() => {});
      return;
    }

    // 2. Queue cleared or no track loaded -> restore static icon immediately
    if (currentSongId == null) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      activeSongIdRef.current = null;
      appliedArtworkSrcRef.current = null;
      dynamicIconStore.setState(() => ({ activeDynamicArtworkUrl: null }));
      window.api?.visualAssets?.setDynamicNowPlayingIcon?.(null).catch(() => {});
      return;
    }

    const hasGenuineArtwork =
      currentSongData?.artworkPaths != null
        ? !currentSongData.artworkPaths.isDefaultArtwork &&
          Boolean(currentSongData.artworkPaths.artworkPath)
        : Boolean(currentSongData?.artworkPath);
    const resolvedArtworkSrc = hasGenuineArtwork
      ? currentSongData?.artworkPaths?.optimizedArtworkPath ||
        currentSongData?.artworkPaths?.artworkPath ||
        currentSongData?.artworkPath ||
        null
      : null;

    // 3. First song loaded or initial sync while dynamic mode is enabled
    // Apply immediately without waiting for the 3.5s debounce timer
    if (!hasInitialSyncedRef.current || activeSongIdRef.current === null) {
      hasInitialSyncedRef.current = true;
      activeSongIdRef.current = currentSongId;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      applyArtworkToStoreAndNative(resolvedArtworkSrc);
      return;
    }

    // 4. Same track: check if artwork hydrated after initial metadata load (Edge Case 1)
    if (activeSongIdRef.current === currentSongId) {
      if (appliedArtworkSrcRef.current !== resolvedArtworkSrc) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        applyArtworkToStoreAndNative(resolvedArtworkSrc);
      }
      return;
    }

    // 5. Subsequent track transition -> keep prior artwork and debounce for 3.5s
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const targetSongId = currentSongId;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const latestSong = store.state.currentSongData;

      // Ensure that this track is still the current active track after the delay
      if (latestSong?.songId === targetSongId) {
        activeSongIdRef.current = targetSongId;
        const targetHasGenuineArtwork =
          latestSong?.artworkPaths != null
            ? !latestSong.artworkPaths.isDefaultArtwork &&
              Boolean(latestSong.artworkPaths.artworkPath)
            : Boolean(latestSong?.artworkPath);
        const targetArtworkSrc = targetHasGenuineArtwork
          ? latestSong?.artworkPaths?.optimizedArtworkPath ||
            latestSong?.artworkPaths?.artworkPath ||
            latestSong?.artworkPath ||
            null
          : null;

        applyArtworkToStoreAndNative(targetArtworkSrc);
      }
    }, DYNAMIC_ICON_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    isDynamicEnabled,
    currentSongId,
    currentSongData?.artworkPath,
    currentSongData?.artworkPaths,
    currentSongData?.artworkPaths?.artworkPath,
    currentSongData?.artworkPaths?.optimizedArtworkPath,
    currentSongData?.artworkPaths?.isDefaultArtwork
  ]);

  return { activeDynamicArtworkUrl: activeArtworkUrl };
}
