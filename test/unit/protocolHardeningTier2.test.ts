// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-5 (trimmed): timeout classification, pre-ready/boot epoch gates,
// reconciliation honesty. No protocol changes.

import { NativeAudioBackend } from '@renderer/other/nativeAudioBackend';

describe('T2-5 protocol hardening', () => {
  let send: any;
  let emitEvent: ((e: any) => void) | null;
  let callbacks: any;

  beforeEach(() => {
    send = vi.fn();
    emitEvent = null;
    callbacks = {
      onTimeUpdate: vi.fn(),
      onDurationChange: vi.fn(),
      onStateChange: vi.fn(),
      onTrackEnd: vi.fn(),
      onSlotEnd: vi.fn(),
      onTransitionComplete: vi.fn(),
      onSoundProfileChange: vi.fn(),
      onError: vi.fn()
    };
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.api = {
      audioEngine: {
        send: (...args: any[]) => send(...args),
        onEvent: (cb: any) => {
          emitEvent = cb;
          return () => {
            emitEvent = null;
          };
        }
      },
      audioLibraryControls: { getSong: vi.fn() }
    };
    (globalThis as any).requestAnimationFrame = () => 1;
    (globalThis as any).cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeBackend() {
    return new NativeAudioBackend(callbacks);
  }

  it("errors merely containing 'time' are not treated as timeouts", async () => {
    const backend = makeBackend();
    send.mockRejectedValueOnce(new Error('PrimeTime decode error'));
    await expect(backend.setSoundProfile('vocal_nuance_boost' as any)).rejects.toThrow(
      'PrimeTime decode error'
    );
    // No getState reconcile attempt: only the one failed send.
    expect(send).toHaveBeenCalledTimes(1);
    expect(callbacks.onSoundProfileChange).not.toHaveBeenCalled();
    backend.destroy();
  });

  it('profile events before ready (or boot 0) are dropped', () => {
    const backend = makeBackend();
    emitEvent!({ event: 'sound_profile_changed', profile: 'vocal_nuance_boost', status: 'active', boot_id: 7, sequence_id: 1 });
    expect(callbacks.onSoundProfileChange).not.toHaveBeenCalled();
    emitEvent!({ event: 'ready', boot_id: 7 });
    emitEvent!({ event: 'sound_profile_changed', profile: 'vocal_nuance_boost', status: 'active', boot_id: 0, sequence_id: 0 });
    expect(callbacks.onSoundProfileChange).not.toHaveBeenCalled();
    // Genuine post-ready event still flows.
    emitEvent!({ event: 'sound_profile_changed', profile: 'vocal_nuance_boost', status: 'active', boot_id: 7, sequence_id: 1 });
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledTimes(1);
    backend.destroy();
  });

  it('timeout reconcile reports ramp honestly and never regresses the epoch', async () => {
    const backend = makeBackend();
    emitEvent!({ event: 'ready', boot_id: 5 });
    emitEvent!({ event: 'sound_profile_changed', profile: 'studio_reference', status: 'active', boot_id: 5, sequence_id: 4 });
    send.mockRejectedValueOnce(new Error('timed out waiting for response to command set_sound_profile (id: 3, 5000ms)'));
    // State omits sequence_id and reports a mid-ramp status.
    send.mockResolvedValueOnce({
      status: 'ok',
      data: { sound_profile: 'vocal_nuance_boost', sound_profile_status: 'transitioning', boot_id: 5 }
    });
    const res = await backend.setSoundProfile('vocal_nuance_boost' as any);
    expect(res.transition_ms).toBe(30);
    expect(res.profile).toBe('vocal_nuance_boost');
    // Epoch preserved, not reset to 0.
    expect(backend.sequenceId).toBe(4);
    expect(callbacks.onSoundProfileChange).toHaveBeenCalledWith('vocal_nuance_boost', 'transitioning');
    backend.destroy();
  });

  it('empty reconcile state signals once and rethrows', async () => {
    const backend = makeBackend();
    send.mockRejectedValueOnce(new Error('timed out'));
    send.mockResolvedValueOnce({ status: 'ok', data: {} });
    await expect(backend.setSoundProfile('vocal_nuance_boost' as any)).rejects.toThrow('timed out');
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    backend.destroy();
  });
});
