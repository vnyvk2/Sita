import type { Subscription } from '@tanstack/react-store';

import { dispatch, store } from '../store/store';
import storage from '../utils/localStorage';
import { equalizerBandHertzData } from './equalizerData';
import PlayerQueue from './playerQueue';
import type { QueuesManager } from './queuesManager';
import { computeEffectiveReplayGain } from './replayGainCalculator';

const DEBUG_PLAYER = false;

const logPlayer = (...args: unknown[]) => {
  if (!DEBUG_PLAYER) return;
  console.debug(...args);
};

const AUDIO_FADE_DURATION = 250;

type PlayerEventType =
  | 'timeUpdate'
  | 'durationChange'
  | 'play'
  | 'pause'
  | 'error'
  | 'seeking'
  | 'seeked'
  | 'repeatOne'
  | 'repeatAll'
  | 'playbackComplete'
  | 'songLoaded'
  | 'loadError'
  | 'recordListening'
  | 'repeatSong'
  | 'repeatModeChange'
  | 'queueChange'
  | 'queueMetadataChange';

type PlayerEventCallback<T = unknown> = (data: T) => void;

/**
 * AudioPlayer class that manages audio playback with integrated queue management. Provides
 * event-based architecture for player state changes. Owns a PlayerQueue instance and automatically
 * reacts to queue position changes.
 */
class AudioPlayer {
  private listeners: Map<PlayerEventType, Set<PlayerEventCallback<unknown>>>;

  audio: HTMLAudioElement;
  queuesManager: QueuesManager;
  currentVolume: number;

  currentContext: AudioContext;
  equalizerBands: Map<EqualizerBandFilters, BiquadFilterNode>;
  gainNode: GainNode;
  replayGainNode: GainNode;

  unsubscribeFunc: Subscription;

  private currentSongData: AudioPlayerData | null = null;
  private lastReplayGainMode: string | undefined;
  private lastPreampDb: number | undefined;
  private lastPreventClipping: boolean | undefined;

  private repeatMode: 'off' | 'one' | 'all' = 'off';
  private pendingAutoPlay: boolean = false;
  private queueEventsUnsubscribe: (() => void)[] = [];
  private loadRequestId: number = 0;
  private inFlightLoad: {
    songId: number;
    requestId: number;
    promise: Promise<AudioPlayerData | null>;
    autoPlay: boolean;
    updateStore: boolean;
  } | null = null;
  private pendingCanPlayHandler: (() => void) | null = null;
  private activeFade: {
    type: 'in' | 'out';
    timeoutId: NodeJS.Timeout;
    resolve: () => void;
  } | null = null;

  constructor(queuesManager: QueuesManager) {
    this.listeners = new Map();

    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.queuesManager = queuesManager;

    this.audio.preload = 'auto';
    this.audio.defaultPlaybackRate = 1.0;

    this.currentContext = new window.AudioContext();
    this.equalizerBands = new Map();
    this.gainNode = this.currentContext.createGain();
    this.replayGainNode = this.currentContext.createGain();
    this.replayGainNode.gain.value = 1.0;

    this.currentVolume = this.audio.volume;

    this.unsubscribeFunc = this.subscribeToStoreEvents();
    this.initializeEqualizer();
    this.setupQueueIntegration();
    this.setupAudioEventListeners();
  }

  get queue(): PlayerQueue {
    return this.queuesManager.getActiveQueue();
  }

  /**
   * Sets up integration between queue and player. Automatically loads songs when queue position
   * changes. Propagates queue events through player for convenience.
   */
  private setupQueueIntegration() {
    const bindToQueue = () => {
      this.queueEventsUnsubscribe.forEach((unsub) => unsub());
      this.queueEventsUnsubscribe = [];

      const queue = this.queue;

      this.queueEventsUnsubscribe.push(
        queue.on('positionChange', () => {
          const songId = queue.currentSongId;
          logPlayer('[AudioPlayer.positionChange]', {
            position: queue.position,
            songId,
            willLoad: !!songId,
            pendingAutoPlay: this.pendingAutoPlay
          });
          if (songId) {
            this.loadSong(songId, { autoPlay: this.pendingAutoPlay }).catch((err) => {
              console.error('[AudioPlayer.positionChange] Failed to load song:', err);
            });
            this.pendingAutoPlay = false; // Reset after use
          }
        })
      );

      this.queueEventsUnsubscribe.push(
        queue.on('queueChange', (data) => {
          this.emit('queueChange', data);
        })
      );

      this.queueEventsUnsubscribe.push(
        queue.on('metadataChange', (data) => {
          this.emit('queueMetadataChange', data);
        })
      );
    };

    bindToQueue();

    this.queuesManager.on('activeQueueChanged', () => {
      bindToQueue();
      const songId = this.queue.currentSongId;
      if (songId) {
        const shouldAutoPlay = this.pendingAutoPlay || !this.audio.paused;
        this.pendingAutoPlay = false;
        this.loadSong(songId, { autoPlay: shouldAutoPlay }).catch((err) => {
          console.error('[AudioPlayer.activeQueueChanged] Failed to load song:', err);
        });
      } else {
        this.audio.src = '';
        this.audio.pause();
      }
    });
  }

  /**
   * Sets up audio element event listeners. Emits player events for time updates, playback end,
   * errors, etc.
   */
  private setupAudioEventListeners() {
    this.audio.addEventListener('ended', () => this.handleSongEnd());

    this.audio.addEventListener('timeupdate', () => {
      this.emit('timeUpdate', this.audio.currentTime);
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.emit('durationChange', this.audio.duration);
    });

    this.audio.addEventListener('play', () => {
      this.emit('play');
    });

    this.audio.addEventListener('pause', () => {
      this.emit('pause');
    });

    this.audio.addEventListener('error', (e) => {
      this.emit('error', e);
    });

    this.audio.addEventListener('seeking', () => {
      this.emit('seeking');
    });

    this.audio.addEventListener('seeked', () => {
      this.emit('seeked', this.audio.currentTime);
    });
  }

  /**
   * Handles song end based on repeat mode. Automatically advances queue or repeats as configured.
   * Auto-resumes playback for the next song.
   */
  private async handleSongEnd() {
    logPlayer('[AudioPlayer.handleSongEnd]', { repeatMode: this.repeatMode });

    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      await this.play();
      this.emit('repeatOne');
      return;
    }

    if (this.queue.hasNext) {
      this.pendingAutoPlay = true;
      this.queue.moveToNext();
      // Song will be auto-loaded via positionChange event with autoPlay
    } else if (this.repeatMode === 'all' && this.queue.length > 0) {
      this.pendingAutoPlay = true;
      this.queue.moveToPosition(0);
      this.emit('repeatAll');
      // Song will be auto-loaded via positionChange event with autoPlay
    } else {
      this.emit('playbackComplete');
    }
  }

  /**
   * Loads a song into the audio element. Fetches song data from API if songId is provided, or uses
   * provided songData. Sets up audio source and dispatches events.
   *
   * @param songIdOrData - The ID of the song to load or the song data object
   * @param options - Optional configuration for song loading
   * @returns Promise resolving to the song data
   */
  private async loadSong(
    songIdOrData: number | AudioPlayerData,
    options?: { autoPlay?: boolean; updateStore?: boolean }
  ): Promise<AudioPlayerData | null> {
    const songId = typeof songIdOrData === 'number' ? songIdOrData : songIdOrData.songId;

    // 1. Coalesce into existing in-flight load for the exact same song
    if (this.inFlightLoad && this.inFlightLoad.songId === songId) {
      logPlayer('[AudioPerf] loadSong_coalescing', {
        songId,
        requestId: this.inFlightLoad.requestId,
        autoPlay: options?.autoPlay,
        updateStore: options?.updateStore
      });
      if (options?.autoPlay) {
        this.inFlightLoad.autoPlay = true;
      }
      if (options?.updateStore !== false) {
        this.inFlightLoad.updateStore = true;
      }
      return this.inFlightLoad.promise;
    }

    // 2. Fast-path: if exact song is already loaded, audio src is set, and no load is in-flight
    if (
      this.currentSongData?.songId === songId &&
      this.audio.src &&
      !this.inFlightLoad
    ) {
      logPlayer('[AudioPerf] loadSong_already_loaded', {
        songId,
        autoPlay: options?.autoPlay
      });
      if (options?.updateStore !== false) {
        dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: this.currentSongData });
        storage.playback.setCurrentSongOptions('songId', this.currentSongData.songId);
      }
      if (options?.autoPlay && this.audio.paused) {
        this.play().catch((err) =>
          console.error('[AudioPlayer] Fast-path auto-play failed:', err)
        );
      }
      return this.currentSongData;
    }

    const currentRequestId = ++this.loadRequestId;
    const tStart = performance.now();

    logPlayer('[AudioPerf] loadSong_start', {
      songId,
      requestId: currentRequestId,
      timestamp: tStart
    });

    // Detach any pending canplay listener from prior in-flight track loads
    if (this.pendingCanPlayHandler) {
      this.audio.removeEventListener('canplay', this.pendingCanPlayHandler);
      this.pendingCanPlayHandler = null;
    }

    const loadPromise = (async (): Promise<AudioPlayerData | null> => {
      try {
        let songData: AudioPlayerData;

        if (typeof songIdOrData === 'number') {
          // Fetch song data if ID provided
          songData = await window.api.audioLibraryControls.getSong(
            songIdOrData,
            options?.autoPlay ?? true
          );
        } else {
          // Use provided song data
          songData = songIdOrData;
        }

        const tIpc = performance.now();

        // Discard stale out-of-order resolution if user skipped again during in-flight fetch
        if (currentRequestId !== this.loadRequestId) {
          logPlayer('[AudioPerf] loadSong_discarded_stale', {
            songId: songData.songId,
            currentRequestId,
            latestRequestId: this.loadRequestId,
            ipcDurationMs: tIpc - tStart
          });
          return null;
        }

        logPlayer('[AudioPerf] ipc_resolved', {
          songId: songData.songId,
          requestId: currentRequestId,
          ipcDurationMs: tIpc - tStart
        });

        const effectiveAutoPlay =
          this.inFlightLoad?.songId === songId
            ? this.inFlightLoad.autoPlay
            : (options?.autoPlay ?? false);

        const effectiveUpdateStore =
          this.inFlightLoad?.songId === songId
            ? this.inFlightLoad.updateStore
            : (options?.updateStore !== false);

        this.currentSongData = songData;
        this.applyReplayGain();

        // 1. Set audio source (clean protocol path without cache-busting)
        this.audio.src = songData.path;

        // 2. Load media pipeline
        this.audio.load();

        // 3. Set up auto-play with generation guard and explicit listener tracking
        if (effectiveAutoPlay) {
          if (this.audio.readyState >= 3) {
            // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA - ready to play immediately
            this.play().catch((err) =>
              console.error('[AudioPlayer] Immediate auto-play failed:', err)
            );
          } else {
            // Wait for canplay event with generation guard
            const autoPlayHandler = () => {
              if (currentRequestId === this.loadRequestId) {
                const tCanPlay = performance.now();
                logPlayer('[AudioPerf] canplay_fired', {
                  songId: songData.songId,
                  requestId: currentRequestId,
                  bufferDurationMs: tCanPlay - tIpc
                });

                this.play().catch((err) =>
                  console.error('[AudioPlayer] Auto-play on canplay failed:', err)
                );
              }
              if (this.pendingCanPlayHandler === autoPlayHandler) {
                this.pendingCanPlayHandler = null;
              }
              this.audio.removeEventListener('canplay', autoPlayHandler);
            };

            this.pendingCanPlayHandler = autoPlayHandler;
            this.audio.addEventListener('canplay', autoPlayHandler);
          }
        }

        // 4. Update store with current song data if requested
        if (effectiveUpdateStore) {
          dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: songData });

          // Update localStorage
          storage.playback.setCurrentSongOptions('songId', songData.songId);
        }

        // 5. Dispatch custom track change event
        const trackChangeEvent = new CustomEvent('player/trackchange', {
          detail: songData.songId
        });
        this.audio.dispatchEvent(trackChangeEvent);

        // 6. Emit songLoaded event
        this.emit('songLoaded', songData);

        logPlayer('[AudioPerf] loadSong_completed', {
          songId: songData.songId,
          totalDurationMs: performance.now() - tStart
        });

        return songData;
      } catch (error) {
        // Discard stale rejections / errors from superseded in-flight requests
        if (currentRequestId !== this.loadRequestId) {
          logPlayer('[AudioPerf] loadSong_discarded_stale_error', {
            songId,
            currentRequestId,
            latestRequestId: this.loadRequestId,
            error
          });
          return null;
        }

        console.error(
          `Failed to load song (ID: ${songId}):`,
          error instanceof Error ? error.message : error
        );
        this.emit('loadError', { songId, error });
        throw error;
      } finally {
        if (this.inFlightLoad?.requestId === currentRequestId) {
          this.inFlightLoad = null;
        }
      }
    })();

    this.inFlightLoad = {
      songId,
      requestId: currentRequestId,
      promise: loadPromise,
      autoPlay: options?.autoPlay ?? false,
      updateStore: options?.updateStore !== false
    };

    return loadPromise;
  }

  /** Cleans up resources and event listeners. Should be called when player is no longer needed. */
  destroy() {
    this.cancelActiveFade();
    this.inFlightLoad = null;
    if (this.unsubscribeFunc) this.unsubscribeFunc.unsubscribe();
    if (this.pendingCanPlayHandler) {
      this.audio.removeEventListener('canplay', this.pendingCanPlayHandler);
      this.pendingCanPlayHandler = null;
    }
    this.queueEventsUnsubscribe.forEach((unsub) => typeof unsub === 'function' && unsub());
    this.removeAllListeners();
    this.audio.pause();
    this.audio.src = '';
    this.currentContext.close();
  }

  /**
   * Cancels any active fade transition, resetting scheduled audio ramps and settling pending
   * promises immediately.
   */
  private cancelActiveFade() {
    if (this.activeFade) {
      clearTimeout(this.activeFade.timeoutId);
      try {
        const currentTime = this.currentContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(currentTime);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
      } catch {
        // AudioContext may be closed or in transition; ignore parameter cancel errors
      }
      this.activeFade.resolve();
      this.activeFade = null;
    }
  }

  private fadeOutAudio(): Promise<void> {
    this.cancelActiveFade();
    return new Promise((resolve) => {
      const currentTime = this.currentContext.currentTime;
      const targetVolume = 0.001; // Very low but not zero to avoid clicks
      const fadeDuration = AUDIO_FADE_DURATION / 1000; // Convert to seconds

      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(targetVolume, currentTime + fadeDuration);

      const timeoutId = setTimeout(() => {
        this.audio.pause();
        if (this.activeFade?.timeoutId === timeoutId) {
          this.activeFade = null;
        }
        resolve();
      }, AUDIO_FADE_DURATION);

      this.activeFade = { type: 'out', timeoutId, resolve };
    });
  }

  private fadeInAudio(): Promise<void> {
    this.cancelActiveFade();
    return new Promise((resolve) => {
      const currentTime = this.currentContext.currentTime;
      const targetVolume = Math.max(0.001, this.currentVolume / 100);
      const fadeDuration = AUDIO_FADE_DURATION / 1000; // Convert to seconds

      this.gainNode.gain.setValueAtTime(Math.max(0.001, this.gainNode.gain.value), currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(targetVolume, currentTime + fadeDuration);

      const timeoutId = setTimeout(() => {
        if (this.activeFade?.timeoutId === timeoutId) {
          this.activeFade = null;
        }
        resolve();
      }, AUDIO_FADE_DURATION);

      this.activeFade = { type: 'in', timeoutId, resolve };
    });
  }

  /**
   * Subscribe to an event.
   *
   * @param eventType - The type of event to listen for
   * @param callback - Function to call when event is emitted
   */
  on<T = unknown>(eventType: PlayerEventType, callback: PlayerEventCallback<T>): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)?.add(callback as PlayerEventCallback<unknown>);
  }

  /**
   * Remove an event listener.
   *
   * @param eventType - The type of event
   * @param callback - The callback to remove
   */
  off<T = unknown>(eventType: PlayerEventType, callback: PlayerEventCallback<T>): void {
    this.listeners.get(eventType)?.delete(callback as PlayerEventCallback<unknown>);
  }

  /**
   * Emit an event to all listeners.
   *
   * @param eventType - The type of event to emit
   * @param data - The data to pass to listeners
   */
  protected emit<T = unknown>(eventType: PlayerEventType, data?: T): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach((callback) => {
        callback(data);
      });
    }
  }

  /** Remove all listeners for all events. */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  private initializeEqualizer() {
    for (const [filterName, hertzValue] of Object.entries(equalizerBandHertzData)) {
      const equalizerFilterName = filterName as EqualizerBandFilters;
      const equalizerBand = this.currentContext.createBiquadFilter();

      equalizerBand.type = 'peaking';
      equalizerBand.frequency.value = hertzValue;
      equalizerBand.Q.value = 1;
      equalizerBand.gain.value = 0;

      this.equalizerBands.set(equalizerFilterName, equalizerBand);
    }

    const source = this.currentContext.createMediaElementSource(this.audio);
    const filterMapKeys = [...this.equalizerBands.keys()];

    this.equalizerBands.forEach((filter, key, map) => {
      const currentFilterIndex = filterMapKeys.indexOf(key);
      const isTheFirstFilter = currentFilterIndex === 0;
      const isTheLastFilter = currentFilterIndex === filterMapKeys.length - 1;

      if (isTheFirstFilter) source.connect(filter);
      else {
        const prevFilter = map.get(filterMapKeys[currentFilterIndex - 1]);
        if (prevFilter) prevFilter.connect(filter);

        if (isTheLastFilter) filter.connect(this.replayGainNode);
      }
    });

    // ReplayGain node connects to master gain node, which connects to destination
    this.replayGainNode.connect(this.gainNode);
    this.gainNode.connect(this.currentContext.destination);
  }

  // ? PLAYER RELATED STORE UPDATES HANDLING
  private updatePlayerVolume(volume: PlayerVolume) {
    this.volume = volume.value / 100;
    this.audio.muted = volume.isMuted;
  }

  private updatePlaybackRate(playbackRate: number) {
    if (this.audio.playbackRate !== playbackRate) {
      this.audio.playbackRate = playbackRate;
    }
  }

  private subscribeToStoreEvents() {
    const unsubscribeFunction = store.subscribe(() => {
      if (store) {
        const { player, localStorage } = store.state;

        this.updatePlayerVolume(player.volume);
        this.updatePlaybackRate(player.playbackRate);
        this.syncRepeatModeFromStore(player.isRepeating);

        const rg = localStorage?.playback?.replayGain;
        if (
          rg &&
          (rg.mode !== this.lastReplayGainMode ||
            rg.preampDb !== this.lastPreampDb ||
            rg.preventClipping !== this.lastPreventClipping)
        ) {
          this.lastReplayGainMode = rg.mode;
          this.lastPreampDb = rg.preampDb;
          this.lastPreventClipping = rg.preventClipping;
          this.applyReplayGain();
        }
      }
    });

    return unsubscribeFunction;
  }

  /**
   * Applies ReplayGain to this.replayGainNode using smooth exponential ramping. Master volume and
   * ducking remain entirely separate on this.gainNode.
   */
  public applyReplayGain() {
    const settings = storage.playback.getPlaybackOptions('replayGain') ?? {
      mode: 'track',
      preampDb: 0,
      preventClipping: true
    };

    const calculation = computeEffectiveReplayGain({
      mode: settings.mode,
      preampDb: settings.preampDb,
      preventClipping: settings.preventClipping,
      trackGain: this.currentSongData?.replayGain?.trackGain,
      trackPeak: this.currentSongData?.replayGain?.trackPeak,
      albumGain: this.currentSongData?.replayGain?.albumGain,
      albumPeak: this.currentSongData?.replayGain?.albumPeak
    });

    const now = this.currentContext.currentTime;
    // Exponential smoothing with time constant 0.05s to prevent audio pops/zippering
    if (typeof this.replayGainNode.gain.setTargetAtTime === 'function') {
      this.replayGainNode.gain.setTargetAtTime(calculation.targetLinearGain, now, 0.05);
    } else {
      this.replayGainNode.gain.value = calculation.targetLinearGain;
    }

    logPlayer('[AudioPlayer.applyReplayGain]', {
      songId: this.currentSongData?.songId,
      mode: settings.mode,
      targetLinearGain: calculation.targetLinearGain,
      appliedGainDb: calculation.appliedGainDb,
      isClipped: calculation.isClipped
    });
  }

  public updateReplayGainSettings(settings?: Playback['replayGain']) {
    if (settings) {
      storage.playback.setPlaybackOptions('replayGain', settings);
    }
    this.applyReplayGain();
  }

  private syncRepeatModeFromStore(isRepeating: RepeatTypes) {
    // Convert store's RepeatTypes to AudioPlayer's repeat mode format
    const newMode = isRepeating === 'repeat-1' ? 'one' : isRepeating === 'repeat' ? 'all' : 'off';
    if (this.repeatMode !== newMode) {
      this.repeatMode = newMode;
    }
  }

  // ========== PUBLIC PLAYBACK CONTROLS ==========

  /** Starts or resumes audio playback with fade-in effect. */
  play() {
    this.audio.play();
    return this.fadeInAudio();
  }

  /** Pauses audio playback with fade-out effect. */
  pause() {
    return this.fadeOutAudio();
  }

  /**
   * Toggles playback between play and pause.
   *
   * @param forcePlay - If true, always play; if false, always pause; if undefined, toggle
   * @returns Promise that resolves when fade completes
   */
  async togglePlayback(forcePlay?: boolean): Promise<void> {
    const shouldPlay = forcePlay !== undefined ? forcePlay : this.audio.paused;

    if (shouldPlay) {
      if (this.audio.readyState > 0 && this.audio.paused) {
        await this.play();
      }
    } else {
      if (!this.audio.paused) {
        await this.pause();
      }
    }
  }

  /**
   * Seeks to a specific time position in the current song.
   *
   * @param time - Time in seconds to seek to
   */
  seek(time: number) {
    this.audio.currentTime = time;
  }

  /**
   * Loads and optionally plays a song by ID. This is the public API for loading songs - handles
   * store updates, localStorage, and analytics.
   *
   * @param songId - The ID of the song to load
   * @param options - Configuration options
   * @returns Promise that resolves when song is loaded and optionally playing
   */
  async playSongById(
    songId: number,
    options: {
      autoPlay?: boolean;
      recordListening?: boolean;
      onError?: (error: unknown) => void;
    } = {}
  ): Promise<void> {
    const { autoPlay = true, recordListening = true, onError } = options;

    try {
      logPlayer('[AudioPlayer.playSongById]', { songId, autoPlay });

      // Pass songId directly to loadSong so loadRequestId is incremented immediately before async IPC fetch
      const loadedSongData = await this.loadSong(songId, { autoPlay, updateStore: true });

      // Record listening data only if request was not discarded as stale
      if (loadedSongData && recordListening) {
        // Note: Listening data recording will be handled by the hook until fully migrated
        this.emit('recordListening', {
          songId: loadedSongData.songId,
          duration: loadedSongData.duration
        });
      }
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        throw error;
      }
    }
  }

  // ========== QUEUE NAVIGATION ==========

  /**
   * Skips forward to the next song in the queue. Handles repeat modes and automatically loads/plays
   * the next song.
   *
   * @param reason - Why the skip occurred ('USER_SKIP' or 'PLAYER_SKIP')
   */
  async skipForward(reason: SongSkipReason = 'USER_SKIP'): Promise<void> {
    logPlayer('[AudioPlayer.skipForward]', {
      reason,
      position: this.queue.position,
      hasNext: this.queue.hasNext,
      repeatMode: this.repeatMode
    });

    // Handle repeat-one mode (only auto-repeat, not on user skip)
    if (this.repeatMode === 'one' && reason !== 'USER_SKIP') {
      this.audio.currentTime = 0;
      await this.play();

      // Emit event for listening data recording (repetition)
      if (store.state.currentSongData?.songId) {
        this.emit('repeatSong', {
          songId: store.state.currentSongData.songId,
          duration: store.state.currentSongData.duration
        });
      }
      return;
    }

    // Move to next song or restart queue if repeat-all
    if (this.queue.hasNext) {
      this.pendingAutoPlay = true; // Auto-play next song on manual skip
      this.queue.moveToNext();
      logPlayer('[AudioPlayer.skipForward.moved]', {
        position: this.queue.position
      });
    } else if (this.repeatMode === 'all' && this.queue.length > 0) {
      this.pendingAutoPlay = true; // Auto-play when restarting queue
      this.queue.moveToStart();
    } else if (this.queue.isEmpty) {
      logPlayer('[AudioPlayer.skipForward] Queue is empty.');
    }
    // else: at end without repeat, do nothing (song ends)
  }

  /**
   * Skips backward to the previous song or restarts current song. If current time > 5 seconds,
   * restarts current song. Otherwise, moves to previous song in queue.
   */
  skipBackward(): void {
    logPlayer('[AudioPlayer.skipBackward]', {
      currentTime: this.audio.currentTime,
      position: this.queue.position,
      hasPrevious: this.queue.hasPrevious
    });

    // If more than 5 seconds into song, restart it
    if (this.audio.currentTime > 5) {
      this.audio.currentTime = 0;
      return;
    }

    // Move to previous song if available
    if (this.queue.currentSongId !== null) {
      if (this.queue.hasPrevious) {
        this.pendingAutoPlay = true; // Auto-play previous song on manual skip
        this.queue.moveToPrevious();
      } else {
        // At first song, restart it
        this.pendingAutoPlay = true;
        this.queue.moveToStart();
      }
    } else if (this.queue.length > 0) {
      // No current song but queue has songs, play first
      this.pendingAutoPlay = true;
      this.queue.moveToStart();
    }
  }

  /**
   * Plays the next song in the queue. Delegates to queue's moveToNext() which triggers song
   * loading.
   *
   * @deprecated Use skipForward() instead for better control
   */
  playNext() {
    if (this.queue.hasNext) {
      this.queue.moveToNext();
    }
  }

  /**
   * Plays the previous song in the queue. Delegates to queue's moveToPrevious() which triggers song
   * loading.
   *
   * @deprecated Use skipBackward() instead for better control
   */
  playPrevious() {
    if (this.queue.hasPrevious) {
      this.queue.moveToPrevious();
    }
  }

  /**
   * Plays a song at a specific position in the queue.
   *
   * @param position - The queue position (0-indexed)
   */
  playSongAtPosition(position: number) {
    this.pendingAutoPlay = true; // Auto-play when manually selecting a position
    const moved = this.queue.moveToPosition(position);
    if (!moved) {
      console.error('[AudioPlayer.playSongAtPosition] Failed to move to position:', position);
    }
    // Song will be auto-loaded via queue's positionChange event
  }

  // ========== REPEAT MODE MANAGEMENT ==========

  /**
   * Sets the repeat mode.
   *
   * @param mode - 'off' | 'one' | 'all'
   */
  setRepeatMode(mode: 'off' | 'one' | 'all') {
    this.repeatMode = mode;
    this.emit('repeatModeChange', mode);
  }

  /** Gets the current repeat mode. */
  getRepeatMode(): 'off' | 'one' | 'all' {
    return this.repeatMode;
  }

  // ========== GETTERS FOR CURRENT STATE ==========

  /** Gets the current song ID from the queue. */
  get currentSongId(): number | null {
    return this.queue.currentSongId;
  }

  /** Gets the current playback time in seconds. */
  get currentTime(): number {
    return this.audio.currentTime;
  }

  /** Sets the current playback time in seconds. */
  set currentTime(time: number) {
    this.audio.currentTime = time;
  }

  /** Gets the duration of the current song in seconds. */
  get duration(): number {
    return this.audio.duration;
  }

  /** Gets whether the audio is currently paused. */
  get paused(): boolean {
    return this.audio.paused;
  }

  /** Gets the current volume (0-1). */
  get volume(): number {
    return this.currentVolume / 100;
  }

  /** Sets the volume (0-1). */
  set volume(volume: number) {
    this.currentVolume = volume * 100;
    this.audio.volume = volume;
    this.gainNode.gain.value = volume;
  }

  /** Gets the muted state. */
  get muted(): boolean {
    return this.audio.muted;
  }

  /** Sets the muted state. */
  set muted(value: boolean) {
    this.audio.muted = value;
    this.gainNode.gain.value = value ? 0 : this.volume;
  }

  /** Gets the current playback rate. */
  get playbackRate(): number {
    return this.audio.playbackRate;
  }

  /** Sets the playback rate. */
  set playbackRate(value: number) {
    this.audio.playbackRate = value;
  }
}

export default AudioPlayer;
