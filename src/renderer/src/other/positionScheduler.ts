import roundTo from '@common/roundTo';

import type AudioPlayer from './player';

export type SchedulerState = 'PLAYING_VISIBLE' | 'PLAYING_HIDDEN' | 'PAUSED' | 'IDLE_NO_SONG';

export const CADENCE_VISIBLE_MS = 100;
export const CADENCE_HIDDEN_MS = 1000;

export interface PositionSchedulerOptions {
  onPositionChange?: (position: number) => void;
  documentRef?: Document;
}

export class PositionTimerScheduler {
  private player: AudioPlayer;
  private state: SchedulerState = 'IDLE_NO_SONG';
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private documentRef: Document;
  private onPositionChange: (position: number) => void;
  private cleanups: (() => void)[] = [];

  constructor(player: AudioPlayer, options?: PositionSchedulerOptions) {
    this.player = player;
    this.documentRef =
      options?.documentRef || (typeof document !== 'undefined' ? document : ({} as Document));
    this.onPositionChange =
      options?.onPositionChange ||
      ((time: number) => {
        if (typeof document !== 'undefined' && document.dispatchEvent) {
          const roundedTime = roundTo(time, 2);
          const playerPositionChange = new CustomEvent('player/positionChange', {
            detail: roundedTime
          });
          document.dispatchEvent(playerPositionChange);
          window.api?.lyrics?.syncTimeToFloatingLyrics?.(roundedTime);
        }
      });

    this.setupListeners();
    this.recomputeState();
  }

  public getState(): SchedulerState {
    return this.state;
  }

  public dispatchCurrentTime(): void {
    if (this.isDestroyed) return;
    const time = this.player.currentTime || 0;
    this.onPositionChange(time);
  }

  public recomputeState(): void {
    if (this.isDestroyed) return;

    const previousState = this.state;
    const hasActiveSong = Boolean(this.player.audio?.src && this.player.queue?.currentSongId);

    if (!hasActiveSong) {
      this.state = 'IDLE_NO_SONG';
    } else if (this.player.paused) {
      this.state = 'PAUSED';
    } else if (this.documentRef.visibilityState === 'hidden') {
      this.state = 'PLAYING_HIDDEN';
    } else {
      this.state = 'PLAYING_VISIBLE';
    }

    // When transitioning from hidden to visible while playing, emit an immediate sync event
    if (previousState === 'PLAYING_HIDDEN' && this.state === 'PLAYING_VISIBLE') {
      this.dispatchCurrentTime();
    }

    this.reschedule();
  }

  private reschedule(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.isDestroyed || this.state === 'PAUSED' || this.state === 'IDLE_NO_SONG') {
      return;
    }

    const interval = this.state === 'PLAYING_VISIBLE' ? CADENCE_VISIBLE_MS : CADENCE_HIDDEN_MS;

    const tick = () => {
      if (this.isDestroyed || this.state === 'PAUSED' || this.state === 'IDLE_NO_SONG') {
        return;
      }
      this.dispatchCurrentTime();
      this.timerId = setTimeout(tick, interval);
    };

    this.timerId = setTimeout(tick, interval);
  }

  private setupListeners(): void {
    const handlePlay = () => {
      this.dispatchCurrentTime();
      this.recomputeState();
    };

    const handlePause = () => {
      this.dispatchCurrentTime();
      this.recomputeState();
    };

    const handleSeeked = () => {
      this.dispatchCurrentTime();
      this.recomputeState();
    };

    const handleVisibilityChange = () => {
      this.recomputeState();
    };

    const handleSongOrQueueChange = () => {
      this.dispatchCurrentTime();
      this.recomputeState();
    };

    this.player.on('play', handlePlay);
    this.player.on('pause', handlePause);
    this.player.on('seeked', handleSeeked);
    this.player.on('songChange', handleSongOrQueueChange);
    this.player.on('queueChange', handleSongOrQueueChange);
    this.player.on('durationChange', handleSongOrQueueChange);

    this.cleanups.push(() => {
      this.player.off('play', handlePlay);
      this.player.off('pause', handlePause);
      this.player.off('seeked', handleSeeked);
      this.player.off('songChange', handleSongOrQueueChange);
      this.player.off('queueChange', handleSongOrQueueChange);
      this.player.off('durationChange', handleSongOrQueueChange);
    });

    if (this.documentRef.addEventListener) {
      this.documentRef.addEventListener('visibilitychange', handleVisibilityChange);
      this.cleanups.push(() => {
        this.documentRef.removeEventListener?.('visibilitychange', handleVisibilityChange);
      });
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups = [];
    this.state = 'IDLE_NO_SONG';
  }
}
