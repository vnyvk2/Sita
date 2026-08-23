import AudioPlayer from '../other/player';
import { PositionTimerScheduler } from '../other/positionScheduler';
import { getQueuesManager } from '../other/queuesManager';

declare global {
  interface Window {
    __NORA_AUDIO_PLAYER__?: AudioPlayer | null;
  }
}

// Module-level singletons - initialized on first hook call
let playerInstance: AudioPlayer | null = null;
let schedulerInstance: PositionTimerScheduler | null = null;

/**
 * Custom hook to manage the AudioPlayer singleton instance. Initializes the player with the shared
 * PlayerQueue if it hasn't been created yet.
 *
 * @returns The singleton AudioPlayer instance
 */
export function useAudioPlayer() {
  const manager = getQueuesManager();

  if (!playerInstance) {
    if (typeof window !== 'undefined' && window.__NORA_AUDIO_PLAYER__) {
      playerInstance = window.__NORA_AUDIO_PLAYER__;
    } else {
      playerInstance = new AudioPlayer(manager);
      if (typeof window !== 'undefined') {
        window.__NORA_AUDIO_PLAYER__ = playerInstance;
      }
    }
    if (!schedulerInstance) {
      schedulerInstance = new PositionTimerScheduler(playerInstance);
    }
  }

  return playerInstance;
}
