import { useCallback } from 'react';

import type AudioPlayer from '../other/player';
import toggleSongIsFavorite from '../other/toggleSongIsFavorite';
import { dispatch, store } from '../store/store';
import storage from '../utils/localStorage';
import { useUserPreferences } from './useUserPreferences';

/**
 * Hook for managing playback settings (repeat, volume, mute, position, favorites, equalizer).
 *
 * This hook provides functions to control various playback settings including repeat modes, volume
 * control, mute state, song position seeking, favorite song toggling, and equalizer presets. All
 * settings are persisted to localStorage where appropriate.
 *
 * @example
 *   ```tsx
 *   const {
 *   toggleRepeat,
 *   toggleMutedState,
 *   updateVolume,
 *   updateSongPosition,
 *   toggleIsFavorite,
 *   updateEqualizerOptions
 *   } = usePlaybackSettings(player);
 *
 *   // Use in UI controls
 *   <button onClick={() => toggleRepeat()}>Repeat</button>
 *   <input onChange={(e) => updateVolume(e.target.value)} />
 *   updateEqualizerOptions({ preset: 'rock', bands: [...] });
 *   ```;
 *
 * @param player - The AudioPlayer or HTMLAudioElement instance
 * @returns Object containing playback setting functions
 */
export function usePlaybackSettings(player: AudioPlayer | HTMLAudioElement) {
  const { saveEqualizerPreset } = useUserPreferences();

  const toggleRepeat = useCallback((newState?: RepeatTypes) => {
    const repeatState =
      newState ||
      (store.state.player.isRepeating === 'false'
        ? 'repeat'
        : store.state.player.isRepeating === 'repeat'
          ? 'repeat-1'
          : 'false');

    dispatch({
      type: 'UPDATE_IS_REPEATING_STATE',
      data: repeatState
    });
  }, []);

  const toggleMutedState = useCallback((isMute?: boolean) => {
    if (isMute !== undefined) {
      if (isMute !== store.state.player.volume.isMuted) {
        dispatch({ type: 'UPDATE_MUTED_STATE', data: isMute });
      }
    } else {
      dispatch({ type: 'UPDATE_MUTED_STATE' });
    }
  }, []);

  const updateVolume = useCallback((volume: number) => {
    storage.playback.setVolumeOptions('value', volume);

    dispatch({
      type: 'UPDATE_VOLUME_VALUE',
      data: volume
    });
  }, []);

  const updateSongPosition = useCallback(
    (position: number) => {
      if (!Number.isFinite(position) || position < 0) return;
      if (!player) return;
      const d = player.duration;
      // Clamp position within [0, max]. If duration is finite and > 0, clamp to max(0, d - 0.1) so near-end clicks don't prematurely fire 'ended'
      const max = Number.isFinite(d) && d > 0 ? Math.max(0, d - 0.1) : position;
      const targetTime = Math.max(0, Math.min(position, max));

      // Guard against pre-metadata seek on HTMLAudioElement which throws InvalidStateError in browser
      if (
        'readyState' in player &&
        typeof player.readyState === 'number' &&
        player.readyState === 0
      ) {
        return;
      }

      try {
        if ('seek' in player && typeof player.seek === 'function') {
          player.seek(targetTime);
        } else {
          player.currentTime = targetTime;
        }
      } catch (err) {
        console.error('[usePlaybackSettings.updateSongPosition] Failed to seek:', err);
      }
    },
    [player]
  );

  const toggleIsFavorite = useCallback(
    (isFavorite?: boolean, onlyChangeCurrentSongData = false) => {
      toggleSongIsFavorite(
        store.state.currentSongData.songId,
        store.state.currentSongData.isAFavorite,
        isFavorite,
        onlyChangeCurrentSongData
      )
        .then((newFavorite) => {
          if (typeof newFavorite === 'boolean') {
            store.state.currentSongData.isAFavorite = newFavorite;
            return dispatch({
              type: 'TOGGLE_IS_FAVORITE_STATE',
              data: newFavorite
            });
          }
          return undefined;
        })
        .catch((err) => console.error(err));
    },
    []
  );

  const updateEqualizerOptions = useCallback(
    (options: Equalizer) => {
      saveEqualizerPreset(options);
    },
    [saveEqualizerPreset]
  );

  return {
    toggleRepeat,
    toggleMutedState,
    updateVolume,
    updateSongPosition,
    toggleIsFavorite,
    updateEqualizerOptions
  };
}
