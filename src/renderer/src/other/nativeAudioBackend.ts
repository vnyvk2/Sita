import type {
  DaemonCommand,
  DaemonLoadResultData,
  DaemonPushEvent,
  DaemonResponse,
  DaemonSoundProfileResultData,
  DaemonStateResultData,
  PlaybackState,
  SlotId,
  SoundProfile,
  SoundProfileStatus
} from '@common/audioEngineProtocol';

export interface NativeAudioBackendCallbacks {
  onTimeUpdate: (positionSecs: number, durationSecs: number) => void;
  onDurationChange: (durationSecs: number) => void;
  onTrackEnd: (slot: 'A' | 'B') => void;
  onSlotEnd?: (slot: 'A' | 'B') => void;
  onTransitionComplete?: (activeSlot: 'A' | 'B') => void;
  onSoundProfileChange?: (profile: SoundProfile, status: SoundProfileStatus) => void;
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
 * Native Audio Engine Renderer Backend. Communicates with the background Rust audio daemon via
 * Electron IPC. Features an anchored requestAnimationFrame interpolator for jitter-free 60/120fps
 * seekbar updates.
 */
export class NativeAudioBackend {
  private anchor = {
    posSecs: 0,
    clientTimestampMs: 0
  };
  private totalDurationSecs = 0;
  private lastEmittedDurationSecs = -1;
  private isPlaying = false;
  private rafId: number | null = null;
  private unsubscribeEvents?: () => void;
  private currentBootId = 0;
  private lastSeenSequenceId = 0;
  private hasSeenReady = false;

  constructor(private callbacks: NativeAudioBackendCallbacks) {
    this.startRafLoop();
    this.subscribeToDaemonEvents();
  }

  private emitDurationChange(durationSecs: number): void {
    // Heartbeats arrive at 4Hz: only forward genuine changes or the
    // PositionTimerScheduler recomputes + dispatches 4x/sec needlessly.
    if (
      Number.isFinite(durationSecs) &&
      durationSecs > 0 &&
      Math.abs(durationSecs - this.lastEmittedDurationSecs) > 0.1
    ) {
      this.lastEmittedDurationSecs = durationSecs;
      this.callbacks.onDurationChange(durationSecs);
    }
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
          this.emitDurationChange(event.duration_secs);
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
          if (event.state === 'stopped' && typeof event.position_secs === 'number') {
            this.anchor = {
              posSecs: event.position_secs,
              clientTimestampMs: performance.now()
            };
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

        case 'ready':
          this.currentBootId = event.boot_id;
          this.lastSeenSequenceId = 0;
          this.hasSeenReady = true;
          break;

        case 'sound_profile_changed':
          // T2-5: reject zero-epoch and pre-handshake pushes (real boots are
          // >= 1; see generate_boot_id().max(1)). Stale drops are debug-logged
          // so rapid restarts stay diagnosable.
          if (!this.hasSeenReady || !event.boot_id) {
            console.debug('[nativeAudioBackend] dropping pre-ready profile event', {
              boot_id: (event as { boot_id?: number }).boot_id ?? null
            });
            break;
          }
          if (event.boot_id < this.currentBootId) {
            // Stale daemon instance: reject events from older boot epochs
            console.debug('[nativeAudioBackend] dropping stale profile event', {
              boot_id: event.boot_id,
              sequence_id: event.sequence_id,
              currentBootId: this.currentBootId,
              lastSeenSequenceId: this.lastSeenSequenceId
            });
            break;
          }
          if (
            event.boot_id === this.currentBootId &&
            event.sequence_id <= this.lastSeenSequenceId
          ) {
            // Out-of-order or duplicate event within current boot epoch: reject
            console.debug('[nativeAudioBackend] dropping duplicate profile event', {
              boot_id: event.boot_id,
              sequence_id: event.sequence_id,
              lastSeenSequenceId: this.lastSeenSequenceId
            });
            break;
          }
          this.currentBootId = event.boot_id;
          this.lastSeenSequenceId = event.sequence_id;
          this.callbacks.onSoundProfileChange?.(event.profile, event.status);
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
        const interpolated = Math.min(this.totalDurationSecs, this.anchor.posSecs + cappedElapsed);
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
      this.emitDurationChange(data.duration_secs);
    }
    this.anchor = {
      posSecs: 0,
      clientTimestampMs: performance.now()
    };
    // Fresh playhead segment: a late heartbeat for the previous track must
    // not resurrect its position after load.
    this.lastEmittedDurationSecs = this.totalDurationSecs;
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

  public async getState(): Promise<DaemonStateResultData> {
    const res = await this.send({ cmd: 'get_state' });
    return (res.status === 'ok' ? res.data : undefined) as DaemonStateResultData;
  }

  public async setSoundProfile(profile: SoundProfile): Promise<DaemonSoundProfileResultData> {
    try {
      const res = await this.send({ cmd: 'set_sound_profile', profile });
      const data = (res.status === 'ok' ? res.data : undefined) as DaemonSoundProfileResultData;
      if (data?.boot_id && data?.sequence_id) {
        if (data.boot_id > this.currentBootId) {
          this.currentBootId = data.boot_id;
          this.lastSeenSequenceId = data.sequence_id;
        } else if (
          data.boot_id === this.currentBootId &&
          data.sequence_id > this.lastSeenSequenceId
        ) {
          this.lastSeenSequenceId = data.sequence_id;
        }
      }
      return data!;
    } catch (err: any) {
      // T2-5: narrow timeout classification. The manager reports timeouts as
      // 'timed out waiting for response ... (id, 5000ms)'; the previous
      // substring 'time' also matched unrelated errors ('sometimes',
      // 'lifetime', 'PrimeTime ...').
      const isTimeout =
        typeof err?.message === 'string' && /\b(timed out|timeout)\b|5000ms/i.test(err.message);
      if (isTimeout) {
        // Timeout as unknown outcome: query authoritative state from daemon
        try {
          const state = await this.getState();
          if (state?.sound_profile) {
            const status = state.sound_profile_status ?? 'active';
            if (state.boot_id && state.boot_id > this.currentBootId) {
              this.currentBootId = state.boot_id;
              // T2-5: never regress the epoch when state omits sequence_id.
              this.lastSeenSequenceId = state.sequence_id ?? this.lastSeenSequenceId;
            } else if (
              state.boot_id === this.currentBootId &&
              (state.sequence_id ?? this.lastSeenSequenceId) > this.lastSeenSequenceId
            ) {
              this.lastSeenSequenceId = state.sequence_id as number;
            }
            this.callbacks.onSoundProfileChange?.(state.sound_profile, status);
            // Synthetic success reports the reconciled state honestly:
            // transition_ms reflects the known 30ms ramp unless Active.
            return {
              profile: state.sound_profile,
              transition_ms: status === 'active' ? 0 : 30,
              boot_id: this.currentBootId,
              sequence_id: this.lastSeenSequenceId
            };
          }
          // T2-5: reachable state without a profile is still an unknown
          // outcome — signal once instead of throwing silently.
          this.callbacks.onError(
            new Error('Sound profile command timed out and daemon state has no profile')
          );
        } catch (reconcileErr) {
          this.callbacks.onError(
            new Error(
              `Sound profile command timed out and state reconciliation failed: ${reconcileErr}`
            )
          );
        }
      }
      throw err;
    }
  }

  public get bootId(): number {
    return this.currentBootId;
  }

  public get sequenceId(): number {
    return this.lastSeenSequenceId;
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelFrame(this.rafId);
      this.rafId = null;
    }
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
    this.isPlaying = false;
    // NOTE: intentionally does NOT call audioEngine.stop(): the daemon is a
    // process singleton shared across backend instances. Stopping it here
    // killed playback for everyone on toggle/HMR and forced a slow respawn.
    // The owner (player fallback / app shutdown) stops the daemon explicitly.
  }
}
