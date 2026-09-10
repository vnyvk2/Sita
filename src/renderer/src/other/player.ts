import type { Subscription } from '@tanstack/react-store';

import { dispatch, store } from '../store/store';
import storage from '../utils/localStorage';
import { getOrCreateReverbBuffer } from './audioFx/reverbImpulse';
import { AUDIO_FX_PRESETS, type AudioFxOptions, type AudioFxPresetType } from './audioFx/types';
import { equalizerBandHertzData } from './equalizerData';
import PlayerQueue from './playerQueue';
import type { QueuesManager } from './queuesManager';
import { computeEffectiveReplayGain } from './replayGainCalculator';
import { CrossfadeScheduler, type CrossfadeDelegate } from './crossfade/CrossfadeScheduler';

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
  | 'queueMetadataChange'
  | 'audioFxChange';

type PlayerEventCallback<T = unknown> = (data: T) => void;

/**
 * AudioPlayer class that manages audio playback with integrated queue management. Provides
 * event-based architecture for player state changes. Owns a PlayerQueue instance and automatically
 * reacts to queue position changes.
 */
class AudioPlayer {
  private listeners: Map<PlayerEventType, Set<PlayerEventCallback<unknown>>>;

  // Dual-source audio elements
  audioA: HTMLAudioElement;
  audioB: HTMLAudioElement;
  sourceA!: MediaElementAudioSourceNode;
  sourceB!: MediaElementAudioSourceNode;

  activeSlot: 'A' | 'B' = 'A';
  activeSessionId: number = 0;

  queuesManager: QueuesManager;
  currentVolume: number;

  currentContext: AudioContext;
  equalizerBands: Map<EqualizerBandFilters, BiquadFilterNode>;

  replayGainA: GainNode;
  replayGainB: GainNode;
  fadeGainA: GainNode;
  fadeGainB: GainNode;

  // Shared Audio FX & Output nodes
  headroomGainNode: GainNode;
  dryGainNode: GainNode;
  wetGainNode: GainNode;
  convolverNode: ConvolverNode;
  fxLowPassNode: BiquadFilterNode;
  nightcoreTrebleBoostNode: BiquadFilterNode;
  safetyLimiterNode: DynamicsCompressorNode;
  gainNode: GainNode;

  private isConvolverConnected = false;
  private currentAudioFx: AudioFxOptions = AUDIO_FX_PRESETS.normal;

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
  private crossfadeScheduler: CrossfadeScheduler;
  private preloadedSongData: AudioPlayerData | null = null;
  private isCrossfading: boolean = false;
  private suppressQueuePositionLoad: boolean = false;

  constructor(queuesManager: QueuesManager) {
    this.listeners = new Map();

    this.audioA = new Audio();
    this.audioA.crossOrigin = 'anonymous';
    this.audioA.preload = 'auto';
    this.audioA.defaultPlaybackRate = 1.0;

    this.audioB = new Audio();
    this.audioB.crossOrigin = 'anonymous';
    this.audioB.preload = 'auto';
    this.audioB.defaultPlaybackRate = 1.0;

    this.queuesManager = queuesManager;

    this.currentContext = new window.AudioContext();
    this.equalizerBands = new Map();

    this.replayGainA = this.currentContext.createGain();
    this.replayGainA.gain.value = 1.0;
    this.replayGainB = this.currentContext.createGain();
    this.replayGainB.gain.value = 1.0;

    this.fadeGainA = this.currentContext.createGain();
    this.fadeGainA.gain.value = 1.0;
    this.fadeGainB = this.currentContext.createGain();
    this.fadeGainB.gain.value = 0.0;

    this.headroomGainNode = this.currentContext.createGain();
    this.headroomGainNode.gain.value = 1.0; // 0 dB baseline; attenuated to -1.5 dB only when FX active

    this.dryGainNode = this.currentContext.createGain();
    this.dryGainNode.gain.value = 1.0;
    this.wetGainNode = this.currentContext.createGain();
    this.wetGainNode.gain.value = 0.0;

    this.convolverNode = this.currentContext.createConvolver();

    this.fxLowPassNode = this.currentContext.createBiquadFilter();
    this.fxLowPassNode.type = 'lowpass';
    this.fxLowPassNode.frequency.value = 20000;
    this.fxLowPassNode.Q.value = 0.707;

    this.nightcoreTrebleBoostNode = this.currentContext.createBiquadFilter();
    this.nightcoreTrebleBoostNode.type = 'peaking';
    this.nightcoreTrebleBoostNode.frequency.value = 6000;
    this.nightcoreTrebleBoostNode.Q.value = 1.2;
    this.nightcoreTrebleBoostNode.gain.value = 0;

    this.safetyLimiterNode = this.currentContext.createDynamicsCompressor();
    this.safetyLimiterNode.threshold.value = -6.0;
    this.safetyLimiterNode.ratio.value = 20.0;
    this.safetyLimiterNode.knee.value = 0.0;
    this.safetyLimiterNode.attack.value = 0.003;
    this.safetyLimiterNode.release.value = 0.15;

    this.gainNode = this.currentContext.createGain();

    this.currentVolume = this.audioA.volume;

    this.unsubscribeFunc = this.subscribeToStoreEvents();
    this.initializeAudioGraph();
    this.setupQueueIntegration();
    this.setupAudioEventListeners();
    this.crossfadeScheduler = new CrossfadeScheduler(this.createCrossfadeDelegate());

    const savedFx = storage.playback.getPlaybackOptions('audioFx');
    if (savedFx) {
      this.applyAudioFx(savedFx);
    }
  }

  get audio(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.audioA : this.audioB;
  }

  get standbyAudio(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.audioB : this.audioA;
  }

  get replayGainNode(): GainNode {
    return this.activeSlot === 'A' ? this.replayGainA : this.replayGainB;
  }

  get activeFadeGain(): GainNode {
    return this.activeSlot === 'A' ? this.fadeGainA : this.fadeGainB;
  }

  get standbyFadeGain(): GainNode {
    return this.activeSlot === 'A' ? this.fadeGainB : this.fadeGainA;
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
          if (this.suppressQueuePositionLoad) {
            return;
          }
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
    this.setupAudioEventListenersFor(this.audioA, 'A');
    this.setupAudioEventListenersFor(this.audioB, 'B');
  }

  private setupAudioEventListenersFor(element: HTMLAudioElement, slot: 'A' | 'B') {
    element.addEventListener('ended', () => {
      if (this.activeSlot === slot) {
        this.crossfadeScheduler.cancel();
        this.handleSongEnd();
      } else {
        element.pause();
        element.currentTime = 0;
        element.src = '';
      }
    });

    element.addEventListener('timeupdate', () => {
      if (this.activeSlot === slot) {
        this.emit('timeUpdate', element.currentTime);
        this.crossfadeScheduler.onTimeUpdate(element.currentTime);
      }
    });

    element.addEventListener('loadedmetadata', () => {
      if (this.activeSlot === slot) {
        this.emit('durationChange', element.duration);
      }
    });

    element.addEventListener('play', () => {
      if (this.activeSlot === slot) {
        this.emit('play');
        window.api?.lyrics?.syncPlayStateToFloatingLyrics?.(true);
      }
    });

    element.addEventListener('pause', () => {
      if (this.activeSlot === slot) {
        this.emit('pause');
        window.api?.lyrics?.syncPlayStateToFloatingLyrics?.(false);
      }
    });

    element.addEventListener('error', (e) => {
      if (this.activeSlot === slot) {
        this.emit('error', e);
      }
    });

    element.addEventListener('seeking', () => {
      if (this.activeSlot === slot) {
        this.emit('seeking');
      }
    });

    element.addEventListener('seeked', () => {
      if (this.activeSlot === slot) {
        this.emit('seeked', element.currentTime);
      }
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

        // Ensure active slot is at full gain and standby is muted
        this.activeFadeGain.gain.value = 1.0;
        this.standbyFadeGain.gain.value = 0.0;

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
    this.crossfadeScheduler.cancel();
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

  private initializeAudioGraph() {
    for (const [filterName, hertzValue] of Object.entries(equalizerBandHertzData)) {
      const equalizerFilterName = filterName as EqualizerBandFilters;
      const equalizerBand = this.currentContext.createBiquadFilter();

      equalizerBand.type = 'peaking';
      equalizerBand.frequency.value = hertzValue;
      equalizerBand.Q.value = 1;
      equalizerBand.gain.value = 0;

      this.equalizerBands.set(equalizerFilterName, equalizerBand);
    }

    const filterMapKeys = [...this.equalizerBands.keys()];
    const firstFilter = this.equalizerBands.get(filterMapKeys[0])!;
    const lastFilter = this.equalizerBands.get(filterMapKeys[filterMapKeys.length - 1])!;

    this.equalizerBands.forEach((filter, key, map) => {
      const currentFilterIndex = filterMapKeys.indexOf(key);
      const isTheLastFilter = currentFilterIndex === filterMapKeys.length - 1;
      if (!isTheLastFilter) {
        const nextFilter = map.get(filterMapKeys[currentFilterIndex + 1]);
        if (nextFilter) filter.connect(nextFilter);
      }
    });

    // 1. Dual sources to per-track replay and fade gains:
    this.sourceA = this.currentContext.createMediaElementSource(this.audioA);
    this.sourceA.connect(this.replayGainA);
    this.replayGainA.connect(this.fadeGainA);
    this.fadeGainA.connect(firstFilter);

    this.sourceB = this.currentContext.createMediaElementSource(this.audioB);
    this.sourceB.connect(this.replayGainB);
    this.replayGainB.connect(this.fadeGainB);
    this.fadeGainB.connect(firstFilter);

    // 2. Route last equalizer filter through -1.5dB headroom gain staging
    lastFilter.connect(this.headroomGainNode);
    this.headroomGainNode.connect(this.dryGainNode);
    this.dryGainNode.connect(this.nightcoreTrebleBoostNode);

    // 3. Wet path: convolver -> lowpass -> wetGain -> nightcoreTrebleBoost
    this.convolverNode.connect(this.fxLowPassNode);
    this.fxLowPassNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.nightcoreTrebleBoostNode);
    this.isConvolverConnected = false;

    // 4. Treble boost -> Safety Limiter -> Master Gain -> Destination
    this.nightcoreTrebleBoostNode.connect(this.safetyLimiterNode);
    this.safetyLimiterNode.connect(this.gainNode);
    this.gainNode.connect(this.currentContext.destination);
  }

  public applyAudioFx(options?: AudioFxOptions) {
    if (options) {
      this.currentAudioFx = { ...options };
    }

    const {
      playbackRate,
      preservesPitch,
      reverbWet,
      reverbDecay,
      lowPassCutoff,
      trebleBoostGain
    } = this.currentAudioFx;

    const ctx = this.currentContext;
    const now = ctx.currentTime;

    // 1. Playback Rate & Pitch on BOTH elements (with vendor prefixes for cross-engine robustness)
    this.audioA.playbackRate = playbackRate;
    this.audioB.playbackRate = playbackRate;

    const elemA = this.audioA as unknown as Record<string, unknown>;
    const elemB = this.audioB as unknown as Record<string, unknown>;
    elemA.preservesPitch = preservesPitch;
    elemA.webkitPreservesPitch = preservesPitch;
    elemA.mozPreservesPitch = preservesPitch;
    elemB.preservesPitch = preservesPitch;
    elemB.webkitPreservesPitch = preservesPitch;
    elemB.mozPreservesPitch = preservesPitch;

    // 2. Reverb wet & dry gains (Gain staging: dry = Math.max(0, 1.0 - 0.5 * wet))
    const clampedWet = Math.max(0, Math.min(1.0, reverbWet));
    const targetDry = Math.max(0, 1.0 - 0.5 * clampedWet);

    if (clampedWet > 0) {
      if (!this.isConvolverConnected) {
        this.headroomGainNode.connect(this.convolverNode);
        this.isConvolverConnected = true;
      }
      try {
        const quantizedDecay = Math.round(reverbDecay * 10) / 10;
        const buffer = getOrCreateReverbBuffer(ctx, quantizedDecay, 2.5);
        if (this.convolverNode.buffer !== buffer) {
          this.convolverNode.buffer = buffer;
        }
      } catch (err) {
        logPlayer('[AudioPlayer.applyAudioFx] Error creating reverb buffer', { err });
      }
    } else {
      if (this.isConvolverConnected) {
        try {
          this.headroomGainNode.disconnect(this.convolverNode);
        } catch {
          // ignore if already disconnected
        }
        this.isConvolverConnected = false;
      }
    }

    if (typeof this.dryGainNode.gain.setTargetAtTime === 'function') {
      this.dryGainNode.gain.setTargetAtTime(targetDry, now, 0.05);
      this.wetGainNode.gain.setTargetAtTime(clampedWet, now, 0.05);
    } else {
      this.dryGainNode.gain.value = targetDry;
      this.wetGainNode.gain.value = clampedWet;
    }

    // 3. Low-Pass Damping
    const clampedCutoff = Math.max(500, Math.min(20000, lowPassCutoff));
    if (typeof this.fxLowPassNode.frequency.setTargetAtTime === 'function') {
      this.fxLowPassNode.frequency.setTargetAtTime(clampedCutoff, now, 0.05);
    } else {
      this.fxLowPassNode.frequency.value = clampedCutoff;
    }

    // 4. Nightcore Treble Peaking
    const clampedTreble = Math.max(-12, Math.min(12, trebleBoostGain));
    if (typeof this.nightcoreTrebleBoostNode.gain.setTargetAtTime === 'function') {
      this.nightcoreTrebleBoostNode.gain.setTargetAtTime(clampedTreble, now, 0.05);
    } else {
      this.nightcoreTrebleBoostNode.gain.value = clampedTreble;
    }

    // 5. Headroom gain staging: 1.0 (0 dB) when no FX engaged; 0.8414 (-1.5 dB) when FX active
    const isFxEngaged = clampedWet > 0 || clampedTreble !== 0 || clampedCutoff < 20000;
    const targetHeadroom = isFxEngaged ? 0.8414 : 1.0;
    if (typeof this.headroomGainNode.gain.setTargetAtTime === 'function') {
      this.headroomGainNode.gain.setTargetAtTime(targetHeadroom, now, 0.05);
    } else {
      this.headroomGainNode.gain.value = targetHeadroom;
    }

    this.emit('audioFxChange', this.currentAudioFx);
  }

  public getAudioFx(): AudioFxOptions {
    return { ...this.currentAudioFx };
  }

  public setAudioFxPreset(preset: AudioFxPresetType, customOptions?: Partial<AudioFxOptions>) {
    let targetOptions: AudioFxOptions;
    if (preset === 'custom') {
      targetOptions = {
        ...this.currentAudioFx,
        preset: 'custom',
        ...(customOptions ?? {})
      };
    } else if (preset === 'normal') {
      const userBaseRate = store ? store.state.player.playbackRate ?? 1.0 : 1.0;
      targetOptions = {
        ...AUDIO_FX_PRESETS.normal,
        playbackRate: userBaseRate
      };
    } else {
      targetOptions = { ...AUDIO_FX_PRESETS[preset] };
    }

    this.applyAudioFx(targetOptions);
    storage.playback.setPlaybackOptions('audioFx', targetOptions);
  }

  // ? PLAYER RELATED STORE UPDATES HANDLING
  private updatePlayerVolume(volume: PlayerVolume) {
    this.volume = volume.value / 100;
    this.audioA.muted = volume.isMuted;
    this.audioB.muted = volume.isMuted;
  }

  private updatePlaybackRate(playbackRate: number) {
    if (this.currentAudioFx.preset === 'normal') {
      this.currentAudioFx.playbackRate = playbackRate;
      if (this.audioA.playbackRate !== playbackRate) {
        this.audioA.playbackRate = playbackRate;
        this.audioB.playbackRate = playbackRate;
      }
    }
  }

  private subscribeToStoreEvents() {
    const unsubscribeFunction = store.subscribe(() => {
      if (store) {
        const { player, localStorage } = store.state;

        this.updatePlayerVolume(player.volume);
        this.updatePlaybackRate(player.playbackRate);
        this.syncRepeatModeFromStore(player.isRepeating);

        const fx = localStorage?.playback?.audioFx;
        if (fx && JSON.stringify(fx) !== JSON.stringify(this.currentAudioFx)) {
          this.applyAudioFx(fx);
        }

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

  private createCrossfadeDelegate(): CrossfadeDelegate {
    return {
      getCrossfadeDuration: () => {
        const cf = storage.playback.getPlaybackOptions('crossfade');
        return cf?.duration ?? 0;
      },
      getTrackInfo: () => ({
        duration: this.audio.duration || 0,
        currentTime: this.audio.currentTime || 0,
        playbackRate: this.audio.playbackRate || 1.0,
        repeatMode: this.repeatMode
      }),
      getNextTrackId: () => {
        if (this.repeatMode === 'one') return null;
        if (this.queue.hasNext) {
          const nextPos = this.queue.position + 1;
          return this.queue.songIds[nextPos] ?? null;
        }
        if (this.repeatMode === 'all' && this.queue.length > 0) {
          return this.queue.songIds[0] ?? null;
        }
        return null;
      },
      preloadTrack: async (trackId: number, sessionId: number) => {
        try {
          const songData = await window.api.audioLibraryControls.getSong(trackId, false);
          if (!songData || this.crossfadeScheduler.getSessionId() !== sessionId) {
            return false;
          }
          this.preloadedSongData = songData;

          // Set up standby audio source
          this.standbyAudio.src = songData.path;
          this.standbyAudio.load();

          // Wait for standby audio to decode/buffer enough to play seamlessly
          const isReady = await new Promise<boolean>((resolve) => {
            const standby = this.standbyAudio;
            if (standby.readyState >= 3 /* HAVE_FUTURE_DATA */) {
              resolve(true);
              return;
            }

            const timeoutId = setTimeout(() => {
              cleanup();
              resolve(false);
            }, 4000);

            const onCanPlay = () => {
              cleanup();
              resolve(true);
            };

            const onError = () => {
              cleanup();
              resolve(false);
            };

            const cleanup = () => {
              clearTimeout(timeoutId);
              standby.removeEventListener('canplay', onCanPlay);
              standby.removeEventListener('error', onError);
            };

            standby.addEventListener('canplay', onCanPlay);
            standby.addEventListener('error', onError);
          });

          if (!isReady || this.crossfadeScheduler.getSessionId() !== sessionId) {
            this.preloadedSongData = null;
            return false;
          }

          // Apply pre-calculated ReplayGain to standbyReplayGain
          const settings = storage.playback.getPlaybackOptions('replayGain') ?? {
            mode: 'track',
            preampDb: 0,
            preventClipping: true
          };
          const calculation = computeEffectiveReplayGain({
            mode: settings.mode,
            preampDb: settings.preampDb,
            preventClipping: settings.preventClipping,
            trackGain: songData.replayGain?.trackGain,
            trackPeak: songData.replayGain?.trackPeak,
            albumGain: songData.replayGain?.albumGain,
            albumPeak: songData.replayGain?.albumPeak
          });
          const standbyReplayGainNode =
            this.activeSlot === 'A' ? this.replayGainB : this.replayGainA;
          standbyReplayGainNode.gain.value = calculation.targetLinearGain;

          return true;
        } catch (err) {
          logPlayer('[AudioPlayer.crossfadePreload] Preload failed', { trackId, err });
          return false;
        }
      },
      startFade: async ({
        sessionId,
        incomingTrackId,
        clampedFadeDuration,
        fadeOutCurve,
        fadeInCurve
      }) => {
        logPlayer('[AudioPlayer.startFade]', { sessionId, incomingTrackId, clampedFadeDuration });

        // Validate readiness and song data integrity before initiating crossfade
        if (
          !this.preloadedSongData ||
          this.preloadedSongData.songId !== incomingTrackId ||
          this.crossfadeScheduler.getSessionId() !== sessionId
        ) {
          logPlayer('[AudioPlayer.startFade] Preloaded track mismatch or session expired; aborting fade', {
            sessionId,
            incomingTrackId,
            preloadedId: this.preloadedSongData?.songId
          });
          return;
        }

        // Recalculate ReplayGain for standby audio to ensure settings are freshest at fade start
        if (this.preloadedSongData) {
          const settings = storage.playback.getPlaybackOptions('replayGain') ?? {
            mode: 'track',
            preampDb: 0,
            preventClipping: true
          };
          const calculation = computeEffectiveReplayGain({
            mode: settings.mode,
            preampDb: settings.preampDb,
            preventClipping: settings.preventClipping,
            trackGain: this.preloadedSongData.replayGain?.trackGain,
            trackPeak: this.preloadedSongData.replayGain?.trackPeak,
            albumGain: this.preloadedSongData.replayGain?.albumGain,
            albumPeak: this.preloadedSongData.replayGain?.albumPeak
          });
          const standbyReplayGainNode =
            this.activeSlot === 'A' ? this.replayGainB : this.replayGainA;
          standbyReplayGainNode.gain.value = calculation.targetLinearGain;
        }

        // Ensure standby audio is ready and playing BEFORE curves start
        this.standbyAudio.currentTime = 0;
        this.standbyAudio.playbackRate = this.audio.playbackRate;

        try {
          await this.standbyAudio.play();
        } catch (err) {
          console.error('[AudioPlayer.startFade] Failed to play standby audio:', err);
          this.crossfadeScheduler.cancel();
          return;
        }

        const now = this.currentContext.currentTime;

        // Apply equal power curves with prior automation cancellation and anchoring
        const outgoingGain = this.activeFadeGain;
        const incomingGain = this.standbyFadeGain;

        outgoingGain.gain.cancelScheduledValues(now);
        outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now);
        outgoingGain.gain.setValueCurveAtTime(fadeOutCurve, now, clampedFadeDuration);

        incomingGain.gain.cancelScheduledValues(now);
        incomingGain.gain.setValueAtTime(incomingGain.gain.value, now);
        incomingGain.gain.setValueCurveAtTime(fadeInCurve, now, clampedFadeDuration);

        this.isCrossfading = true;

        const incomingSongData = this.preloadedSongData;

        // Swap active slot immediately so UI, controls, timeupdate track the new song
        this.activeSlot = this.activeSlot === 'A' ? 'B' : 'A';
        this.currentSongData = incomingSongData;

        // Advance queue position without triggering standard reload
        this.suppressQueuePositionLoad = true;
        if (this.queue.hasNext) {
          this.queue.moveToNext();
        } else if (this.repeatMode === 'all') {
          this.queue.moveToStart();
        }
        this.suppressQueuePositionLoad = false;

        // Store & event notifications for new track
        if (incomingSongData) {
          dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: incomingSongData });
          storage.playback.setCurrentSongOptions('songId', incomingSongData.songId);
          const trackChangeEvent = new CustomEvent('player/trackchange', {
            detail: incomingSongData.songId
          });
          this.audio.dispatchEvent(trackChangeEvent);
          this.emit('songLoaded', incomingSongData);
        }
      },
      onFadeComplete: (sessionId, incomingTrackId) => {
        logPlayer('[AudioPlayer.onFadeComplete]', { sessionId, incomingTrackId });
        const standbyFade = this.standbyFadeGain;
        standbyFade.gain.value = 0.0;
        this.standbyAudio.pause();
        this.standbyAudio.currentTime = 0;
        this.standbyAudio.src = '';
        this.activeFadeGain.gain.value = 1.0;
        this.isCrossfading = false;
        if (this.currentSongData && this.currentSongData.songId === incomingTrackId) {
          this.emit('recordListening', {
            songId: this.currentSongData.songId,
            duration: this.currentSongData.duration
          });
        }
        this.preloadedSongData = null;
      },
      onFadeCancel: (sessionId) => {
        logPlayer('[AudioPlayer.onFadeCancel]', { sessionId });
        const now = this.currentContext.currentTime;
        const cancelGain = (gainNode: GainNode) => {
          try {
            if (
              typeof (
                gainNode.gain as unknown as { cancelAndHoldAtTime?: (time: number) => void }
              ).cancelAndHoldAtTime === 'function'
            ) {
              (
                gainNode.gain as unknown as { cancelAndHoldAtTime: (time: number) => void }
              ).cancelAndHoldAtTime(now);
            } else {
              gainNode.gain.cancelScheduledValues(now);
              gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            }
          } catch {
            // Context might be closed
          }
        };
        cancelGain(this.fadeGainA);
        cancelGain(this.fadeGainB);

        this.activeFadeGain.gain.setValueAtTime(1.0, now);
        this.standbyFadeGain.gain.setValueAtTime(0.0, now);

        this.standbyAudio.pause();
        this.standbyAudio.currentTime = 0;
        this.standbyAudio.src = '';
        this.isCrossfading = false;
        this.preloadedSongData = null;
      }
    };
  }

  // ========== PUBLIC PLAYBACK CONTROLS ==========

  /** Starts or resumes audio playback with fade-in effect. */
  async play() {
    if (this.currentContext.state === 'suspended') {
      await this.currentContext.resume();
    }
    if (this.isCrossfading) {
      this.crossfadeScheduler.resumeFade();
      await Promise.all([this.audio.play(), this.standbyAudio.play()]);
      return;
    }
    await this.audio.play();
    return this.fadeInAudio();
  }

  /** Pauses audio playback with fade-out effect. */
  async pause() {
    if (this.isCrossfading) {
      this.crossfadeScheduler.pauseFade();
      this.audio.pause();
      this.standbyAudio.pause();
      if (this.currentContext.state === 'running') {
        await this.currentContext.suspend();
      }
      return;
    }
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
    this.crossfadeScheduler.cancel();
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
    this.crossfadeScheduler.cancel();
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
    this.crossfadeScheduler.cancel();
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
    this.crossfadeScheduler.cancel();
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
    this.crossfadeScheduler.cancel();
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
    this.audioA.volume = volume;
    this.audioB.volume = volume;
    this.gainNode.gain.value = volume;
  }

  /** Gets the muted state. */
  get muted(): boolean {
    return this.audio.muted;
  }

  /** Sets the muted state. */
  set muted(value: boolean) {
    this.audioA.muted = value;
    this.audioB.muted = value;
    this.gainNode.gain.value = value ? 0 : this.volume;
  }

  /** Gets the current playback rate. */
  get playbackRate(): number {
    return this.audio.playbackRate;
  }

  /** Sets the playback rate. */
  set playbackRate(value: number) {
    this.audioA.playbackRate = value;
    this.audioB.playbackRate = value;
  }
}

export default AudioPlayer;
