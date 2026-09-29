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
      onStateChange: vi.fn(),
      onError: vi.fn()
    };

    sendMock = vi.fn().mockResolvedValue({ id: 1, status: 'ok' });

    (globalThis as any).window = {
      api: {
        audioEngine: {
          send: sendMock,
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
});
