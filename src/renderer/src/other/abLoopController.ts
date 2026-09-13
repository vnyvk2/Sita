export type AbLoopPhase = 'idle' | 'armed' | 'active';

export interface AbLoopState {
  phase: AbLoopPhase;
  pointA: number | null;
  pointB: number | null;
}

export interface SetPointResult {
  success: boolean;
  reason?: string;
  changed: boolean;
}

/** Minimum allowed loop duration in seconds to prevent audio engine stutter */
export const MIN_LOOP_DURATION = 0.25;

/** Unified boundary epsilon (30ms) across all quad-guard turnaround checks */
export const LOOP_EPSILON = 0.03;

/**
 * Pure state machine managing Nora's A-B Loop segment looper.
 *
 * States:
 * - 'idle': No loop points set.
 * - 'armed': Point A set; waiting for Point B.
 * - 'active': Both Point A and Point B set; audio actively loops [A, B].
 *
 * Invariants:
 * - Zero DOM / AudioContext dependencies — 100% unit testable in isolation.
 * - Idempotency: Duplicate calls with unchanged values return changed: false and emit no events.
 * - Direction-agnostic drag: setRange auto-swaps if start > end.
 * - Hotkey validation: setPointB strictly requires time > pointA (rejects instead of swapping).
 * - Unified epsilon: checkLoop uses `currentTime >= pointB - LOOP_EPSILON`.
 */
export class AbLoopController {
  private _phase: AbLoopPhase = 'idle';
  private _pointA: number | null = null;
  private _pointB: number | null = null;

  get state(): AbLoopState {
    return {
      phase: this._phase,
      pointA: this._pointA,
      pointB: this._pointB
    };
  }

  get phase(): AbLoopPhase {
    return this._phase;
  }

  get pointA(): number | null {
    return this._pointA;
  }

  get pointB(): number | null {
    return this._pointB;
  }

  isActive(): boolean {
    return this._phase === 'active' && this._pointA !== null && this._pointB !== null;
  }

  isArmed(): boolean {
    return this._phase === 'armed' && this._pointA !== null;
  }

  /**
   * Sets Point A (loop start). Transitions state to 'armed'.
   */
  setPointA(time: number, trackDuration: number): SetPointResult {
    if (!Number.isFinite(time) || time < 0) {
      return { success: false, reason: 'Invalid time for Point A', changed: false };
    }

    const duration = Number.isFinite(trackDuration) && trackDuration > 0 ? trackDuration : Infinity;
    const maxA = Math.max(0, duration - MIN_LOOP_DURATION);
    const clampedA = Math.max(0, Math.min(time, maxA));

    // Idempotency
    if (this._phase === 'armed' && this._pointA === clampedA && this._pointB === null) {
      return { success: true, changed: false };
    }

    this._phase = 'armed';
    this._pointA = clampedA;
    this._pointB = null;
    return { success: true, changed: true };
  }

  /**
   * Sets Point B (loop end). Requires Point A to be set.
   * Hotkey semantics: strictly rejects if time <= pointA (does not swap).
   */
  setPointB(time: number, trackDuration: number): SetPointResult {
    if ((this._phase !== 'armed' && this._phase !== 'active') || this._pointA === null) {
      return { success: false, reason: 'Point A must be set before Point B', changed: false };
    }

    if (!Number.isFinite(time)) {
      return { success: false, reason: 'Invalid time for Point B', changed: false };
    }

    const duration = Number.isFinite(trackDuration) && trackDuration > 0 ? trackDuration : Infinity;
    const clampedB = Math.max(0, Math.min(time, duration));

    if (clampedB <= this._pointA) {
      return { success: false, reason: 'Point B must come after Point A', changed: false };
    }

    if (clampedB - this._pointA < MIN_LOOP_DURATION) {
      return {
        success: false,
        reason: `Loop duration must be at least ${MIN_LOOP_DURATION} seconds`,
        changed: false
      };
    }

    // Idempotency
    if (this._phase === 'active' && this._pointB === clampedB) {
      return { success: true, changed: false };
    }

    this._phase = 'active';
    this._pointB = clampedB;
    return { success: true, changed: true };
  }

  /**
   * Sets both Point A and Point B atomically (e.g. from Shift+Drag on waveform).
   * Direction-agnostic: automatically normalizes min/max if start > end.
   */
  setRange(start: number, end: number, trackDuration: number): SetPointResult {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { success: false, reason: 'Invalid range boundaries', changed: false };
    }

    let min = Math.min(start, end);
    let max = Math.max(start, end);

    const duration = Number.isFinite(trackDuration) && trackDuration > 0 ? trackDuration : Infinity;
    min = Math.max(0, Math.min(min, duration));
    max = Math.max(0, Math.min(max, duration));

    if (max - min < MIN_LOOP_DURATION) {
      return {
        success: false,
        reason: `Loop duration must be at least ${MIN_LOOP_DURATION} seconds`,
        changed: false
      };
    }

    // Idempotency
    if (this._phase === 'active' && this._pointA === min && this._pointB === max) {
      return { success: true, changed: false };
    }

    this._phase = 'active';
    this._pointA = min;
    this._pointB = max;
    return { success: true, changed: true };
  }

  /**
   * Checks if playback has crossed the Point B boundary.
   * Returns shouldSeek: true with targetTime: pointA when currentTime >= pointB - LOOP_EPSILON.
   */
  checkLoop(currentTime: number): { shouldSeek: boolean; targetTime: number } {
    if (this._phase !== 'active' || this._pointA === null || this._pointB === null) {
      return { shouldSeek: false, targetTime: 0 };
    }

    if (currentTime >= this._pointB - LOOP_EPSILON) {
      return { shouldSeek: true, targetTime: this._pointA };
    }

    return { shouldSeek: false, targetTime: 0 };
  }

  /**
   * Checks if a seek target lies outside the active loop range (plus tolerance).
   */
  isPositionOutside(time: number, tolerance = 0.05): boolean {
    if (this._phase !== 'active' || this._pointA === null || this._pointB === null) {
      return false;
    }
    return time < this._pointA - tolerance || time > this._pointB + tolerance;
  }

  /**
   * Clears the active loop or armed state.
   */
  clear(): { changed: boolean } {
    if (this._phase === 'idle' && this._pointA === null && this._pointB === null) {
      return { changed: false };
    }
    this._phase = 'idle';
    this._pointA = null;
    this._pointB = null;
    return { changed: true };
  }

  /**
   * Handler for track change / new song load.
   */
  onTrackChange(): { changed: boolean } {
    return this.clear();
  }
}
