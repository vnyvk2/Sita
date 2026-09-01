import calculateTimeFromSeconds from './calculateTimeFromSeconds';

export type QueueDurationResult = {
  suffixDurations: Float64Array | null;
  queueDuration: string;
};

/**
 * Computes the total queue duration and a suffix sum array in a single O(N) backward pass.
 *
 * Suffix array allows O(1) constant-time querying of remaining playback duration from any active
 * song position: remaining = suffixDurations[position].
 *
 * @param songIds - Array of song IDs in playback order
 * @param queuedSongsMap - Map of song metadata containing duration
 */
export function calculateQueueSuffixDurations(
  songIds: number[],
  queuedSongsMap: Map<number, { duration?: number } | undefined>
): QueueDurationResult {
  if (songIds.length === 0 || queuedSongsMap.size === 0) {
    return { suffixDurations: null, queueDuration: '0:00' };
  }

  const len = songIds.length;
  const suffix = new Float64Array(len);
  let running = 0;

  for (let i = len - 1; i >= 0; i -= 1) {
    const song = queuedSongsMap.get(songIds[i]);
    if (song && typeof song.duration === 'number') {
      running += song.duration;
    }
    suffix[i] = running;
  }

  return {
    suffixDurations: suffix,
    queueDuration: calculateTimeFromSeconds(running).timeString
  };
}

/** Returns remaining queue duration formatted string from the active playback position in O(1) time. */
export function getRemainingQueueDuration(
  suffixDurations: Float64Array | null,
  activeQueuePosition: number
): string {
  if (!suffixDurations || suffixDurations.length === 0) return '0:00';
  const pos = Math.max(0, Math.min(activeQueuePosition, suffixDurations.length - 1));
  const remaining = suffixDurations[pos] ?? 0;
  return calculateTimeFromSeconds(remaining).timeString;
}
