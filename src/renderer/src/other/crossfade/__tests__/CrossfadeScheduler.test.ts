/// <reference types="vitest/globals" />
import { CrossfadeScheduler, type CrossfadeDelegate } from '../CrossfadeScheduler';

describe('CrossfadeScheduler', () => {
  let delegate: CrossfadeDelegate;
  let scheduler: CrossfadeScheduler;
  let trackInfo: {
    duration: number;
    currentTime: number;
    playbackRate: number;
    repeatMode: 'off' | 'one' | 'all';
  };
  let crossfadeDuration: number;
  let nextTrackId: number | null;

  beforeEach(() => {
    vi.useFakeTimers();
    crossfadeDuration = 6;
    trackInfo = {
      duration: 100,
      currentTime: 0,
      playbackRate: 1.0,
      repeatMode: 'off'
    };
    nextTrackId = 42;

    delegate = {
      getCrossfadeDuration: vi.fn(() => crossfadeDuration),
      getTrackInfo: vi.fn(() => trackInfo),
      getNextTrackId: vi.fn(() => nextTrackId),
      preloadTrack: vi.fn().mockResolvedValue(true),
      startFade: vi.fn().mockResolvedValue(undefined),
      onFadeComplete: vi.fn(),
      onFadeCancel: vi.fn()
    };

    scheduler = new CrossfadeScheduler(delegate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start in IDLE state', () => {
    expect(scheduler.getState()).toBe('IDLE');
  });

  it('should stay IDLE if crossfadeDuration is 0', async () => {
    crossfadeDuration = 0;
    await scheduler.onTimeUpdate(95);
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.preloadTrack).not.toHaveBeenCalled();
  });

  it('should stay IDLE if repeatMode is "one"', async () => {
    trackInfo.repeatMode = 'one';
    await scheduler.onTimeUpdate(95);
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.preloadTrack).not.toHaveBeenCalled();
  });

  it('should trigger PRELOADING at preload time (89s) and transition to READY', async () => {
    // 100s track, 6s fade -> fade trigger is 94s, preload lead is 5s -> preload at 89s
    await scheduler.onTimeUpdate(89);
    expect(delegate.preloadTrack).toHaveBeenCalledWith(42, expect.any(Number));
    expect(scheduler.getState()).toBe('READY');
  });

  it('should transition from READY to FADING at trigger time (94s)', async () => {
    await scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('READY');

    await scheduler.onTimeUpdate(94);
    expect(scheduler.getState()).toBe('FADING');
    expect(delegate.startFade).toHaveBeenCalledWith({
      sessionId: expect.any(Number),
      incomingTrackId: 42,
      clampedFadeDuration: 6,
      fadeOutCurve: expect.any(Float32Array),
      fadeInCurve: expect.any(Float32Array)
    });
  });

  it('should complete fade after duration expires', async () => {
    await scheduler.onTimeUpdate(89);
    await scheduler.onTimeUpdate(94);
    expect(scheduler.getState()).toBe('FADING');

    // Fast-forward 6 seconds
    vi.advanceTimersByTime(6000);
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.onFadeComplete).toHaveBeenCalledWith(expect.any(Number), 42);
  });

  it('should cancel active fade and call onFadeCancel when cancel() is invoked', async () => {
    await scheduler.onTimeUpdate(89);
    await scheduler.onTimeUpdate(94);
    expect(scheduler.getState()).toBe('FADING');

    scheduler.cancel();
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.onFadeCancel).toHaveBeenCalled();

    // Advancing timers should not invoke onFadeComplete
    vi.advanceTimersByTime(6000);
    expect(delegate.onFadeComplete).not.toHaveBeenCalled();
  });

  it('should abort crossfade if nextTrackId changes before fade starts', async () => {
    await scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('READY');

    // Queue changed: next track is now 99 instead of 42
    nextTrackId = 99;
    await scheduler.onTimeUpdate(94);

    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.startFade).not.toHaveBeenCalled();
    expect(delegate.onFadeCancel).toHaveBeenCalled();
  });

  it('MUST NOT start fade if still PRELOADING when trigger time is reached', async () => {
    // Simulate slow preload that has not resolved yet
    let resolvePreload!: (val: boolean) => void;
    delegate.preloadTrack = vi.fn().mockImplementation(() => {
      return new Promise<boolean>((resolve) => {
        resolvePreload = resolve;
      });
    });

    // 1. Enter PRELOADING
    const preloadPromise = scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('PRELOADING');

    // 2. Playback advances to trigger time (94s) while preload is STILL in flight
    await scheduler.onTimeUpdate(94);

    // Assert: scheduler must abort/cancel rather than prematurely starting the fade!
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.startFade).not.toHaveBeenCalled();
    expect(delegate.onFadeCancel).toHaveBeenCalled();

    // 3. Even when late preload eventually resolves, it should be ignored due to cancelled session
    resolvePreload(true);
    await preloadPromise;
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.startFade).not.toHaveBeenCalled();
  });

  it('should return to IDLE and not start fade if preloadTrack fails', async () => {
    delegate.preloadTrack = vi.fn().mockResolvedValue(false);

    await scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('IDLE');

    await scheduler.onTimeUpdate(94);
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.startFade).not.toHaveBeenCalled();
  });

  it('MUST ignore late preload resolution if cancellation occurred while in-flight', async () => {
    let resolvePreload!: (val: boolean) => void;
    delegate.preloadTrack = vi.fn().mockImplementation(() => {
      return new Promise<boolean>((resolve) => {
        resolvePreload = resolve;
      });
    });

    // 1. Preload starts at 89s
    const preloadPromise = scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('PRELOADING');

    // 2. User seeks or cancels at 90s
    scheduler.cancel();
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.onFadeCancel).toHaveBeenCalled();

    // 3. Late preload resolves right after cancellation
    resolvePreload(true);
    await preloadPromise;

    // Assert: State must remain IDLE (not transition to READY with a stale track)
    expect(scheduler.getState()).toBe('IDLE');

    // 4. If playback reaches 94s now, it must not start fade
    await scheduler.onTimeUpdate(94);
    expect(delegate.startFade).not.toHaveBeenCalled();
  });

  it('MUST NOT fade into old track if queue mutates to another song while preload is pending', async () => {
    let resolvePreload!: (val: boolean) => void;
    delegate.preloadTrack = vi.fn().mockImplementation(() => {
      return new Promise<boolean>((resolve) => {
        resolvePreload = resolve;
      });
    });

    // 1. Preload starts for track 42
    const preloadPromise = scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('PRELOADING');

    // 2. While preload is pending, user alters queue so next track becomes 99
    nextTrackId = 99;

    // 3. Preload for old track 42 finishes
    resolvePreload(true);
    await preloadPromise;

    // State may become READY for old track 42, but at fade trigger...
    // 4. Playback reaches trigger time (94s)
    await scheduler.onTimeUpdate(94);

    // Assert: scheduler detects nextTrackId (99) !== preloadedTrackId (42) and aborts!
    expect(scheduler.getState()).toBe('IDLE');
    expect(delegate.startFade).not.toHaveBeenCalled();
    expect(delegate.onFadeCancel).toHaveBeenCalled();
  });

  it('should freeze fade completion timer on pauseFade() and resume on resumeFade()', async () => {
    // 1. Enter READY then FADING
    await scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('READY');

    await scheduler.onTimeUpdate(94);
    expect(scheduler.getState()).toBe('FADING');
    expect(delegate.startFade).toHaveBeenCalled();

    // 2. Advance 2 seconds into a 6 second fade
    vi.advanceTimersByTime(2000);
    expect(delegate.onFadeComplete).not.toHaveBeenCalled();

    // 3. User pauses playback mid-fade
    scheduler.pauseFade();

    // 4. Time passes while paused (e.g. 15 seconds)
    vi.advanceTimersByTime(15000);
    // MUST NOT complete while paused!
    expect(delegate.onFadeComplete).not.toHaveBeenCalled();
    expect(scheduler.getState()).toBe('FADING');

    // 5. User resumes playback
    scheduler.resumeFade();

    // 6. Remaining ~4 seconds should now elapse
    vi.advanceTimersByTime(3500);
    expect(delegate.onFadeComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(delegate.onFadeComplete).toHaveBeenCalledWith(expect.any(Number), 42);
    expect(scheduler.getState()).toBe('IDLE');
  });

  it('should not arm completion timer or set fading fields if cancelled during startFade await', async () => {
    // 1. Enter READY
    await scheduler.onTimeUpdate(89);
    expect(scheduler.getState()).toBe('READY');

    // 2. Mock startFade to simulate cancellation occurring during await (e.g. user skips track)
    (delegate.startFade as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      scheduler.cancel();
    });

    // 3. Trigger fade
    await scheduler.onTimeUpdate(94);
    expect(scheduler.getState()).toBe('IDLE');

    // 4. Timers should not fire onFadeComplete
    vi.advanceTimersByTime(10000);
    expect(delegate.onFadeComplete).not.toHaveBeenCalled();
  });
});
