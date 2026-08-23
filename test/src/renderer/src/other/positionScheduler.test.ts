import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CADENCE_HIDDEN_MS,
  CADENCE_VISIBLE_MS,
  PositionTimerScheduler
} from '../../../../../src/renderer/src/other/positionScheduler';

class MockAudioPlayer extends EventEmitter {
  public currentTime = 15.5;
  public paused = true;
  public audio = { src: 'nora://test/song.mp3' };
  public queue = { currentSongId: 42 };
}

describe('PositionTimerScheduler', () => {
  let player: MockAudioPlayer;
  let dispatchedEvents: number[];
  let fakeDoc: { visibilityState: DocumentVisibilityState; addEventListener: any; removeEventListener: any };
  let visibilityListener: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    player = new MockAudioPlayer();
    dispatchedEvents = [];
    visibilityListener = null;

    fakeDoc = {
      visibilityState: 'visible',
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'visibilitychange') visibilityListener = handler;
      }),
      removeEventListener: vi.fn((event: string, _handler: () => void) => {
        if (event === 'visibilitychange') visibilityListener = null;
      })
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in PAUSED state when audio has song but is paused', () => {
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    expect(scheduler.getState()).toBe('PAUSED');
    expect(dispatchedEvents.length).toBe(0);

    // Fast-forward time: no periodic events should be emitted while paused
    vi.advanceTimersByTime(5000);
    expect(dispatchedEvents.length).toBe(0);

    scheduler.destroy();
  });

  it('enters IDLE_NO_SONG when no song is active or queue is empty', () => {
    player.audio.src = '';
    player.queue.currentSongId = 0;

    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    expect(scheduler.getState()).toBe('IDLE_NO_SONG');
    vi.advanceTimersByTime(5000);
    expect(dispatchedEvents.length).toBe(0);

    scheduler.destroy();
  });

  it('transitions to PLAYING_VISIBLE on play event and dispatches at 100ms cadence', () => {
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    player.paused = false;
    player.emit('play');

    expect(scheduler.getState()).toBe('PLAYING_VISIBLE');
    expect(dispatchedEvents.length).toBe(1); // Immediate dispatch on play

    vi.advanceTimersByTime(CADENCE_VISIBLE_MS);
    expect(dispatchedEvents.length).toBe(2);

    vi.advanceTimersByTime(CADENCE_VISIBLE_MS * 4);
    expect(dispatchedEvents.length).toBe(6);

    scheduler.destroy();
  });

  it('transitions to PLAYING_HIDDEN when document visibility changes to hidden and downscales to 1000ms', () => {
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    player.paused = false;
    player.emit('play');
    expect(dispatchedEvents.length).toBe(1);

    // Switch to hidden
    fakeDoc.visibilityState = 'hidden';
    if (visibilityListener) visibilityListener();

    expect(scheduler.getState()).toBe('PLAYING_HIDDEN');

    // Advancing 100ms should NOT fire
    vi.advanceTimersByTime(CADENCE_VISIBLE_MS);
    expect(dispatchedEvents.length).toBe(1);

    // Advancing 1000ms should fire
    vi.advanceTimersByTime(CADENCE_HIDDEN_MS);
    expect(dispatchedEvents.length).toBe(2);

    scheduler.destroy();
  });

  it('transitions from PLAYING_HIDDEN to PLAYING_VISIBLE with immediate sync event', () => {
    fakeDoc.visibilityState = 'hidden';
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    player.paused = false;
    player.emit('play');
    expect(scheduler.getState()).toBe('PLAYING_HIDDEN');
    expect(dispatchedEvents.length).toBe(1);

    // Return to foreground
    fakeDoc.visibilityState = 'visible';
    if (visibilityListener) visibilityListener();

    expect(scheduler.getState()).toBe('PLAYING_VISIBLE');
    expect(dispatchedEvents.length).toBe(2); // Immediate sync event

    // Resumes 100ms cadence
    vi.advanceTimersByTime(CADENCE_VISIBLE_MS);
    expect(dispatchedEvents.length).toBe(3);

    scheduler.destroy();
  });

  it('dispatches single event on pause and stops all future periodic timer ticks', () => {
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    player.paused = false;
    player.emit('play');
    expect(dispatchedEvents.length).toBe(1);

    vi.advanceTimersByTime(CADENCE_VISIBLE_MS * 2);
    expect(dispatchedEvents.length).toBe(3);

    // Pause player
    player.paused = true;
    player.currentTime = 42.0;
    player.emit('pause');

    expect(scheduler.getState()).toBe('PAUSED');
    expect(dispatchedEvents.length).toBe(4); // Immediate event on pause with current time
    expect(dispatchedEvents[3]).toBe(42.0);

    // Advance time by 10 seconds: NO MORE periodic ticks!
    vi.advanceTimersByTime(10000);
    expect(dispatchedEvents.length).toBe(4);

    scheduler.destroy();
  });

  it('dispatches single event on seeked and maintains correct scheduler state', () => {
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    player.currentTime = 99.0;
    player.emit('seeked');

    expect(dispatchedEvents.length).toBe(1);
    expect(dispatchedEvents[0]).toBe(99.0);

    scheduler.destroy();
  });

  it('cleans up all listeners and cancels all timers upon destroy', () => {
    const scheduler = new PositionTimerScheduler(player as any, {
      documentRef: fakeDoc as any,
      onPositionChange: (time) => dispatchedEvents.push(time)
    });

    player.paused = false;
    player.emit('play');

    scheduler.destroy();
    expect(scheduler.getState()).toBe('IDLE_NO_SONG');

    vi.advanceTimersByTime(5000);
    expect(dispatchedEvents.length).toBe(1); // No new events after destroy
  });
});
