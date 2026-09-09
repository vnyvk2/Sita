import {
  calculateEffectiveTriggerTime,
  generateEqualPowerFadeInCurve,
  generateEqualPowerFadeOutCurve
} from './crossfadeCurves';

export type CrossfadeState = 'IDLE' | 'PRELOADING' | 'READY' | 'FADING' | 'CANCELLED';

export interface CrossfadeDelegate {
  getCrossfadeDuration(): number;
  getTrackInfo(): {
    duration: number;
    currentTime: number;
    playbackRate: number;
    repeatMode: 'off' | 'one' | 'all';
  };
  getNextTrackId(): number | null;
  preloadTrack(trackId: number, sessionId: number): Promise<boolean>;
  startFade(params: {
    sessionId: number;
    incomingTrackId: number;
    clampedFadeDuration: number;
    fadeOutCurve: Float32Array;
    fadeInCurve: Float32Array;
  }): Promise<void>;
  onFadeComplete(sessionId: number, incomingTrackId: number): void;
  onFadeCancel(sessionId: number): void;
}

export class CrossfadeScheduler {
  private state: CrossfadeState = 'IDLE';
  private currentSessionId: number = 0;
  private preloadedTrackId: number | null = null;
  private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private delegate: CrossfadeDelegate;

  constructor(delegate: CrossfadeDelegate) {
    this.delegate = delegate;
  }

  public getState(): CrossfadeState {
    return this.state;
  }

  public getSessionId(): number {
    return this.currentSessionId;
  }

  public getPreloadedTrackId(): number | null {
    return this.preloadedTrackId;
  }

  /**
   * Called on every time update (or position tick) of the currently playing audio.
   */
  public async onTimeUpdate(currentTime: number): Promise<void> {
    const requestedDuration = this.delegate.getCrossfadeDuration();
    if (requestedDuration <= 0) {
      if (this.state !== 'IDLE') {
        this.cancel();
      }
      return;
    }

    const { duration, playbackRate, repeatMode } = this.delegate.getTrackInfo();

    // Repeat 'one' bypasses crossfade
    if (repeatMode === 'one') {
      if (this.state !== 'IDLE') {
        this.cancel();
      }
      return;
    }

    const trigger = calculateEffectiveTriggerTime(duration, requestedDuration, playbackRate);
    if (!trigger.canCrossfade) {
      if (this.state !== 'IDLE') {
        this.cancel();
      }
      return;
    }

    // 1. Check Preload Trigger
    if (this.state === 'IDLE' && currentTime >= trigger.preloadTime && currentTime < trigger.triggerTime) {
      const nextTrackId = this.delegate.getNextTrackId();
      if (nextTrackId === null) {
        return; // At end of queue with repeat off
      }

      this.state = 'PRELOADING';
      const sessionId = ++this.currentSessionId;
      this.preloadedTrackId = nextTrackId;

      try {
        const success = await this.delegate.preloadTrack(nextTrackId, sessionId);
        if (this.currentSessionId === sessionId && this.state === 'PRELOADING') {
          if (success) {
            this.state = 'READY';
          } else {
            this.state = 'IDLE';
            this.preloadedTrackId = null;
          }
        }
      } catch {
        if (this.currentSessionId === sessionId) {
          this.state = 'IDLE';
          this.preloadedTrackId = null;
        }
      }
      return;
    }

    // 2. Check Fade Start Trigger
    if ((this.state === 'READY' || this.state === 'PRELOADING') && currentTime >= trigger.triggerTime) {
      const nextTrackId = this.delegate.getNextTrackId();
      if (nextTrackId === null || (this.preloadedTrackId !== null && nextTrackId !== this.preloadedTrackId)) {
        // Queue mutated while preparing; abort crossfade
        this.cancel();
        return;
      }

      this.state = 'FADING';
      const sessionId = this.currentSessionId;
      const incomingId = nextTrackId;
      const fadeOutCurve = generateEqualPowerFadeOutCurve();
      const fadeInCurve = generateEqualPowerFadeInCurve();

      await this.delegate.startFade({
        sessionId,
        incomingTrackId: incomingId,
        clampedFadeDuration: trigger.clampedFadeDuration,
        fadeOutCurve,
        fadeInCurve
      });

      if (this.fadeTimeoutId) {
        clearTimeout(this.fadeTimeoutId);
      }

      this.fadeTimeoutId = setTimeout(() => {
        if (this.currentSessionId === sessionId && this.state === 'FADING') {
          this.state = 'IDLE';
          this.preloadedTrackId = null;
          this.fadeTimeoutId = null;
          this.delegate.onFadeComplete(sessionId, incomingId);
        }
      }, trigger.clampedFadeDuration * 1000);
    }
  }

  /**
   * Immediately aborts any in-flight preload, preparation, or crossfade transition.
   */
  public cancel(): void {
    if (this.state === 'IDLE') {
      return;
    }

    const previousSessionId = this.currentSessionId;
    this.currentSessionId++; // Invalidate pending callbacks
    this.state = 'IDLE';
    this.preloadedTrackId = null;

    if (this.fadeTimeoutId) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }

    this.delegate.onFadeCancel(previousSessionId);
  }

  public reset(): void {
    this.cancel();
  }
}
