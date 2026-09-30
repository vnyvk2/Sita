import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type {
  DaemonCommand,
  DaemonPushEvent,
  DaemonRequest,
  DaemonResponse,
  SlotId
} from '../../src/common/audioEngineProtocol';
import {
  NativeAudioDaemonManager,
  resolveToLocalDiskPath
} from '../../src/main/audio/NativeAudioDaemonManager';
import {
  NativeAudioBackend,
  type NativeAudioBackendCallbacks
} from '../../src/renderer/src/other/nativeAudioBackend';

describe('Native Audio Engine - Protocol & Path Resolution', () => {
  it('resolves nora:// custom protocol URLs to local filesystem paths', () => {
    const rawNoraPath = 'nora://songs/C:/Music/Albums/Track01.flac';
    const resolved = resolveToLocalDiskPath(rawNoraPath);
    expect(resolved).toMatch(/C:[/\\]Music[/\\]Albums[/\\]Track01\.flac/);
  });

  it('strips cache-busting timestamp queries from resolved paths', () => {
    const pathWithQuery = 'nora://songs/C:/Music/Track02.mp3?ts=1727618400000';
    const resolved = resolveToLocalDiskPath(pathWithQuery);
    expect(resolved).not.toContain('?ts=');
    expect(resolved).toMatch(/Track02\.mp3$/);
  });

  it('preserves native direct disk paths unchanged', () => {
    const directPath = 'C:\\Users\\Music\\Track03.wav';
    const resolved = resolveToLocalDiskPath(directPath);
    expect(resolved).toBe(directPath);
  });

  it('serializes and correlates DaemonRequest and DaemonResponse correctly', () => {
    const command: DaemonCommand = {
      cmd: 'seek',
      position_secs: 42.5
    };
    const request: DaemonRequest = {
      id: 101,
      ...command
    };

    expect(request.id).toBe(101);
    expect(request.cmd).toBe('seek');

    const response: DaemonResponse = {
      id: 101,
      status: 'ok',
      data: { position_secs: 42.5 }
    };
    expect(response.id).toBe(101);
    expect(response.status).toBe('ok');
  });

  it('correctly parses all DaemonPushEvent variants', () => {
    const readyEvent: DaemonPushEvent = {
      event: 'ready',
      protocol_version: 1,
      engine_version: '0.1.0'
    };
    expect(readyEvent.event).toBe('ready');

    const heartbeatEvent: DaemonPushEvent = {
      event: 'heartbeat',
      active_slot: 'a',
      position_secs: 12.34,
      duration_secs: 180.0,
      wallclock_ms: 1000,
      is_playing: true
    };
    expect(heartbeatEvent.event).toBe('heartbeat');
    expect(heartbeatEvent.position_secs).toBe(12.34);

    const stateEvent: DaemonPushEvent = {
      event: 'state_changed',
      state: 'paused',
      position_secs: 12.34
    };
    expect(stateEvent.state).toBe('paused');

    const transitionEvent: DaemonPushEvent = {
      event: 'transition_complete',
      active_slot: 'b'
    };
    expect(transitionEvent.active_slot).toBe('b');
  });
});

describe('Native Audio Daemon Manager - Lifecycle & Supervision', () => {
  it('detects available binary path on disk', () => {
    const manager = new NativeAudioDaemonManager();
    const binary = manager.findBinaryPath();
    // In our repository, target/release/engine-cli.exe is compiled and present
    expect(binary).not.toBeNull();
    expect(manager.isAvailable()).toBe(true);
  });

  it('correctly tracks crash supervision limit', () => {
    const manager = new NativeAudioDaemonManager();
    // Simulate 3 rapid crashes
    const now = Date.now();
    (manager as any).crashTimestamps = [now - 5000, now - 3000, now - 1000];
    (manager as any).exceededCrashLimit = true;

    expect(manager.isAvailable()).toBe(false);
  });

  it('tracks userSoundProfile preference and updates on setSoundProfilePreference', async () => {
    const manager = new NativeAudioDaemonManager();
    expect(manager.getSoundProfilePreference()).toBe('studio_reference');

    manager.setSoundProfilePreference('vocal_nuance_boost');
    expect(manager.getSoundProfilePreference()).toBe('vocal_nuance_boost');

    // Intercept set_sound_profile command when daemon is running
    const fakeStdin = { write: vi.fn() };
    (manager as any).child = { stdin: fakeStdin, killed: false };

    const promise = manager.sendCommand({ cmd: 'set_sound_profile', profile: 'studio_reference' });
    expect(manager.getSoundProfilePreference()).toBe('studio_reference');
    expect(fakeStdin.write).toHaveBeenCalled();

    // Clean up pending requests
    const pending = (manager as any).pendingRequests;
    for (const [id, req] of pending.entries()) {
      clearTimeout(req.timer);
      req.resolve({ id, status: 'ok' });
    }
    await promise;
  });
});

describe('Native Audio Backend - Anchored RAF Interpolation', () => {
  let callbacks: NativeAudioBackendCallbacks;
  let eventHandler: ((event: DaemonPushEvent) => void) | null = null;
  let sendMock: any;

  beforeEach(() => {
    callbacks = {
      onTimeUpdate: vi.fn(),
      onDurationChange: vi.fn(),
      onTrackEnd: vi.fn(),
      onSlotEnd: vi.fn(),
      onTransitionComplete: vi.fn(),
      onSoundProfileChange: vi.fn(),
      onStateChange: vi.fn(),
      onError: vi.fn()
    };

    sendMock = vi.fn().mockResolvedValue({ id: 1, status: 'ok' });

    (globalThis as any).window = {
      api: {
        audioEngine: {
          send: sendMock,
          stop: vi.fn().mockResolvedValue(undefined),
          onEvent: (cb: any) => {
            eventHandler = cb;
            return () => {
              eventHandler = null;
            };
          }
        }
      }
    };
  });

  afterEach(() => {
    eventHandler = null;
  });

  it('re-anchors playhead on incoming 4Hz heartbeats', () => {
    const backend = new NativeAudioBackend(callbacks);

    expect(eventHandler).not.toBeNull();

    eventHandler!({
      event: 'heartbeat',
      active_slot: 'a',
      position_secs: 15.0,
      duration_secs: 200.0,
      wallclock_ms: 1000,
      is_playing: true
    });

    expect(callbacks.onDurationChange).toHaveBeenCalledWith(200.0);
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(15.0, 200.0);

    backend.destroy();
  });

  it('freezes playhead immediately upon receiving pause state_changed event', () => {
    const backend = new NativeAudioBackend(callbacks);

    eventHandler!({
      event: 'state_changed',
      state: 'paused',
      position_secs: 45.2
    });

    expect(callbacks.onStateChange).toHaveBeenCalledWith('paused');
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith(45.2, 0);

    backend.destroy();
  });

  it('forwards track_end and transition_complete events to callbacks', () => {
    const backend = new NativeAudioBackend(callbacks);

    eventHandler!({
      event: 'track_end',
      slot: 'a'
    });
    expect(callbacks.onTrackEnd).toHaveBeenCalledWith('A');

    eventHandler!({
      event: 'transition_complete',
      active_slot: 'b'
    });
    expect(callbacks.onTransitionComplete).toHaveBeenCalledWith('B');

    backend.destroy();
  });

  it('sends linear volume directly without distortion or unwanted pre-curves', async () => {
    const backend = new NativeAudioBackend(callbacks);

    await backend.setVolume(0.75);
    expect(sendMock).toHaveBeenCalledWith({
      cmd: 'set_volume',
      volume: 0.75
    });

    await backend.setVolume(1.5); // clamps to 1.0
    expect(sendMock).toHaveBeenCalledWith({
      cmd: 'set_volume',
      volume: 1.0
    });

    await backend.setVolume(-0.2); // clamps to 0.0
    expect(sendMock).toHaveBeenCalledWith({
      cmd: 'set_volume',
      volume: 0.0
    });

    backend.destroy();
  });

  it('dispatches set_dsp command with karaoke toggle to daemon', async () => {
    const backend = new NativeAudioBackend(callbacks);

    await backend.setDsp({ karaoke: true });
    expect(sendMock).toHaveBeenCalledWith({
      cmd: 'set_dsp',
      bypass: false,
      rg_db: 0.0,
      karaoke: true,
      limiter: true
    });

    await backend.setDsp({ karaoke: false });
    expect(sendMock).toHaveBeenCalledWith({
      cmd: 'set_dsp',
      bypass: false,
      rg_db: 0.0,
      karaoke: false,
      limiter: true
    });

    backend.destroy();
  });

  it('forwards device_error push events to onError callback (Gate D)', () => {
    const backend = new NativeAudioBackend(callbacks);

    eventHandler!({
      event: 'device_error',
      message: 'Audio output device disconnected or failed'
    });

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Audio output device disconnected or failed'
      })
    );

    backend.destroy();
  });

  it('dispatches set_sound_profile command to daemon', async () => {
    const backend = new NativeAudioBackend(callbacks);
    sendMock.mockResolvedValueOnce({
      id: 1,
      status: 'ok',
      data: {
        profile: 'vocal_nuance_boost',
        status: 'active',
        boot_id: 1,
        sequence_id: 1
      }
    });

    await backend.setSoundProfile('vocal_nuance_boost');
    expect(sendMock).toHaveBeenCalledWith({
      cmd: 'set_sound_profile',
      profile: 'vocal_nuance_boost'
    });

    backend.destroy();
  });

  it('filters sound_profile_changed events by boot epoch and sequence ordering', () => {
    const backend = new NativeAudioBackend(callbacks);

    // Initial ready event setting boot epoch 2
    eventHandler!({
      event: 'ready',
      protocol_version: 1,
      engine_version: '0.1.0',
      boot_id: 2
    } as any);

    // 1. Stale boot epoch event (boot_id: 1) should be dropped
    eventHandler!({
      event: 'sound_profile_changed',
      profile: 'vocal_nuance_boost',
      status: 'active',
      boot_id: 1,
      sequence_id: 10
    } as any);
    expect(callbacks.onSoundProfileChange).not.toHaveBeenCalled();

    // 2. In-order event in boot epoch 2 (sequence_id: 1) should be accepted
    eventHandler!({
      event: 'sound_profile_changed',
      profile: 'vocal_nuance_boost',
      status: 'active',
      boot_id: 2,
      sequence_id: 1
    } as any);
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledWith('vocal_nuance_boost', 'active');
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledTimes(1);

    // 3. Duplicate/out-of-order sequence_id in same epoch should be rejected
    eventHandler!({
      event: 'sound_profile_changed',
      profile: 'studio_reference',
      status: 'active',
      boot_id: 2,
      sequence_id: 1
    } as any);
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledTimes(1);

    // 4. Newer sequence_id in same epoch should be accepted
    eventHandler!({
      event: 'sound_profile_changed',
      profile: 'studio_reference',
      status: 'active',
      boot_id: 2,
      sequence_id: 2
    } as any);
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledWith('studio_reference', 'active');
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledTimes(2);

    // 5. Higher boot epoch resets sequence requirement and is accepted
    eventHandler!({
      event: 'sound_profile_changed',
      profile: 'vocal_nuance_boost',
      status: 'active',
      boot_id: 3,
      sequence_id: 1
    } as any);
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledWith('vocal_nuance_boost', 'active');
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledTimes(3);

    backend.destroy();
  });

  it('reconciles timeout or error on setSoundProfile via authoritative getState query', async () => {
    const backend = new NativeAudioBackend(callbacks);

    // sendMock rejects on set_sound_profile, then resolves with getState
    sendMock
      .mockRejectedValueOnce(
        new Error('Timeout after 2000ms waiting for response to set_sound_profile')
      )
      .mockResolvedValueOnce({
        id: 2,
        status: 'ok',
        data: {
          active_slot: 'a',
          slot_a_state: 'stopped',
          slot_b_state: 'stopped',
          device_id: null,
          xrun_count: 0,
          sound_profile: 'vocal_nuance_boost',
          sound_profile_status: 'active'
        }
      });

    const result = await backend.setSoundProfile('vocal_nuance_boost');

    // Should have queried get_state for reconciliation
    expect(sendMock).toHaveBeenCalledWith({ cmd: 'get_state' });
    // Should have reconciled profile from daemon state
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledWith('vocal_nuance_boost', 'active');
    expect(result.profile).toBe('vocal_nuance_boost');

    backend.destroy();
  });
});
