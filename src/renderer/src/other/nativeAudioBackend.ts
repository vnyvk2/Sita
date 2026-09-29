import type {
  DaemonCommand,
  DaemonLoadResultData,
  DaemonPushEvent,
  DaemonResponse,
  PlaybackState,
  SlotId
} from '@common/audioEngineProtocol';

export interface NativeAudioBackendCallbacks {
  onTimeUpdate: (positionSecs: number, durationSecs: number) => void;
  onDurationChange: (durationSecs: number) => void;
  onTrackEnd: (slot: 'A' | 'B') => void;
  onSlotEnd?: (slot: 'A' | 'B') => void;
  onTransitionComplete?: (activeSlot: 'A' | 'B') => void;
  onStateChange: (state: PlaybackState) => void;
  onError: (error: Error) => void;
}

const scheduleFrame =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number;

const cancelFrame =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);

/**
 * Native Audio Engine Renderer Backend.
 * Communicates with the background Rust audio daemon via Electron IPC.
 * Features an anchored requestAnimationFrame interpolator for jitter-free 60/120fps seekbar updates.
 */
export class NativeAudioBackend {
  private anchor = {
    posSecs: 0,
    clientTimestampMs: 0
  };
  private totalDurationSecs = 0;
  private isPlaying = false;
  private rafId: number | null = null;
  private unsubscribeEvents?: () => void;

  constructor(private callbacks: NativeAudioBackendCallbacks) {
    this.startRafLoop();
    this.subscribeToDaemonEvents();
  }

  private subscribeToDaemonEvents(): void {
    if (!window?.api?.audioEngine?.onEvent) {
      return;
    }

    this.unsubscribeEvents = window.api.audioEngine.onEvent((event: DaemonPushEvent) => {
      switch (event.event) {
        case 'heartbeat':
          // Re-anchor playhead position on each 4Hz monotonic daemon heartbeat
          this.anchor = {
            posSecs: event.position_secs,
            clientTimestampMs: performance.now()
          };
          this.totalDurationSecs = event.duration_secs;
          this.isPlaying = event.is_playing;
          this.callbacks.onDurationChange(event.duration_secs);
          this.callbacks.onTimeUpdate(event.position_secs, event.duration_secs);
          break;

        case 'state_changed':
          this.isPlaying = event.state === 'playing';
          if (event.state === 'paused' && typeof event.position_secs === 'number') {
            // Immediate freeze on pause to prevent seekbar drifting
            this.anchor = {
              posSecs: event.position_secs,
              clientTimestampMs: performance.now()
            };
            this.callbacks.onTimeUpdate(event.position_secs, this.totalDurationSecs);
          }
          this.callbacks.onStateChange(event.state);
          break;

        case 'track_end':
          this.isPlaying = false;
          this.callbacks.onTrackEnd(event.slot === 'a' ? 'A' : 'B');
          break;

        case 'slot_end':
          this.callbacks.onSlotEnd?.(event.slot === 'a' ? 'A' : 'B');
          break;

        case 'transition_complete':
          this.callbacks.onTransitionComplete?.(event.active_slot === 'a' ? 'A' : 'B');
          break;

        case 'device_error':
          this.callbacks.onError(new Error(event.message));
          break;
      }
    });
  }

  private startRafLoop(): void {
    if (this.rafId !== null) return;

    const tick = () => {
      if (this.isPlaying && this.anchor.clientTimestampMs > 0) {
        const elapsedSecs = (performance.now() - this.anchor.clientTimestampMs) / 1000.0;
        // Cap extrapolation to at most 500ms past the last heartbeat to prevent runaway drift
        const cappedElapsed = Math.min(elapsedSecs, 0.5);
        const interpolated = Math.min(
          this.totalDurationSecs,
          this.anchor.posSecs + cappedElapsed
        );
        this.callbacks.onTimeUpdate(interpolated, this.totalDurationSecs);
      }
      this.rafId = scheduleFrame(tick);
    };

    this.rafId = scheduleFrame(tick);
  }

  private async send(command: DaemonCommand): Promise<DaemonResponse> {
    if (!window?.api?.audioEngine?.send) {
      throw new Error('Native audio engine IPC is not available in preload environment.');
    }

    const res = await window.api.audioEngine.send(command);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
    return res;
  }

  public async load(slot: 'A' | 'B', path: string): Promise<DaemonLoadResultData> {
    const res = await this.send({
      cmd: 'load',
      slot: slot.toLowerCase() as SlotId,
      path
    });
    const data = res.status === 'ok' ? (res.data as DaemonLoadResultData) : undefined;
    if (data?.duration_secs) {
      this.totalDurationSecs = data.duration_secs;
      this.callbacks.onDurationChange(data.duration_secs);
    }
    this.anchor = {
      posSecs: 0,
      clientTimestampMs: performance.now()
    };
    return data!;
  }

  public async preload(path: string): Promise<DaemonLoadResultData> {
    const res = await this.send({
      cmd: 'preload',
      path
    });
    return (res.status === 'ok' ? res.data : undefined) as DaemonLoadResultData;
  }

  public async play(): Promise<void> {
    await this.send({ cmd: 'play' });
    this.isPlaying = true;
    this.anchor.clientTimestampMs = performance.now();
  }

  public async pause(): Promise<void> {
    await this.send({ cmd: 'pause' });
    this.isPlaying = false;
  }

  public async stop(): Promise<void> {
    await this.send({ cmd: 'stop' });
    this.isPlaying = false;
    this.anchor = { posSecs: 0, clientTimestampMs: performance.now() };
    this.callbacks.onTimeUpdate(0, this.totalDurationSecs);
  }

  public async seek(positionSecs: number): Promise<void> {
    this.anchor = {
      posSecs: positionSecs,
      clientTimestampMs: performance.now()
    };
    this.callbacks.onTimeUpdate(positionSecs, this.totalDurationSecs);
    await this.send({ cmd: 'seek', position_secs: positionSecs });
  }

  public async crossfade(durationMs: number): Promise<void> {
    await this.send({ cmd: 'crossfade', duration_ms: durationMs });
  }

  public async setVolume(linearVolume0to1: number): Promise<void> {
    const clamped = Math.max(0.0, Math.min(1.0, linearVolume0to1));
    await this.send({ cmd: 'set_volume', volume: clamped });
  }

  public async setEqualizer(
    gains: [number, number, number, number, number, number, number, number, number, number]
  ): Promise<void> {
    await this.send({ cmd: 'set_eq', gains });
  }

  public async setDsp(options: {
    bypass?: boolean;
    rgDb?: number;
    karaoke?: boolean;
    limiter?: boolean;
  }): Promise<void> {
    await this.send({
      cmd: 'set_dsp',
      bypass: options.bypass ?? false,
      rg_db: options.rgDb ?? 0.0,
      karaoke: options.karaoke ?? false,
      limiter: options.limiter ?? true
    });
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelFrame(this.rafId);
      this.rafId = null;
    }
    this.unsubscribeEvents?.();
    this.isPlaying = false;
  }
}
