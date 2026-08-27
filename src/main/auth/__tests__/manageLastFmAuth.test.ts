import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import manageLastFmAuth from '../manageLastFmAuth';

vi.mock('@main/db/db', () => ({
  db: {}
}));

const mockGetUserSettings = vi.fn();
const mockSaveUserSettings = vi.fn().mockResolvedValue(undefined);
vi.mock('@main/db/queries/settings', () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  saveUserSettings: (...args: unknown[]) => mockSaveUserSettings(...args)
}));
vi.mock('../../db/queries/settings', () => ({
  getUserSettings: (...args: unknown[]) => mockGetUserSettings(...args),
  saveUserSettings: (...args: unknown[]) => mockSaveUserSettings(...args)
}));

const mockClearScrobbleQueue = vi.fn().mockResolvedValue(undefined);
vi.mock('@main/db/queries/scrobble_queue', () => ({
  clearScrobbleQueue: (...args: unknown[]) => mockClearScrobbleQueue(...args)
}));
vi.mock('../../db/queries/scrobble_queue', () => ({
  clearScrobbleQueue: (...args: unknown[]) => mockClearScrobbleQueue(...args)
}));

const mockFlushScrobbleQueue = vi.fn().mockResolvedValue(undefined);
const mockInvalidateLastFmSession = vi.fn();
vi.mock('@main/other/lastFm/flushScrobbleQueue', () => ({
  flushScrobbleQueue: (...args: unknown[]) => mockFlushScrobbleQueue(...args),
  invalidateLastFmSession: (...args: unknown[]) => mockInvalidateLastFmSession(...args)
}));
vi.mock('../../other/lastFm/flushScrobbleQueue', () => ({
  flushScrobbleQueue: (...args: unknown[]) => mockFlushScrobbleQueue(...args),
  invalidateLastFmSession: (...args: unknown[]) => mockInvalidateLastFmSession(...args)
}));

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));
vi.mock('../../main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));
vi.mock('../main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

vi.mock('@main/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn()
  }
}));
vi.mock('../logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn()
  }
}));

vi.mock('../utils/safeStorage', () => ({
  encrypt: vi.fn((key: string) => `encrypted_${key}`)
}));

vi.mock('@main/utils/safeStorage', () => ({
  encrypt: vi.fn((key: string) => `encrypted_${key}`)
}));

describe('manageLastFmAuth Account Isolation & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MAIN_VITE_LAST_FM_API_KEY', 'test_api_key');
    vi.stubEnv('MAIN_VITE_LAST_FM_SHARED_SECRET', 'test_shared_secret');
    vi.stubEnv('MAIN_VITE_ENCRYPTION_SECRET', 'nora_test_secret_key_1234567890123456');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('wipes scrobble queue when switching from User A to User B', async () => {
    mockGetUserSettings.mockResolvedValue({
      lastFmSessionName: 'UserA',
      lastFmSessionKey: 'encrypted_session_key_user_a'
    });

    // Mock fetch returning User B session
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            name: 'UserB',
            key: 'session_key_user_b'
          }
        }),
        { status: 200 }
      )
    );

    await manageLastFmAuth('mock_token');

    // In-flight session MUST be invalidated and queue cleared before saving User B credentials
    expect(mockInvalidateLastFmSession).toHaveBeenCalledTimes(1);
    expect(mockClearScrobbleQueue).toHaveBeenCalledTimes(1);
    expect(mockSaveUserSettings).toHaveBeenCalledWith({
      lastFmSessionName: 'UserB',
      lastFmSessionKey: 'encrypted_session_key_user_b'
    });
    expect(mockFlushScrobbleQueue).toHaveBeenCalledTimes(1);
  });

  it('preserves scrobble queue when re-authenticating the same account', async () => {
    mockGetUserSettings.mockResolvedValue({
      lastFmSessionName: 'UserA',
      lastFmSessionKey: 'encrypted_session_key_user_a'
    });

    // Mock fetch returning same User A session
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            name: 'UserA',
            key: 'session_key_user_a'
          }
        }),
        { status: 200 }
      )
    );

    await manageLastFmAuth('mock_token');

    // Queue and session MUST NOT be invalidated when re-authenticating the same account
    expect(mockInvalidateLastFmSession).not.toHaveBeenCalled();
    expect(mockClearScrobbleQueue).not.toHaveBeenCalled();
    expect(mockSaveUserSettings).toHaveBeenCalledWith({
      lastFmSessionName: 'UserA',
      lastFmSessionKey: 'encrypted_session_key_user_a'
    });
  });

  it('preserves scrobble queue when re-authenticating same account with a renewed session key', async () => {
    mockGetUserSettings.mockResolvedValue({
      lastFmSessionName: 'UserA',
      lastFmSessionKey: 'encrypted_old_session_key'
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            name: 'UserA',
            key: 'new_session_key'
          }
        }),
        { status: 200 }
      )
    );

    await manageLastFmAuth('mock_token');

    // Same username -> queue preserved, new encrypted session key saved
    expect(mockClearScrobbleQueue).not.toHaveBeenCalled();
    expect(mockSaveUserSettings).toHaveBeenCalledWith({
      lastFmSessionName: 'UserA',
      lastFmSessionKey: 'encrypted_new_session_key'
    });
    expect(mockFlushScrobbleQueue).toHaveBeenCalledTimes(1);
  });
});
