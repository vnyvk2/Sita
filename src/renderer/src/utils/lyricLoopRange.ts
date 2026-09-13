import { MIN_LOOP_DURATION } from '../other/abLoopController';

export const DEFAULT_PRE_ROLL = 0.15;
export const DEFAULT_POST_ROLL = 0.25;

export interface LyricLoopRangeParams {
  syncedStart: number;
  syncedEnd: number;
  prevEnd?: number;
  nextStart?: number;
  songDuration?: number;
  preRoll?: number;
  postRoll?: number;
}

export interface LyricLoopRangeResult {
  success: boolean;
  start: number;
  end: number;
  reason?: string;
}

/**
 * Computes gap-aware A-B loop boundaries for a synced lyric line.
 *
 * Applies pre-roll (default 150ms) and post-roll (default 250ms) to ensure natural musical
 * turnarounds without clipping attack transients/consonants or reverb decay tails.
 *
 * Features strict overlap guards (Regime 3):
 *
 * - If prevEnd > syncedStart (duet / overlapping lines), start is clamped to syncedStart (zero
 *   pre-roll, never cuts into line).
 * - If nextStart < syncedEnd, end is clamped to syncedEnd (zero post-roll, never cuts off line).
 * - Clamped within [0, songDuration].
 * - Enforces MIN_LOOP_DURATION (0.25s).
 */
export function computeLyricLoopRange(params: LyricLoopRangeParams): LyricLoopRangeResult {
  const {
    syncedStart,
    syncedEnd,
    prevEnd,
    nextStart,
    songDuration,
    preRoll = DEFAULT_PRE_ROLL,
    postRoll = DEFAULT_POST_ROLL
  } = params;

  if (!Number.isFinite(syncedStart) || !Number.isFinite(syncedEnd) || syncedEnd <= syncedStart) {
    return { success: false, start: 0, end: 0, reason: 'Invalid lyric line timestamps' };
  }

  const duration =
    Number.isFinite(songDuration) && (songDuration as number) > 0
      ? (songDuration as number)
      : Infinity;

  // Calculate padded start with pre-roll
  const rawA =
    prevEnd !== undefined ? Math.max(prevEnd, syncedStart - preRoll) : syncedStart - preRoll;
  // Clamp between 0 and syncedStart: never start after the line begins (handles overlapping lines where prevEnd > syncedStart)
  const start = Math.max(0, Math.min(rawA, syncedStart));

  // Calculate padded end with post-roll
  const rawB =
    nextStart !== undefined ? Math.min(nextStart, syncedEnd + postRoll) : syncedEnd + postRoll;
  // Clamp between syncedEnd and duration: never end before the line finishes (handles overlapping lines where nextStart < syncedEnd)
  const end = Math.min(duration, Math.max(rawB, syncedEnd));

  if (end - start < MIN_LOOP_DURATION) {
    return {
      success: false,
      start,
      end,
      reason: `Loop duration must be at least ${MIN_LOOP_DURATION} seconds`
    };
  }

  return { success: true, start, end };
}
